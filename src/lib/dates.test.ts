import { describe, expect, it } from 'vitest'
import {
  addDays,
  endOfMonth,
  endOfWeek,
  formatDateTimeVN,
  formatDateVN,
  formatDayHeading,
  isValidISODate,
  startOfWeek,
  todayVN,
} from './dates'

describe('ngày theo múi giờ Asia/Ho_Chi_Minh', () => {
  it('todayVN dùng giờ Việt Nam (UTC+7), không phải giờ máy', () => {
    // 18:30 UTC ngày 02/11 = 01:30 ngày 03/11 tại Việt Nam
    expect(todayVN(new Date('2026-11-02T18:30:00Z'))).toBe('2026-11-03')
    expect(todayVN(new Date('2026-11-02T16:59:00Z'))).toBe('2026-11-02')
  })

  it('định dạng ngày/giờ tiếng Việt', () => {
    expect(formatDateVN('2026-11-01')).toBe('01/11/2026')
    expect(formatDateTimeVN('2026-11-02T18:30:00Z')).toBe('01:30 03/11/2026')
    expect(formatDayHeading('2026-11-03', '2026-11-03')).toBe('Hôm nay · 03/11/2026')
    expect(formatDayHeading('2026-11-02', '2026-11-03')).toBe('Hôm qua · 02/11/2026')
    expect(formatDayHeading('2026-11-01', '2026-11-03')).toBe('Chủ nhật · 01/11/2026')
  })

  it('tuần bắt đầu từ thứ hai, tháng đúng số ngày', () => {
    expect(startOfWeek('2026-11-03')).toBe('2026-11-02')
    expect(endOfWeek('2026-11-03')).toBe('2026-11-08')
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02')
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('kiểm tra ngày hợp lệ', () => {
    expect(isValidISODate('2026-02-30')).toBe(false)
    expect(isValidISODate('2026-11-03')).toBe(true)
    expect(isValidISODate('03/11/2026')).toBe(false)
  })
})
