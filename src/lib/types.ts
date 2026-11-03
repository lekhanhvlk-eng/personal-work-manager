export type CategoryKey =
  | 'boss_assigned'
  | 'team_coordination'
  | 'store_audit'
  | 'issue_handling'
  | 'reporting_analysis'
  | 'training'
  | 'follow_up'
  | 'other'

export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'awaiting_feedback' | 'pending'
export type Priority = 'low' | 'medium' | 'high'
export type AssignmentType = 'self' | 'assigned' | 'coordinated'
export type ReportStatus = 'unreported' | 'reported'

/** Ngày dạng YYYY-MM-DD (theo múi giờ Asia/Ho_Chi_Minh). */
export type ISODate = string

export interface Task {
  id: string
  user_id?: string
  description: string
  work_date: ISODate
  category: CategoryKey
  status: TaskStatus
  priority: Priority | null
  assignment_type: AssignmentType
  team_member_id: string | null
  notes: string | null
  due_date: ISODate | null
  report_status: ReportStatus
  report_id: string | null
  reported_at: string | null
  created_at: string
  updated_at: string
}

/** Các trường người dùng được phép nhập/sửa. */
export type TaskInput = Pick<
  Task,
  | 'description'
  | 'work_date'
  | 'category'
  | 'status'
  | 'priority'
  | 'assignment_type'
  | 'team_member_id'
  | 'notes'
  | 'due_date'
>

export interface TeamMember {
  id: string
  user_id?: string
  name: string
  role: string | null
  phone: string | null
  note: string | null
  archived: boolean
  created_at: string
  updated_at: string
}

export type TeamMemberInput = Pick<TeamMember, 'name' | 'role' | 'phone' | 'note' | 'archived'>

export interface TaskSnapshot {
  id: string
  description: string
  work_date: ISODate
  category: CategoryKey
  status: TaskStatus
  priority: Priority | null
  assignment_type: AssignmentType
  team_member_id: string | null
  team_member_name: string | null
  notes: string | null
  due_date: ISODate | null
  created_at: string
}

export interface Report {
  id: string
  user_id?: string
  code: string
  request_id: string
  status: 'confirmed'
  content: string
  task_ids: string[]
  task_count: number
  date_from: ISODate
  date_to: ISODate
  task_snapshot: TaskSnapshot[]
  exported_at: string
  created_at: string
}

export interface ReportEvent {
  id: string
  user_id?: string
  report_id: string
  task_id: string | null
  event_type: 'exported' | 'task_restored'
  note: string | null
  created_at: string
}

export interface DataSnapshot {
  tasks: Task[]
  members: TeamMember[]
  reports: Report[]
  events: ReportEvent[]
}

export interface BackupFile {
  app: 'personal-work-manager'
  version: 1
  exported_at: string
  team_members: TeamMember[]
  tasks: Task[]
  reports: Report[]
  report_events: ReportEvent[]
}

export interface ImportResult {
  team_members: number
  tasks: number
  reports: number
  report_events: number
  skipped: number
}
