import type { AssignmentType, CategoryKey, Priority, ReportStatus, TaskStatus } from './types'

export const APP_NAME = 'Trợ lý Công việc'
export const TIME_ZONE = 'Asia/Ho_Chi_Minh'

export const CATEGORIES: { key: CategoryKey; label: string; short: string; color: string }[] = [
  { key: 'boss_assigned', label: 'Công việc sếp giao', short: 'Sếp giao', color: 'bg-violet-100 text-violet-800' },
  {
    key: 'team_coordination',
    label: 'Quản lý và điều phối team',
    short: 'Điều phối team',
    color: 'bg-sky-100 text-sky-800',
  },
  {
    key: 'store_audit',
    label: 'Giám sát và kiểm tra cửa hàng',
    short: 'Kiểm tra cửa hàng',
    color: 'bg-emerald-100 text-emerald-800',
  },
  {
    key: 'issue_handling',
    label: 'Xử lý vấn đề phát sinh',
    short: 'Xử lý phát sinh',
    color: 'bg-rose-100 text-rose-800',
  },
  {
    key: 'reporting_analysis',
    label: 'Báo cáo và phân tích dữ liệu',
    short: 'Báo cáo/phân tích',
    color: 'bg-indigo-100 text-indigo-800',
  },
  { key: 'training', label: 'Đào tạo và hướng dẫn nhân viên', short: 'Đào tạo', color: 'bg-amber-100 text-amber-800' },
  {
    key: 'follow_up',
    label: 'Theo dõi và đôn đốc khắc phục',
    short: 'Đôn đốc khắc phục',
    color: 'bg-teal-100 text-teal-800',
  },
  { key: 'other', label: 'Công việc khác', short: 'Khác', color: 'bg-slate-100 text-slate-700' },
]

export const STATUSES: { key: TaskStatus; label: string; color: string; dot: string }[] = [
  { key: 'not_started', label: 'Chưa thực hiện', color: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400' },
  { key: 'in_progress', label: 'Đang thực hiện', color: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  { key: 'done', label: 'Đã hoàn thành', color: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
  { key: 'awaiting_feedback', label: 'Chờ phản hồi', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { key: 'pending', label: 'Chờ xử lý', color: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
]

export const PRIORITIES: { key: Priority; label: string; color: string }[] = [
  { key: 'high', label: 'Cao', color: 'bg-red-100 text-red-700' },
  { key: 'medium', label: 'Trung bình', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'low', label: 'Thấp', color: 'bg-slate-100 text-slate-600' },
]

export const ASSIGNMENT_TYPES: { key: AssignmentType; label: string; hint: string }[] = [
  { key: 'self', label: 'Tự thực hiện', hint: 'Việc tôi trực tiếp làm' },
  { key: 'assigned', label: 'Giao cho thành viên', hint: 'Giao việc cho người khác thực hiện' },
  { key: 'coordinated', label: 'Điều phối / phối hợp', hint: 'Điều phối, phối hợp cùng thành viên' },
]

export const REPORT_STATUSES: { key: ReportStatus; label: string }[] = [
  { key: 'unreported', label: 'Chưa báo cáo' },
  { key: 'reported', label: 'Đã báo cáo' },
]

const byKey = <T extends { key: string }>(list: T[]) =>
  Object.fromEntries(list.map((x) => [x.key, x])) as Record<string, T>
const categoryMap = byKey(CATEGORIES)
const statusMap = byKey(STATUSES)
const priorityMap = byKey(PRIORITIES)
const assignmentMap = byKey(ASSIGNMENT_TYPES)

export const categoryLabel = (k: CategoryKey) => categoryMap[k]?.label ?? 'Công việc khác'
export const categoryInfo = (k: CategoryKey) => categoryMap[k] ?? categoryMap.other
export const statusLabel = (k: TaskStatus) => statusMap[k]?.label ?? k
export const statusInfo = (k: TaskStatus) => statusMap[k] ?? statusMap.not_started
export const priorityInfo = (k: Priority) => priorityMap[k]
export const assignmentLabel = (k: AssignmentType) => assignmentMap[k]?.label ?? k
export const reportStatusLabel = (k: ReportStatus) => (k === 'reported' ? 'Đã báo cáo' : 'Chưa báo cáo')
