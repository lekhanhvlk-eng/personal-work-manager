import { assignmentLabel, categoryLabel, priorityInfo, reportStatusLabel, statusLabel } from './constants'
import { formatDateTimeVN, formatDateVN } from './dates'
import type { BackupFile, DataSnapshot, Report, Task, TeamMember } from './types'

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  // Chống CSV injection khi mở bằng Excel.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function tasksToCSV(tasks: Task[], members: TeamMember[], reports: Report[]): string {
  const memberMap = new Map(members.map((m) => [m.id, m.name]))
  const reportMap = new Map(reports.map((r) => [r.id, r.code]))
  const header = [
    'Mã công việc',
    'Ngày làm việc',
    'Nội dung công việc',
    'Phân loại',
    'Trạng thái',
    'Mức ưu tiên',
    'Hình thức',
    'Thành viên',
    'Hạn hoàn thành',
    'Ghi chú',
    'Trạng thái báo cáo',
    'Mã báo cáo',
    'Thời điểm báo cáo',
    'Thời điểm tạo',
  ]
  const rows = [...tasks]
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.created_at.localeCompare(b.created_at))
    .map((t) => [
      t.id,
      formatDateVN(t.work_date),
      t.description,
      categoryLabel(t.category),
      statusLabel(t.status),
      t.priority ? priorityInfo(t.priority)?.label : '',
      assignmentLabel(t.assignment_type),
      t.team_member_id ? (memberMap.get(t.team_member_id) ?? '') : '',
      formatDateVN(t.due_date),
      t.notes ?? '',
      reportStatusLabel(t.report_status),
      t.report_id ? (reportMap.get(t.report_id) ?? t.report_id) : '',
      formatDateTimeVN(t.reported_at),
      formatDateTimeVN(t.created_at),
    ])
  // BOM để Excel hiển thị đúng tiếng Việt.
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export function buildBackup(data: DataSnapshot, now: Date = new Date()): BackupFile {
  return {
    app: 'personal-work-manager',
    version: 1,
    exported_at: now.toISOString(),
    team_members: data.members,
    tasks: data.tasks,
    reports: data.reports,
    report_events: data.events,
  }
}

export class BackupValidationError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Kiểm tra tệp sao lưu trước khi khôi phục. Ném lỗi tiếng Việt nếu không hợp lệ. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupValidationError('Tệp không phải JSON hợp lệ.')
  }
  if (!raw || typeof raw !== 'object') throw new BackupValidationError('Tệp sao lưu không hợp lệ.')
  const b = raw as Partial<BackupFile>
  if (b.app !== 'personal-work-manager') throw new BackupValidationError('Tệp này không phải bản sao lưu của ứng dụng.')
  if (b.version !== 1) throw new BackupValidationError('Phiên bản tệp sao lưu không được hỗ trợ.')
  for (const key of ['team_members', 'tasks', 'reports', 'report_events'] as const) {
    if (!Array.isArray(b[key])) throw new BackupValidationError(`Thiếu dữ liệu "${key}" trong tệp sao lưu.`)
    for (const item of b[key] as { id?: unknown }[]) {
      if (!item || typeof item.id !== 'string' || !UUID_RE.test(item.id)) {
        throw new BackupValidationError(`Bản ghi trong "${key}" có mã không hợp lệ.`)
      }
    }
  }
  for (const t of b.tasks as Task[]) {
    if (typeof t.description !== 'string' || !t.description.trim()) {
      throw new BackupValidationError('Có công việc thiếu nội dung trong tệp sao lưu.')
    }
  }
  return b as BackupFile
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
