export type RepoErrorCode =
  | 'NETWORK'
  | 'NOT_AUTHENTICATED'
  | 'TASK_ALREADY_REPORTED'
  | 'TASK_NOT_FOUND'
  | 'TASK_NOT_REPORTED'
  | 'NO_TASKS_SELECTED'
  | 'EMPTY_CONTENT'
  | 'REQUEST_ID_CONFLICT'
  | 'INVALID_TEAM_MEMBER'
  | 'PENDING_SYNC'
  | 'INVALID_BACKUP'
  | 'UNKNOWN'

const MESSAGES: Record<RepoErrorCode, string> = {
  NETWORK: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.',
  NOT_AUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  TASK_ALREADY_REPORTED:
    'Một số công việc đã được báo cáo trước đó (có thể từ thiết bị khác). Danh sách đã được cập nhật.',
  TASK_NOT_FOUND: 'Không tìm thấy công việc (có thể đã bị xoá).',
  TASK_NOT_REPORTED: 'Công việc này hiện chưa được báo cáo.',
  NO_TASKS_SELECTED: 'Vui lòng chọn ít nhất một công việc.',
  EMPTY_CONTENT: 'Nội dung báo cáo không được để trống.',
  REQUEST_ID_CONFLICT: 'Bản nháp báo cáo không khớp với yêu cầu đã gửi. Vui lòng tạo lại báo cáo.',
  INVALID_TEAM_MEMBER: 'Thành viên không hợp lệ.',
  PENDING_SYNC: 'Còn thay đổi chưa đồng bộ lên máy chủ. Vui lòng kết nối mạng để đồng bộ trước.',
  INVALID_BACKUP: 'Tệp sao lưu không hợp lệ.',
  UNKNOWN: 'Đã xảy ra lỗi. Vui lòng thử lại.',
}

export class RepoError extends Error {
  constructor(
    public readonly code: RepoErrorCode,
    message?: string,
    public readonly detail?: string,
  ) {
    super(message ?? MESSAGES[code])
    this.name = 'RepoError'
  }
}

const KNOWN_CODES = Object.keys(MESSAGES) as RepoErrorCode[]

export function isNetworkError(err: unknown): boolean {
  if (err instanceof RepoError) return err.code === 'NETWORK'
  const msg = String((err as { message?: unknown })?.message ?? err ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|ECONNREFUSED|ERR_INTERNET_DISCONNECTED/i.test(
    msg,
  )
}

/** Chuyển lỗi Supabase/PostgREST/khác thành RepoError có thông báo tiếng Việt. */
export function toRepoError(err: unknown): RepoError {
  if (err instanceof RepoError) return err
  if (isNetworkError(err)) return new RepoError('NETWORK')
  const e = err as { message?: string; details?: string; code?: string; status?: number }
  const msg = e?.message ?? ''
  for (const code of KNOWN_CODES) {
    if (msg.includes(code)) return new RepoError(code, undefined, e.details)
  }
  if (e?.code === 'PGRST301' || e?.code === '28000' || e?.status === 401 || /JWT/i.test(msg)) {
    return new RepoError('NOT_AUTHENTICATED')
  }
  if (e?.code === 'PGRST116') return new RepoError('TASK_NOT_FOUND')
  return new RepoError('UNKNOWN', msg ? `Lỗi: ${msg}` : undefined)
}
