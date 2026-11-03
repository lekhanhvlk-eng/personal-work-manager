import { describe, expect, it } from 'vitest'
import { generateReport, normalizeSentence, summarize, type ReportTaskInput } from './reportGenerator'

const t = (
  id: string,
  description: string,
  work_date: string,
  extra: Partial<ReportTaskInput> = {},
): ReportTaskInput => ({
  id,
  description,
  work_date,
  status: 'done',
  assignment_type: 'self',
  created_at: `${work_date}T0${id}:00:00.000Z`,
  ...extra,
})

describe('generateReport', () => {
  it('nhóm theo ngày, sắp xếp theo thời gian và tổng kết đúng định dạng', () => {
    const tasks = [
      t('4', 'điều phối lịch làm việc và phân công nhiệm vụ cho team', '2026-11-02'),
      t('1', 'Kiểm tra và đánh giá hoạt động 5 cửa hàng Vinamilk', '2026-11-01'),
      t('2', 'Hướng dẫn 2 nhân viên về quy trình kiểm kê.', '2026-11-01'),
      t('5', 'Theo dõi tiến độ khắc phục các lỗi tại cửa hàng', '2026-11-02', { status: 'in_progress' }),
      t('3', 'Tổng hợp và gửi báo cáo kết quả audit cho quản lý', '2026-11-01'),
    ]
    expect(generateReport(tasks)).toBe(
      [
        'BÁO CÁO CÔNG VIỆC',
        '',
        'Ngày 01/11/2026',
        '- Kiểm tra và đánh giá hoạt động 5 cửa hàng Vinamilk.',
        '- Hướng dẫn 2 nhân viên về quy trình kiểm kê.',
        '- Tổng hợp và gửi báo cáo kết quả audit cho quản lý.',
        '',
        'Ngày 02/11/2026',
        '- Điều phối lịch làm việc và phân công nhiệm vụ cho team.',
        '- Theo dõi tiến độ khắc phục các lỗi tại cửa hàng (đang thực hiện).',
        '',
        'TỔNG KẾT:',
        '- Tổng số công việc: 5.',
        '- Số ngày ghi nhận: 2.',
        '- Số công việc hoàn thành: 4.',
        '- Số công việc chưa hoàn thành: 1.',
      ].join('\n'),
    )
  })

  it('chỉ dùng dữ liệu thực tế: không thêm nội dung ngoài các công việc được chọn', () => {
    const report = generateReport([t('1', 'Kiểm tra kho', '2026-11-03')])
    const bullets = report.split('\n').filter((l) => l.startsWith('- ') && !l.includes(':'))
    expect(bullets).toEqual(['- Kiểm tra kho.'])
  })

  it('ghi tên thành viên được giao/phối hợp và tuỳ chọn ẩn trạng thái', () => {
    const r = generateReport(
      [
        t('1', 'Kiểm kê cửa hàng Q1', '2026-11-03', {
          assignment_type: 'assigned',
          team_member_name: 'Lan',
          status: 'pending',
        }),
        t('2', 'Họp điều phối', '2026-11-03', { assignment_type: 'coordinated', team_member_name: 'Minh' }),
      ],
      { showStatus: false, showMember: true, showNotes: false },
    )
    expect(r).toContain('- Kiểm kê cửa hàng Q1 (giao: Lan).')
    expect(r).toContain('- Họp điều phối (phối hợp: Minh).')
  })

  it('trả về chuỗi rỗng khi không có công việc', () => {
    expect(generateReport([])).toBe('')
  })
})

describe('normalizeSentence', () => {
  it('giữ nguyên ý nghĩa, chỉ chuẩn hoá trình bày', () => {
    expect(normalizeSentence('  - kiểm tra   cửa hàng ;  ')).toBe('Kiểm tra cửa hàng')
    expect(normalizeSentence('dòng 1\ndòng 2')).toBe('Dòng 1; dòng 2')
    expect(normalizeSentence('đào tạo')).toBe('Đào tạo')
  })
})

describe('summarize', () => {
  it('đếm số ngày và số việc hoàn thành', () => {
    expect(
      summarize([
        { work_date: '2026-11-01', status: 'done' },
        { work_date: '2026-11-01', status: 'pending' },
        { work_date: '2026-11-03', status: 'done' },
      ]),
    ).toEqual({ total: 3, days: 2, done: 2, notDone: 1, dateFrom: '2026-11-01', dateTo: '2026-11-03' })
  })
})
