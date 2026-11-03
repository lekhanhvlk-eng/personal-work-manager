import { DEFAULT_REPORT_OPTIONS, type ReportOptions } from '../lib/reportGenerator'
import { storage } from '../lib/storage'
import type { Task, TaskInput } from '../lib/types'
import { uuid } from '../lib/uuid'

// ---------------------------------------------------------------- Bản nháp báo cáo
export interface ReportDraft {
  /** Khoá idempotency gửi lên máy chủ khi xác nhận. */
  requestId: string
  selectedIds: string[]
  step: 'select' | 'preview'
  content: string
  /** Người dùng đã sửa nội dung thủ công? */
  edited: boolean
  options: ReportOptions
  updatedAt: string
}

const reportKey = (scope: string) => `pwm:${scope}:reportDraft`

export function newReportDraft(): ReportDraft {
  return {
    requestId: uuid(),
    selectedIds: [],
    step: 'select',
    content: '',
    edited: false,
    options: { ...DEFAULT_REPORT_OPTIONS },
    updatedAt: new Date().toISOString(),
  }
}

export function loadReportDraft(scope: string): ReportDraft | null {
  const d = storage.get<ReportDraft | null>(reportKey(scope), null)
  if (!d || typeof d.requestId !== 'string' || !Array.isArray(d.selectedIds)) return null
  return { ...newReportDraft(), ...d, options: { ...DEFAULT_REPORT_OPTIONS, ...d.options } }
}

export function saveReportDraft(scope: string, draft: ReportDraft): void {
  storage.set(reportKey(scope), { ...draft, updatedAt: new Date().toISOString() })
}

export function clearReportDraft(scope: string): void {
  storage.remove(reportKey(scope))
}

/** Bản nháp có nội dung đáng giữ lại không? */
export function isMeaningfulDraft(d: ReportDraft | null): boolean {
  return Boolean(d && (d.selectedIds.length > 0 || d.content.trim()))
}

/**
 * Đối chiếu bản nháp với danh sách công việc hiện tại: loại bỏ những công việc
 * không còn "Chưa báo cáo" (ví dụ đã xuất từ thiết bị khác hoặc đã bị xoá).
 */
export function reconcileDraft(draft: ReportDraft, tasks: Task[]): { draft: ReportDraft; removed: number } {
  const eligible = new Set(tasks.filter((t) => t.report_status === 'unreported').map((t) => t.id))
  const kept = draft.selectedIds.filter((id) => eligible.has(id))
  const removed = draft.selectedIds.length - kept.length
  if (removed === 0) return { draft, removed }
  return {
    draft: { ...draft, selectedIds: kept, step: kept.length ? draft.step : 'select' },
    removed,
  }
}

// ---------------------------------------------------------------- Bản nháp nhập nhanh
export type TaskFormDraft = Partial<TaskInput> & { description: string }
const taskKey = (scope: string) => `pwm:${scope}:taskDraft`

export function loadTaskDraft(scope: string): TaskFormDraft | null {
  return storage.get<TaskFormDraft | null>(taskKey(scope), null)
}
export function saveTaskDraft(scope: string, draft: TaskFormDraft): void {
  storage.set(taskKey(scope), draft)
}
export function clearTaskDraft(scope: string): void {
  storage.remove(taskKey(scope))
}
