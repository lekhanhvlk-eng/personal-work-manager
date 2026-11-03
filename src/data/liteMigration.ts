import { storage } from '../lib/storage'
import type { DataSnapshot, Report, Task, TaskSnapshot } from '../lib/types'
import { DEMO_DB_KEY } from './localRepository'

const LITE_KEY = 'tlcv:v1'

interface LiteTask {
  id: string
  text: string
  date: string
  status: 'done' | 'doing'
  createdAt: string
  reportId: string | null
}
interface LiteReport {
  id: string
  code: string
  createdAt: string
  taskIds: string[]
  content: string
}

/**
 * Chuyển dữ liệu từ bản gọn trước đây (cùng link) sang ứng dụng đầy đủ.
 * Chỉ chạy một lần, khi kho mới còn trống; dữ liệu cũ được giữ lại dưới khoá dự phòng.
 */
export function migrateLiteData(): number {
  const lite = storage.get<{ tasks?: LiteTask[]; reports?: LiteReport[] } | null>(LITE_KEY, null)
  if (!lite || !Array.isArray(lite.tasks) || lite.tasks.length === 0) return 0
  const current = storage.get<DataSnapshot | null>(DEMO_DB_KEY, null)
  if (current && current.tasks?.length) return 0

  const tasks: Task[] = lite.tasks
    .filter((t) => t && t.id && t.text)
    .map((t) => ({
      id: t.id,
      description: t.text,
      work_date: t.date,
      category: 'other',
      status: t.status === 'doing' ? 'in_progress' : 'done',
      priority: null,
      assignment_type: 'self',
      team_member_id: null,
      notes: null,
      due_date: null,
      report_status: t.reportId ? 'reported' : 'unreported',
      report_id: t.reportId ?? null,
      reported_at: t.reportId ? (lite.reports?.find((r) => r.id === t.reportId)?.createdAt ?? t.createdAt) : null,
      created_at: t.createdAt,
      updated_at: t.createdAt,
    }))
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const reports: Report[] = (lite.reports ?? []).map((r) => {
    const snap: TaskSnapshot[] = r.taskIds
      .map((id) => byId.get(id))
      .filter((t): t is Task => Boolean(t))
      .map((t) => ({ ...t, team_member_name: null }))
    const dates = snap.map((s) => s.work_date).sort()
    return {
      id: r.id,
      code: r.code,
      request_id: r.id,
      status: 'confirmed',
      content: r.content,
      task_ids: r.taskIds,
      task_count: r.taskIds.length,
      date_from: dates[0] ?? r.createdAt.slice(0, 10),
      date_to: dates[dates.length - 1] ?? r.createdAt.slice(0, 10),
      task_snapshot: snap,
      exported_at: r.createdAt,
      created_at: r.createdAt,
    }
  })
  const events = reports.map((r) => ({
    id: `${r.id}-exported`,
    report_id: r.id,
    task_id: null,
    event_type: 'exported' as const,
    note: null,
    created_at: r.exported_at,
  }))
  storage.set(DEMO_DB_KEY, { tasks, members: current?.members ?? [], reports, events })
  storage.set(`${LITE_KEY}:migrated`, lite)
  storage.remove(LITE_KEY)
  return tasks.length
}
