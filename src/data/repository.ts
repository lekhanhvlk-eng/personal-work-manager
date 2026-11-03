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

export interface ExportRequest {
  /** Khoá idempotency: cùng một bản nháp luôn gửi cùng requestId. */
  requestId: string
  /** Danh sách ID công việc được chọn — KHÔNG bao giờ theo ngày. */
  taskIds: string[]
  /** Nội dung báo cáo (có thể đã chỉnh sửa) — được lưu thành ảnh chụp bất biến. */
  content: string
}

export interface Repository {
  readonly mode: 'cloud' | 'demo'
  fetchAll(): Promise<DataSnapshot>
  createTask(task: Task): Promise<Task>
  updateTask(id: string, patch: Partial<TaskInput>): Promise<Task>
  deleteTask(id: string): Promise<void>
  createMember(member: TeamMember): Promise<TeamMember>
  updateMember(id: string, patch: Partial<TeamMemberInput>): Promise<TeamMember>
  /** Giao dịch nguyên tử phía máy chủ. Chỉ resolve khi máy chủ đã commit. */
  confirmExport(req: ExportRequest): Promise<Report>
  restoreTask(taskId: string, note: string | null): Promise<Task>
  importBackup(backup: BackupFile): Promise<ImportResult>
  /** Lắng nghe thay đổi từ thiết bị khác. Trả về hàm huỷ. */
  subscribe(onChange: () => void): () => void
}

export const TASK_INPUT_FIELDS: (keyof TaskInput)[] = [
  'description',
  'work_date',
  'category',
  'status',
  'priority',
  'assignment_type',
  'team_member_id',
  'notes',
  'due_date',
]

export function pickTaskInput(patch: Partial<Task>): Partial<TaskInput> {
  const out: Partial<TaskInput> = {}
  for (const k of TASK_INPUT_FIELDS) {
    if (k in patch) (out as Record<string, unknown>)[k] = patch[k]
  }
  return out
}
