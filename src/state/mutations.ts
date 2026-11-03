import type { DataSnapshot, Report, Task, TaskInput, TeamMember, TeamMemberInput } from '../lib/types'

/** Thay đổi đang chờ đồng bộ lên máy chủ (hàng đợi outbox, lưu bền trên thiết bị). */
export type Mutation =
  | { mid: string; kind: 'createTask'; task: Task }
  | { mid: string; kind: 'updateTask'; id: string; patch: Partial<TaskInput>; at: string }
  | { mid: string; kind: 'deleteTask'; id: string }
  | { mid: string; kind: 'createMember'; member: TeamMember }
  | { mid: string; kind: 'updateMember'; id: string; patch: Partial<TeamMemberInput>; at: string }

export function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id)
  if (i === -1) return [...list, row]
  const next = list.slice()
  next[i] = row
  return next
}

/** Áp dụng lạc quan một thay đổi lên dữ liệu (hàm thuần). */
export function applyMutation(data: DataSnapshot, m: Mutation): DataSnapshot {
  switch (m.kind) {
    case 'createTask':
      return { ...data, tasks: upsertById(data.tasks, m.task) }
    case 'updateTask':
      return {
        ...data,
        tasks: data.tasks.map((t) => (t.id === m.id ? { ...t, ...m.patch, updated_at: m.at } : t)),
      }
    case 'deleteTask':
      return { ...data, tasks: data.tasks.filter((t) => t.id !== m.id) }
    case 'createMember':
      return { ...data, members: upsertById(data.members, m.member) }
    case 'updateMember':
      return {
        ...data,
        members: data.members.map((x) => (x.id === m.id ? { ...x, ...m.patch, updated_at: m.at } : x)),
      }
  }
}

export function rebase(base: DataSnapshot, pending: Mutation[]): DataSnapshot {
  return pending.reduce(applyMutation, base)
}

/** Ghi nhận kết quả xuất báo cáo đã commit vào dữ liệu cục bộ. */
export function applyExport(data: DataSnapshot, report: Report): DataSnapshot {
  const ids = new Set(report.task_ids)
  return {
    ...data,
    reports: upsertById(data.reports, report),
    tasks: data.tasks.map((t) =>
      ids.has(t.id) ? { ...t, report_status: 'reported', report_id: report.id, reported_at: report.exported_at } : t,
    ),
  }
}
