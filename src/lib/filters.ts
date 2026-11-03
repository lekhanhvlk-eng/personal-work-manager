import { endOfMonth, endOfWeek, startOfMonth, startOfWeek, todayVN } from './dates'
import type { CategoryKey, ISODate, ReportStatus, Task, TaskStatus, TeamMember } from './types'

export type DateRangeKey = 'today' | 'week' | 'month' | 'all'

export interface TaskFilter {
  range: DateRangeKey
  date: ISODate | null
  keyword: string
  category: CategoryKey | null
  memberId: string | null
  status: TaskStatus | null
  reportStatus: ReportStatus | null
}

export const EMPTY_FILTER: TaskFilter = {
  range: 'all',
  date: null,
  keyword: '',
  category: null,
  memberId: null,
  status: null,
  reportStatus: null,
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
export function foldVietnamese(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()
}

export function rangeBounds(range: DateRangeKey, today: ISODate = todayVN()): [ISODate, ISODate] | null {
  switch (range) {
    case 'today':
      return [today, today]
    case 'week':
      return [startOfWeek(today), endOfWeek(today)]
    case 'month':
      return [startOfMonth(today), endOfMonth(today)]
    default:
      return null
  }
}

export function matchesKeyword(task: Task, keyword: string, members: Map<string, TeamMember>): boolean {
  const k = foldVietnamese(keyword.trim())
  if (!k) return true
  const memberName = task.team_member_id ? (members.get(task.team_member_id)?.name ?? '') : ''
  const hay = foldVietnamese([task.description, task.notes ?? '', memberName].join(' '))
  return k.split(/\s+/).every((part) => hay.includes(part))
}

export function filterTasks(tasks: Task[], f: TaskFilter, members: TeamMember[], today: ISODate = todayVN()): Task[] {
  const memberMap = new Map(members.map((m) => [m.id, m]))
  const bounds = rangeBounds(f.range, today)
  return tasks.filter((t) => {
    if (bounds && (t.work_date < bounds[0] || t.work_date > bounds[1])) return false
    if (f.date && t.work_date !== f.date) return false
    if (f.category && t.category !== f.category) return false
    if (f.memberId && t.team_member_id !== f.memberId) return false
    if (f.status && t.status !== f.status) return false
    if (f.reportStatus && t.report_status !== f.reportStatus) return false
    return matchesKeyword(t, f.keyword, memberMap)
  })
}

/** Sắp xếp mới nhất trước (theo ngày làm việc, rồi thời điểm tạo). */
export function sortNewestFirst(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.work_date.localeCompare(a.work_date) || b.created_at.localeCompare(a.created_at))
}

export function countActiveFilters(f: TaskFilter): number {
  return [f.date, f.category, f.memberId, f.status, f.reportStatus].filter(Boolean).length
}
