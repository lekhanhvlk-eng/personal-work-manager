import { todayVN, toVNDate } from '../lib/dates'
import { storage } from '../lib/storage'
import type {
  BackupFile,
  DataSnapshot,
  ImportResult,
  Report,
  ReportEvent,
  Task,
  TaskInput,
  TaskSnapshot,
  TeamMember,
  TeamMemberInput,
} from '../lib/types'
import { uuid } from '../lib/uuid'
import { RepoError } from './errors'
import { pickTaskInput, type ExportRequest, type Repository } from './repository'

export const DEMO_DB_KEY = 'pwm:demo:db'

const empty = (): DataSnapshot => ({ tasks: [], members: [], reports: [], events: [] })

/**
 * Kho dữ liệu cục bộ cho "Chế độ dùng thử" (không cần Supabase).
 * Mô phỏng đúng các quy tắc của máy chủ: xuất báo cáo nguyên tử theo ID,
 * chống xuất trùng, idempotent theo requestId, báo cáo bất biến, khôi phục có ghi sự kiện.
 * Mọi thao tác đọc–kiểm tra–ghi diễn ra đồng bộ trong một lượt JS nên không thể xen kẽ.
 */
export class LocalRepository implements Repository {
  readonly mode = 'demo' as const
  private listeners = new Set<() => void>()
  private onStorage = (e: StorageEvent) => {
    if (e.key === this.key) this.listeners.forEach((l) => l())
  }

  constructor(
    private readonly key: string = DEMO_DB_KEY,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private load(): DataSnapshot {
    return { ...empty(), ...storage.get<DataSnapshot>(this.key, empty()) }
  }

  private save(db: DataSnapshot): void {
    if (!storage.set(this.key, db)) throw new RepoError('UNKNOWN', 'Bộ nhớ thiết bị đã đầy, không thể lưu dữ liệu.')
  }

  private now(): string {
    return this.clock().toISOString()
  }

  async fetchAll(): Promise<DataSnapshot> {
    return structuredClone(this.load())
  }

  async createTask(task: Task): Promise<Task> {
    const db = this.load()
    const existing = db.tasks.find((t) => t.id === task.id)
    if (existing) return structuredClone(existing) // idempotent khi gửi lại
    this.assertMember(db, task.team_member_id)
    const row: Task = {
      ...task,
      description: task.description.trim(),
      work_date: task.work_date || todayVN(this.clock()),
      report_status: 'unreported',
      report_id: null,
      reported_at: null,
      updated_at: this.now(),
    }
    if (!row.description) throw new RepoError('UNKNOWN', 'Nội dung công việc không được để trống.')
    db.tasks.push(row)
    this.save(db)
    return structuredClone(row)
  }

  async updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
    const db = this.load()
    const t = db.tasks.find((x) => x.id === id)
    if (!t) throw new RepoError('TASK_NOT_FOUND')
    const safe = pickTaskInput(patch)
    if ('team_member_id' in safe) this.assertMember(db, safe.team_member_id ?? null)
    Object.assign(t, safe, { updated_at: this.now() })
    this.save(db)
    return structuredClone(t)
  }

  async deleteTask(id: string): Promise<void> {
    const db = this.load()
    db.tasks = db.tasks.filter((t) => t.id !== id)
    this.save(db)
  }

  async createMember(member: TeamMember): Promise<TeamMember> {
    const db = this.load()
    const existing = db.members.find((m) => m.id === member.id)
    if (existing) return structuredClone(existing)
    const row = { ...member, updated_at: this.now() }
    db.members.push(row)
    this.save(db)
    return structuredClone(row)
  }

  async updateMember(id: string, patch: Partial<TeamMemberInput>): Promise<TeamMember> {
    const db = this.load()
    const m = db.members.find((x) => x.id === id)
    if (!m) throw new RepoError('UNKNOWN', 'Không tìm thấy thành viên.')
    const { name, role, phone, note, archived } = patch
    Object.assign(
      m,
      Object.fromEntries(Object.entries({ name, role, phone, note, archived }).filter(([, v]) => v !== undefined)),
      { updated_at: this.now() },
    )
    this.save(db)
    return structuredClone(m)
  }

