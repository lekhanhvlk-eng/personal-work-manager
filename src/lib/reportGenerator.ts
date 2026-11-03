import { formatDateVN } from './dates'
import type { AssignmentType, ISODate, TaskStatus } from './types'

/** Dữ liệu tối thiểu để tạo báo cáo (dùng cho cả Task và TaskSnapshot). */
export interface ReportTaskInput {
  id: string
  description: string
  work_date: ISODate
  status: TaskStatus
  assignment_type: AssignmentType
  team_member_name?: string | null
  notes?: string | null
  created_at: string
}

export interface ReportOptions {
  /** Ghi chú trạng thái cho việc chưa hoàn thành, ví dụ "(đang thực hiện)". */
  showStatus: boolean
  /** Ghi tên thành viên được giao / phối hợp. */
  showMember: boolean
  /** Thêm ghi chú của công việc. */
  showNotes: boolean
}

export const DEFAULT_REPORT_OPTIONS: ReportOptions = {
  showStatus: true,
  showMember: true,
  showNotes: false,
}

export const REPORT_TITLE = 'BÁO CÁO CÔNG VIỆC'

const STATUS_SUFFIX: Record<TaskStatus, string | null> = {
  done: null,
  in_progress: 'đang thực hiện',
  not_started: 'chưa thực hiện',
  awaiting_feedback: 'chờ phản hồi',
  pending: 'chờ xử lý',
}

/** Chuẩn hoá một dòng: gộp khoảng trắng, viết hoa chữ cái đầu, bỏ dấu câu cuối. Không thay đổi ý nghĩa. */
export function normalizeSentence(text: string): string {
  let s = text
    .replace(/\s*\n+\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/^[-–•*+]\s*/, '')
  s = s.replace(/[\s.;,]+$/, '')
  if (!s) return ''
  return s.charAt(0).toLocaleUpperCase('vi-VN') + s.slice(1)
}

export function sortTasksChronologically<T extends { work_date: string; created_at: string; id: string }>(
  tasks: T[],
): T[] {
  return [...tasks].sort(
    (a, b) =>
      a.work_date.localeCompare(b.work_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  )
}

export function groupByDate<T extends { work_date: string; created_at: string; id: string }>(
  tasks: T[],
): { date: ISODate; tasks: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const t of sortTasksChronologically(tasks)) {
    const list = groups.get(t.work_date)
    if (list) list.push(t)
    else groups.set(t.work_date, [t])
  }
  return [...groups.entries()].map(([date, list]) => ({ date, tasks: list }))
}

export function formatTaskLine(task: ReportTaskInput, options: ReportOptions): string {
  let line = normalizeSentence(task.description)
  const extras: string[] = []
  if (options.showMember && task.team_member_name && task.assignment_type !== 'self') {
    extras.push(`${task.assignment_type === 'assigned' ? 'giao' : 'phối hợp'}: ${task.team_member_name.trim()}`)
  }
  const suffix = STATUS_SUFFIX[task.status]
  if (options.showStatus && suffix) extras.push(suffix)
  if (extras.length) line += ` (${extras.join('; ')})`
  line += '.'
  if (options.showNotes && task.notes && task.notes.trim()) {
    line += ` Ghi chú: ${normalizeSentence(task.notes)}.`
  }
  return `- ${line}`
}

export interface ReportSummary {
  total: number
  days: number
  done: number
  notDone: number
  dateFrom: ISODate | null
  dateTo: ISODate | null
}

export function summarize(tasks: Pick<ReportTaskInput, 'work_date' | 'status'>[]): ReportSummary {
  const dates = [...new Set(tasks.map((t) => t.work_date))].sort()
  const done = tasks.filter((t) => t.status === 'done').length
  return {
    total: tasks.length,
    days: dates.length,
    done,
    notDone: tasks.length - done,
    dateFrom: dates[0] ?? null,
    dateTo: dates[dates.length - 1] ?? null,
  }
}

/**
 * Tạo nội dung báo cáo CHỈ từ dữ liệu công việc thực tế được chọn.
 * Không thêm thành tích hay hoạt động nào không có trong dữ liệu.
 */
export function generateReport(tasks: ReportTaskInput[], options: ReportOptions = DEFAULT_REPORT_OPTIONS): string {
  if (tasks.length === 0) return ''
  const lines: string[] = [REPORT_TITLE, '']
  for (const group of groupByDate(tasks)) {
    lines.push(`Ngày ${formatDateVN(group.date)}`)
    for (const t of group.tasks) lines.push(formatTaskLine(t, options))
    lines.push('')
  }
  const s = summarize(tasks)
  lines.push('TỔNG KẾT:')
  lines.push(`- Tổng số công việc: ${s.total}.`)
  lines.push(`- Số ngày ghi nhận: ${s.days}.`)
  lines.push(`- Số công việc hoàn thành: ${s.done}.`)
  if (s.notDone > 0) lines.push(`- Số công việc chưa hoàn thành: ${s.notDone}.`)
  return lines.join('\n')
}
