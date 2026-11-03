import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type {
  BackupFile,
  DataSnapshot,
  ImportResult,
  Report,
  ReportEvent,
  Task,
  TaskInput,
  TeamMember,
  TeamMemberInput,
} from '../lib/types'
import { RepoError, toRepoError } from './errors'
import { pickTaskInput, type ExportRequest, type Repository } from './repository'

const PAGE = 1000

/** Kho dữ liệu đám mây (Supabase PostgreSQL + RLS). */
export class SupabaseRepository implements Repository {
  readonly mode = 'cloud' as const

  constructor(
    private readonly sb: SupabaseClient,
    private readonly userId: string,
  ) {}

  private async fetchTable<T>(table: string, order: string): Promise<T[]> {
    const rows: T[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb
        .from(table)
        .select('*')
        .order(order, { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw toRepoError(error)
      rows.push(...((data ?? []) as T[]))
      if (!data || data.length < PAGE) break
    }
    return rows
  }

  async fetchAll(): Promise<DataSnapshot> {
    try {
      const [tasks, members, reports, events] = await Promise.all([
        this.fetchTable<Task>('tasks', 'created_at'),
        this.fetchTable<TeamMember>('team_members', 'created_at'),
        this.fetchTable<Report>('reports', 'exported_at'),
        this.fetchTable<ReportEvent>('report_events', 'created_at'),
      ])
      return { tasks, members, reports, events }
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async createTask(task: Task): Promise<Task> {
    const payload = {
      id: task.id,
      ...pickTaskInput(task),
      created_at: task.created_at,
    }
    try {
      const { data, error } = await this.sb.from('tasks').insert(payload).select().single()
      if (error) {
        // Gửi lại sau khi máy chủ đã lưu (mất phản hồi): coi như thành công.
        if (error.code === '23505') return await this.getTask(task.id)
        throw error
      }
      return data as Task
    } catch (e) {
      throw toRepoError(e)
    }
  }

  private async getTask(id: string): Promise<Task> {
    const { data, error } = await this.sb.from('tasks').select('*').eq('id', id).single()
    if (error) throw toRepoError(error)
    return data as Task
  }

  async updateTask(id: string, patch: Partial<TaskInput>): Promise<Task> {
    try {
      const { data, error } = await this.sb.from('tasks').update(pickTaskInput(patch)).eq('id', id).select().single()
      if (error) throw error
      return data as Task
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      const { error } = await this.sb.from('tasks').delete().eq('id', id)
      if (error) throw error
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async createMember(member: TeamMember): Promise<TeamMember> {
    const { id, name, role, phone, note, archived, created_at } = member
    try {
      const { data, error } = await this.sb
        .from('team_members')
        .insert({ id, name, role, phone, note, archived, created_at })
        .select()
        .single()
      if (error) {
        if (error.code === '23505') {
          const r = await this.sb.from('team_members').select('*').eq('id', id).single()
          if (r.error) throw r.error
          return r.data as TeamMember
        }
        throw error
      }
      return data as TeamMember
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async updateMember(id: string, patch: Partial<TeamMemberInput>): Promise<TeamMember> {
    const { name, role, phone, note, archived } = patch
    const body = Object.fromEntries(
      Object.entries({ name, role, phone, note, archived }).filter(([, v]) => v !== undefined),
    )
    try {
      const { data, error } = await this.sb.from('team_members').update(body).eq('id', id).select().single()
      if (error) throw error
      return data as TeamMember
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async confirmExport(req: ExportRequest): Promise<Report> {
    try {
      const { data, error } = await this.sb.rpc('confirm_report_export', {
        p_request_id: req.requestId,
        p_task_ids: req.taskIds,
        p_content: req.content,
      })
      if (error) throw error
      if (!data) throw new RepoError('UNKNOWN', 'Máy chủ không trả về báo cáo.')
      return data as Report
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async restoreTask(taskId: string, note: string | null): Promise<Task> {
    try {
      const { data, error } = await this.sb.rpc('restore_task_to_unreported', { p_task_id: taskId, p_note: note })
      if (error) throw error
      return data as Task
    } catch (e) {
      throw toRepoError(e)
    }
  }

  async importBackup(backup: BackupFile): Promise<ImportResult> {
    try {
      const { data, error } = await this.sb.rpc('import_backup', { p_payload: backup })
      if (error) throw error
      return data as ImportResult
    } catch (e) {
      throw toRepoError(e)
    }
  }

  subscribe(onChange: () => void): () => void {
    const filter = `user_id=eq.${this.userId}`
    const channel: RealtimeChannel = this.sb.channel(`pwm-sync-${this.userId}`)
    for (const table of ['tasks', 'team_members', 'reports', 'report_events']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => onChange())
    }
    channel.subscribe()
    return () => {
      void this.sb.removeChannel(channel)
    }
  }
}
