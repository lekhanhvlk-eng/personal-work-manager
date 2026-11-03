import { addDays, todayVN } from './dates'
import type { BackupFile, CategoryKey, Task, TaskStatus, TeamMember } from './types'
import { uuid } from './uuid'

/**
 * Dữ liệu mẫu thực tế cho CHẾ ĐỘ DÙNG THỬ — tách biệt hoàn toàn với dữ liệu thật.
 * Bao gồm kịch bản kiểm thử "5 công việc cùng ngày" (mục 8 của đặc tả).
 */
export function buildSampleData(today: string = todayVN(), now: Date = new Date()): BackupFile {
  const ts = (offsetMinutes: number) => new Date(now.getTime() - offsetMinutes * 60_000).toISOString()
  const member = (name: string, role: string): TeamMember => ({
    id: uuid(),
    name,
    role,
    phone: null,
    note: null,
    archived: false,
    created_at: ts(10_000),
    updated_at: ts(10_000),
  })
  const lan = member('Nguyễn Thị Lan', 'Giám sát khu vực Q.7')
  const minh = member('Trần Văn Minh', 'Nhân viên kiểm kê')
  const hoa = member('Lê Thu Hoa', 'Nhân viên mới')

  let order = 0
  const task = (
    description: string,
    dayOffset: number,
    category: CategoryKey,
    status: TaskStatus = 'done',
    extra: Partial<Task> = {},
  ): Task => {
    const created = ts(5000 - order++ * 10)
    return {
      id: uuid(),
      description,
      work_date: addDays(today, dayOffset),
      category,
      status,
      priority: null,
      assignment_type: 'self',
      team_member_id: null,
      notes: null,
      due_date: null,
      report_status: 'unreported',
      report_id: null,
      reported_at: null,
      created_at: created,
      updated_at: created,
      ...extra,
    }
  }

  const tasks: Task[] = [
    // Kịch bản kiểm thử: 5 công việc cùng một ngày (hôm qua)
    task('Kiểm tra và đánh giá hoạt động 5 cửa hàng Vinamilk', -1, 'store_audit'),
    task('Điều phối lịch làm việc và phân công nhiệm vụ cho team', -1, 'team_coordination', 'done', {
      assignment_type: 'coordinated',
      team_member_id: lan.id,
    }),
    task('Đào tạo nhân viên mới về quy trình kiểm kê', -1, 'training', 'done', { team_member_id: hoa.id }),
    task('Chuẩn bị báo cáo kết quả audit', -1, 'reporting_analysis', 'in_progress'),
    task('Theo dõi tiến độ khắc phục vi phạm tại cửa hàng', -1, 'follow_up', 'pending', {
      assignment_type: 'assigned',
      team_member_id: minh.id,
    }),
    // Các ngày khác
    task('Họp giao ban đầu tuần với quản lý khu vực', -2, 'boss_assigned'),
    task('Xử lý phản ánh thiếu hàng tại cửa hàng Q.1', -2, 'issue_handling', 'awaiting_feedback'),
    task('Tổng hợp số liệu doanh số tuần và gửi sếp', 0, 'reporting_analysis', 'done', { priority: 'high' }),
    task('Kiểm tra trưng bày sản phẩm tại 3 siêu thị', 0, 'store_audit', 'in_progress', {
      assignment_type: 'assigned',
      team_member_id: lan.id,
      due_date: addDays(today, 2),
    }),
  ]

  return {
    app: 'personal-work-manager',
    version: 1,
    exported_at: now.toISOString(),
    team_members: [lan, minh, hoa],
    tasks,
    reports: [],
    report_events: [],
  }
}