  async confirmExport(req: ExportRequest): Promise<Report> {
    if (!req.requestId) throw new RepoError('UNKNOWN', 'Thiếu mã yêu cầu.')
    const ids = [...new Set(req.taskIds.filter(Boolean))].sort()
    if (ids.length === 0) throw new RepoError('NO_TASKS_SELECTED')
    if (!req.content.trim()) throw new RepoError('EMPTY_CONTENT')

    // ---- Bắt đầu vùng nguyên tử (không có await) ----
    const db = this.load()
    const existing = db.reports.find((r) => r.request_id === req.requestId)
    if (existing) {
      if ([...existing.task_ids].sort().join() === ids.join()) return structuredClone(existing)
      throw new RepoError('REQUEST_ID_CONFLICT')
    }
    const tasks = db.tasks.filter((t) => ids.includes(t.id))
    if (tasks.length !== ids.length) throw new RepoError('TASK_NOT_FOUND')
    const already = tasks.filter((t) => t.report_status !== 'unreported')
    if (already.length) throw new RepoError('TASK_ALREADY_REPORTED', undefined, already.map((t) => t.id).join(','))

    const now = this.clock()
    const prefix = `BC-${toVNDate(now).replace(/-/g, '')}-`
    const seq =
      db.reports
        .filter((r) => r.code.startsWith(prefix))
        .map((r) => Number(r.code.slice(prefix.length)) || 0)
        .reduce((a, b) => Math.max(a, b), 0) + 1
    const memberName = new Map(db.members.map((m) => [m.id, m.name]))
    const sorted = [...tasks].sort(
      (a, b) =>
        a.work_date.localeCompare(b.work_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    )
    const snapshot: TaskSnapshot[] = sorted.map((t) => ({
      id: t.id,
      description: t.description,
      work_date: t.work_date,
      category: t.category,
      status: t.status,
      priority: t.priority,
      assignment_type: t.assignment_type,
      team_member_id: t.team_member_id,
      team_member_name: t.team_member_id ? (memberName.get(t.team_member_id) ?? null) : null,
      notes: t.notes,
      due_date: t.due_date,
      created_at: t.created_at,
    }))
    const ts = now.toISOString()
    const report: Report = {
      id: uuid(),
      code: `${prefix}${String(seq).padStart(3, '0')}`,
      request_id: req.requestId,
      status: 'confirmed',
      content: req.content,
      task_ids: ids,
      task_count: ids.length,
      date_from: sorted[0].work_date,
      date_to: sorted[sorted.length - 1].work_date,
      task_snapshot: snapshot,
      exported_at: ts,
      created_at: ts,
    }
    db.reports.push(report)
    for (const t of tasks) {
      t.report_status = 'reported'
      t.report_id = report.id
      t.reported_at = ts
      t.updated_at = ts
    }
    db.events.push({
      id: uuid(),
      report_id: report.id,
      task_id: null,
      event_type: 'exported',
      note: null,
      created_at: ts,
    })
    this.save(db)
    // ---- Kết thúc vùng nguyên tử ----
    return structuredClone(report)
  }

  async restoreTask(taskId: string, note: string | null): Promise<Task> {
    const db = this.load()
    const t = db.tasks.find((x) => x.id === taskId)
    if (!t) throw new RepoError('TASK_NOT_FOUND')
    if (t.report_status !== 'reported') throw new RepoError('TASK_NOT_REPORTED')
    const ts = this.now()
    if (t.report_id) {
      const ev: ReportEvent = {
        id: uuid(),
        report_id: t.report_id,
        task_id: t.id,
        event_type: 'task_restored',
        note: note?.trim() || null,
        created_at: ts,
      }
      db.events.push(ev)
    }
    t.report_status = 'unreported'
    t.report_id = null
    t.reported_at = null
    t.updated_at = ts
    this.save(db)
    return structuredClone(t)
  }

  async importBackup(backup: BackupFile): Promise<ImportResult> {
    const db = this.load()
    const result: ImportResult = { team_members: 0, tasks: 0, reports: 0, report_events: 0, skipped: 0 }
    const has = <T extends { id: string }>(list: T[], id: string) => list.some((x) => x.id === id)
    for (const m of backup.team_members) {
      if (has(db.members, m.id)) result.skipped++
      else (db.members.push(structuredClone(m)), result.team_members++)
    }
    for (const r of backup.reports) {
      if (has(db.reports, r.id) || db.reports.some((x) => x.code === r.code)) result.skipped++
      else (db.reports.push(structuredClone(r)), result.reports++)
    }
    for (const t of backup.tasks) {
      if (has(db.tasks, t.id)) {
        result.skipped++
        continue
      }
      const row = structuredClone(t)
      if (row.team_member_id && !has(db.members, row.team_member_id)) row.team_member_id = null
      if (row.report_status !== 'reported')
        Object.assign(row, { report_status: 'unreported', report_id: null, reported_at: null })
      else if (row.report_id && !has(db.reports, row.report_id)) row.report_id = null
      db.tasks.push(row)
      result.tasks++
    }
    for (const e of backup.report_events) {
      if (has(db.events, e.id) || !has(db.reports, e.report_id)) result.skipped++
      else (db.events.push(structuredClone(e)), result.report_events++)
    }
    this.save(db)
    return result
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange)
    if (this.listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', this.onStorage)
    return () => {
      this.listeners.delete(onChange)
      if (this.listeners.size === 0 && typeof window !== 'undefined')
        window.removeEventListener('storage', this.onStorage)
    }
  }

  /** Chỉ dùng trong chế độ dùng thử: xoá toàn bộ dữ liệu cục bộ. */
  reset(): void {
    storage.remove(this.key)
    this.listeners.forEach((l) => l())
  }

  private assertMember(db: DataSnapshot, memberId: string | null | undefined): void {
    if (memberId && !db.members.some((m) => m.id === memberId)) throw new RepoError('INVALID_TEAM_MEMBER')
  }
}
