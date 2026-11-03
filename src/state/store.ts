import { storage } from '../lib/storage'
import type {
  BackupFile,
  DataSnapshot,
  ImportResult,
  Report,
  Task,
  TaskInput,
  TeamMember,
  TeamMemberInput,
} from '../lib/types'
import { uuid } from '../lib/uuid'
import { newMember, newTask } from '../data/factory'
import { RepoError, isNetworkError, toRepoError } from '../data/errors'
import { pickTaskInput, type ExportRequest, type Repository } from '../data/repository'
import { applyExport, rebase, upsertById, type Mutation } from './mutations'

export interface StoreState {
  /** Đã có dữ liệu để hiển thị (từ bộ nhớ đệm hoặc máy chủ). */
  ready: boolean
  data: DataSnapshot
  pending: Mutation[]
  online: boolean
  syncing: boolean
  lastSyncedAt: string | null
  loadError: string | null
}

export type ErrorListener = (message: string) => void

const EMPTY: DataSnapshot = { tasks: [], members: [], reports: [], events: [] }

interface StoreOptions {
  /** Thời gian chờ thử lại khi mất mạng (ms). */
  retryDelays?: number[]
  /** Có gắn sự kiện window (online/offline/visibility) hay không. */
  attachWindowEvents?: boolean
}

/**
 * Kho trạng thái ứng dụng với đồng bộ "offline-first":
 *  - base: trạng thái đã xác nhận từ máy chủ (được lưu đệm trên thiết bị)
 *  - pending: hàng đợi thay đổi chưa gửi (outbox, lưu bền)
 *  - data hiển thị = base + pending (áp dụng lạc quan)
 * Thao tác xuất/khôi phục báo cáo KHÔNG đưa vào hàng đợi: bắt buộc trực tuyến và chỉ báo
 * thành công sau khi máy chủ đã commit.
 */
export class AppStore {
  private state: StoreState
  private base: DataSnapshot = EMPTY
  private listeners = new Set<() => void>()
  private errorListeners = new Set<ErrorListener>()
  private flushing: Promise<void> | null = null
  private refreshing: Promise<void> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private refreshTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private unsubscribeRepo: (() => void) | null = null
  private disposers: (() => void)[] = []
  private readonly retryDelays: number[]

  constructor(
    public readonly repo: Repository,
    public readonly scope: string,
    private readonly options: StoreOptions = {},
  ) {
    this.retryDelays = options.retryDelays ?? [3000, 10000, 30000, 60000]
    const cached = storage.get<DataSnapshot | null>(this.key('base'), null)
    const pending = storage.get<Mutation[]>(this.key('outbox'), [])
    this.base = cached ? { ...EMPTY, ...cached } : EMPTY
    this.state = {
      ready: Boolean(cached),
      data: rebase(this.base, pending),
      pending,
      online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
      syncing: false,
      lastSyncedAt: storage.get<string | null>(this.key('syncedAt'), null),
      loadError: null,
    }
  }

  private key(name: string) {
    return `pwm:${this.scope}:${name}`
  }

