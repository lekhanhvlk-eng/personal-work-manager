import { TIME_ZONE } from './constants'
import type { ISODate } from './types'

const isoFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Ngày (YYYY-MM-DD) theo múi giờ Việt Nam của một thời điểm. */
export function toVNDate(date: Date = new Date()): ISODate {
  return isoFormatter.format(date)
}

export function todayVN(now: Date = new Date()): ISODate {
  return toVNDate(now)
}

function parse(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function fromUTC(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10)
}

export function addDays(iso: ISODate, days: number): ISODate {
  const { y, m, d } = parse(iso)
  return fromUTC(new Date(Date.UTC(y, m - 1, d + days)))
}

/** Thứ trong tuần: 0 = Chủ nhật ... 6 = Thứ bảy. */
export function weekday(iso: ISODate): number {
  const { y, m, d } = parse(iso)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Tuần bắt đầu từ Thứ hai (theo thói quen làm việc tại Việt Nam). */
export function startOfWeek(iso: ISODate): ISODate {
  const wd = weekday(iso)
  const diff = wd === 0 ? -6 : 1 - wd
  return addDays(iso, diff)
}

export function endOfWeek(iso: ISODate): ISODate {
  return addDays(startOfWeek(iso), 6)
}

export function startOfMonth(iso: ISODate): ISODate {
  return iso.slice(0, 8) + '01'
}

export function endOfMonth(iso: ISODate): ISODate {
  const { y, m } = parse(iso)
  return fromUTC(new Date(Date.UTC(y, m, 0)))
}

/** 01/11/2026 */
export function formatDateVN(iso: ISODate | null | undefined): string {
  if (!iso) return ''
  const { y, m, d } = parse(iso)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

/** "Hôm nay · 03/11/2026" / "Thứ hai · 02/11/2026" */
export function formatDayHeading(iso: ISODate, today: ISODate = todayVN()): string {
  let prefix = WEEKDAYS[weekday(iso)]
  if (iso === today) prefix = 'Hôm nay'
  else if (iso === addDays(today, -1)) prefix = 'Hôm qua'
  return `${prefix} · ${formatDateVN(iso)}`
}

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour12: false,
})

/** "14:35 03/11/2026" theo giờ Việt Nam. */
export function formatDateTimeVN(ts: string | null | undefined): string {
  if (!ts) return ''
  const parts = dateTimeFormatter.formatToParts(new Date(ts))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}/${get('year')}`
}

export function isValidISODate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const { y, m, d } = parse(v)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