  // ------------------------------------------------------------------ cơ bản
  getState = (): StoreState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  private set(patch: Partial<StoreState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private emitError(message: string) {
    this.errorListeners.forEach((l) => l(message))
  }

  private commit(pending: Mutation[] = this.state.pending, extra: Partial<StoreState> = {}) {
    storage.set(this.key('base'), this.base)
    storage.set(this.key('outbox'), pending)
    this.set({ data: rebase(this.base, pending), pending, ...extra })
  }

  // ------------------------------------------------------------------ vòng đời
  async start(): Promise<void> {
    this.unsubscribeRepo = this.repo.subscribe(() => this.scheduleRefresh(400))
    if (this.options.attachWindowEvents !== false && typeof window !== 'undefined') {
      const online = () => {
        this.set({ online: true })
        this.retryCount = 0
        void this.sync()
      }
      const offline = () => this.set({ online: false })
      const visible = () => {
        if (document.visibilityState === 'visible') void this.sync()
      }
      window.addEventListener('online', online)
      window.addEventListener('offline', offline)
      document.addEventListener('visibilitychange', visible)
      this.disposers.push(
        () => window.removeEventListener('online', online),
        () => window.removeEventListener('offline', offline),
        () => document.removeEventListener('visibilitychange', visible),
      )
    }
    await this.sync()
  }

  dispose(): void {
    this.unsubscribeRepo?.()
    this.disposers.forEach((d) => d())
    this.disposers = []
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
  }

  /** Gửi hàng đợi rồi tải lại dữ liệu từ máy chủ. */
  async sync(): Promise<void> {
    await this.flush()
    await this.refresh()
  }

  private scheduleRefresh(delay: number) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => void this.refresh(), delay)
  }

  private scheduleRetry() {
    if (this.retryTimer) return
    const delay = this.retryDelays[Math.min(this.retryCount, this.retryDelays.length - 1)]
    this.retryCount++
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.sync()
    }, delay)
  }

  refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    const p = this.doRefresh().finally(() => {
      if (this.refreshing === p) this.refreshing = null
    })
    this.refreshing = p
    return p
  }

  private async doRefresh(): Promise<void> {
    try {
      const server = await this.repo.fetchAll()
      this.base = server
      const now = new Date().toISOString()
      storage.set(this.key('syncedAt'), now)
      this.commit(this.state.pending, {
        ready: true,
        online: true,
        lastSyncedAt: now,
        loadError: null,
      })
    } catch (e) {
      const err = toRepoError(e)
      if (err.code === 'NETWORK') {
        this.set({ online: false, ready: true })
        this.scheduleRetry()
      } else {
        this.set({ ready: true, loadError: err.message })
        this.emitError(err.message)
      }
    }
  }

  flush(): Promise<void> {
    if (this.flushing) return this.flushing
    const p = this.doFlush().finally(() => {
      if (this.flushing === p) this.flushing = null
    })
    this.flushing = p
    return p
  }

  private async doFlush(): Promise<void> {
    this.set({ syncing: this.state.pending.length > 0 })
    try {
      while (this.state.pending.length > 0) {
        const m = this.state.pending[0]
        try {
          await this.execute(m)
          this.retryCount = 0
          this.commit(
            this.state.pending.filter((x) => x.mid !== m.mid),
            { online: true },
          )
        } catch (e) {
          if (isNetworkError(e)) {
            this.set({ online: false })
            this.scheduleRetry()
            return
          }
          const err = toRepoError(e)
          // Lỗi không thể thử lại: bỏ thay đổi này để không chặn hàng đợi.
          this.commit(this.state.pending.filter((x) => x.mid !== m.mid))
          if (!(err.code === 'TASK_NOT_FOUND' && (m.kind === 'updateTask' || m.kind === 'deleteTask'))) {
            this.emitError(`Không thể đồng bộ một thay đổi: ${err.message}`)
          }
        }
      }
    } finally {
      this.set({ syncing: false })
    }
  }

  private async execute(m: Mutation): Promise<void> {
    switch (m.kind) {
      case 'createTask': {
        const row = await this.repo.createTask(m.task)
        this.base = { ...this.base, tasks: upsertById(this.base.tasks, row) }
        return
      }
      case 'updateTask': {
        const row = await this.repo.updateTask(m.id, m.patch)
        this.base = { ...this.base, tasks: upsertById(this.base.tasks, row) }
        return
      }
      case 'deleteTask':
        await this.repo.deleteTask(m.id)
        this.base = {
          ...this.base,
          tasks: this.base.tasks.filter((t) => t.id !== m.id),
        }
        return
      case 'createMember': {
        const row = await this.repo.createMember(m.member)
        this.base = {
          ...this.base,
          members: upsertById(this.base.members, row),
        }
        return
      }
      case 'updateMember': {
        const row = await this.repo.updateMember(m.id, m.patch)
        this.base = {
          ...this.base,
          members: upsertById(this.base.members, row),
        }
        return
      }
    }
  }

  private enqueue(m: Mutation) {
    this.commit([...this.state.pending, m])
    void this.flush()
  }

  // ------------------------------------------------------------------ thao tác công việc
  addTask(input: Partial<TaskInput> & { description: string }): Task {
    const task = newTask(input)
    if (!task.description) throw new RepoError('UNKNOWN', 'Vui lòng nhập nội dung công việc.')
    this.enqueue({ mid: uuid(), kind: 'createTask', task })
    return task
  }

  updateTask(id: string, patch: Partial<TaskInput>): void {
    // Chỉ các trường người dùng được phép sửa — không bao giờ gồm trạng thái báo cáo.
    const safe = pickTaskInput(patch)
    if (safe.description !== undefined) safe.description = safe.description.trim()
    this.enqueue({
      mid: uuid(),
      kind: 'updateTask',
      id,
      patch: safe,
      at: new Date().toISOString(),
    })
  }

  deleteTask(id: string): void {
    this.enqueue({ mid: uuid(), kind: 'deleteTask', id })
  }

  addMember(input: Partial<TeamMemberInput> & { name: string }): TeamMember {
    const member = newMember(input)
    if (!member.name) throw new RepoError('UNKNOWN', 'Vui lòng nhập tên thành viên.')
    this.enqueue({ mid: uuid(), kind: 'createMember', member })
    return member
  }

  updateMember(id: string, patch: Partial<TeamMemberInput>): void {
    this.enqueue({
      mid: uuid(),
      kind: 'updateMember',
      id,
      patch,
      at: new Date().toISOString(),
    })
  }

  // ------------------------------------------------------------------ thao tác trực tuyến bắt buộc
  /** Đảm bảo mọi thay đổi đã lên máy chủ trước thao tác quan trọng. */
  private async requireSynced(): Promise<void> {
    await this.flush()
    if (this.state.pending.length > 0) {
      throw new RepoError(this.state.online ? 'PENDING_SYNC' : 'NETWORK')
    }
  }

  /**
   * Xác nhận xuất báo cáo. Chỉ resolve sau khi máy chủ đã commit giao dịch.
   * Nếu thất bại, KHÔNG có công việc nào bị thay đổi trạng thái.
   */
  async confirmExport(req: ExportRequest): Promise<Report> {
    await this.requireSynced()
    try {
      const report = await this.repo.confirmExport(req)
      this.base = applyExport(this.base, report)
      this.commit(this.state.pending, { online: true })
      void this.refresh()
      return report
    } catch (e) {
      const err = toRepoError(e)
      if (err.code === 'NETWORK') this.set({ online: false })
      else void this.refresh()
      throw err
    }
  }

  async restoreTask(taskId: string, note: string | null): Promise<Task> {
    await this.requireSynced()
    try {
      const task = await this.repo.restoreTask(taskId, note)
      this.base = { ...this.base, tasks: upsertById(this.base.tasks, task) }
      this.commit()
      await this.refresh()
      return task
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async importBackup(backup: BackupFile): Promise<ImportResult> {
    await this.requireSynced()
    const result = await this.repo.importBackup(backup).catch((e) => {
      throw toRepoError(e)
    })
    await this.refresh()
    return result
  }

  /** Xoá bộ nhớ đệm cục bộ (khi đăng xuất). */
  clearLocalCache(): void {
    for (const k of ['base', 'outbox', 'syncedAt']) storage.remove(this.key(k))
  }
}
