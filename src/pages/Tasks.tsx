import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Page, SyncIndicator } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { useToast } from '../components/Toast'
import { Button, Chip, EmptyState, Field, Sheet, inputClass } from '../components/ui'
import { CATEGORIES, REPORT_STATUSES, STATUSES } from '../lib/constants'
import { formatDayHeading, todayVN } from '../lib/dates'
import {
  EMPTY_FILTER,
  countActiveFilters,
  filterTasks,
  sortNewestFirst,
  type DateRangeKey,
  type TaskFilter,
} from '../lib/filters'
import type { CategoryKey, ReportStatus, Task, TaskStatus } from '../lib/types'
import { useData, useMemberMap, useReportCodeMap } from '../state/selectors'
import { useSession } from '../state/StoreContext'

const RANGES: { key: DateRangeKey; label: string }[] = [
  { key: 'today', label: 'Hôm nay' },
  { key: 'week', label: 'Tuần này' },
  { key: 'month', label: 'Tháng này' },
  { key: 'all', label: 'Tất cả' },
]

function filterFromParams(p: URLSearchParams): TaskFilter {
  return {
    ...EMPTY_FILTER,
    range: (p.get('range') as DateRangeKey) || 'all',
    reportStatus: (p.get('report') as ReportStatus) || null,
    status: (p.get('status') as TaskStatus) || null,
    memberId: p.get('member') || null,
    category: (p.get('category') as CategoryKey) || null,
    date: p.get('date') || null,
  }
}

export function TasksPage() {
  const { store } = useSession()
  const { tasks, members } = useData()
  const memberMap = useMemberMap()
  const codes = useReportCodeMap()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [filter, setFilterState] = useState<TaskFilter>(() => filterFromParams(params))
  const [sheet, setSheet] = useState(false)

  const setFilter = (f: TaskFilter) => {
    setFilterState(f)
    const next = new URLSearchParams()
    if (f.range !== 'all') next.set('range', f.range)
    if (f.reportStatus) next.set('report', f.reportStatus)
    if (f.status) next.set('status', f.status)
    if (f.memberId) next.set('member', f.memberId)
    if (f.category) next.set('category', f.category)
    if (f.date) next.set('date', f.date)
    setParams(next, { replace: true })
  }

  const today = todayVN()
  const filtered = useMemo(
    () => sortNewestFirst(filterTasks(tasks, filter, members, today)),
    [tasks, filter, members, today],
  )
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of filtered) map.set(t.work_date, [...(map.get(t.work_date) ?? []), t])
    return [...map.entries()]
  }, [filtered])
  const active = countActiveFilters(filter)
  const unreportedInView = filtered.filter((t) => t.report_status === 'unreported').length

  const toggleDone = (t: Task) => {
    store.updateTask(t.id, { status: t.status === 'done' ? 'in_progress' : 'done' })
    toast(t.status === 'done' ? 'Đã chuyển về “Đang thực hiện”.' : 'Đã đánh dấu hoàn thành.')
  }

  return (
    <Page
      title="Công việc"
      subtitle={`${filtered.length} công việc · ${unreportedInView} chưa báo cáo`}
      actions={<SyncIndicator />}
    >
      <div className="relative mb-3">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          className={`${inputClass} pl-11 pr-24`}
          placeholder="Tìm theo nội dung, ghi chú, thành viên…"
          value={filter.keyword}
          onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
          aria-label="Tìm kiếm công việc"
        />
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={`absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold ${
            active ? 'bg-brand-600 text-white' : 'text-slate-600 active:bg-slate-100'
          }`}
        >
          <Icon name="filter" className="h-4 w-4" />
          Lọc{active ? ` (${active})` : ''}
        </button>
      </div>

      <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
        {RANGES.map((r) => (
          <Chip key={r.key} selected={filter.range === r.key} onClick={() => setFilter({ ...filter, range: r.key })}>
            {r.label}
          </Chip>
        ))}
        <Chip
          selected={filter.reportStatus === 'unreported'}
          onClick={() =>
            setFilter({ ...filter, reportStatus: filter.reportStatus === 'unreported' ? null : 'unreported' })
          }
          className={filter.reportStatus === 'unreported' ? '!bg-red-600' : ''}
        >
          Chưa báo cáo
        </Chip>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={tasks.length ? 'Không có công việc phù hợp' : 'Chưa có công việc nào'}>
          {tasks.length ? 'Thử thay đổi bộ lọc hoặc từ khoá.' : 'Bấm nút “Thêm mới” để ghi nhận công việc đầu tiên.'}
          {active > 0 && (
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => setFilter({ ...EMPTY_FILTER, range: filter.range })}>
                Xoá bộ lọc
              </Button>
            </div>
          )}
        </EmptyState>
      ) : (
        groups.map(([date, list]) => (
          <section key={date} className="mb-4">
            <h2 className="sticky top-[56px] z-10 -mx-4 mb-2 bg-slate-50/95 px-5 py-1.5 text-sm font-bold text-slate-600 backdrop-blur">
              {formatDayHeading(date, today)} <span className="font-medium text-slate-400">· {list.length}</span>
            </h2>
            <div className="space-y-2">
              {list.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  member={t.team_member_id ? memberMap.get(t.team_member_id) : undefined}
                  reportCode={t.report_id ? codes.get(t.report_id) : undefined}
                  onToggleDone={toggleDone}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Bộ lọc"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setFilter({ ...EMPTY_FILTER, keyword: filter.keyword, range: filter.range })}
            >
              Xoá bộ lọc
            </Button>
            <Button className="flex-1" onClick={() => setSheet(false)}>
              Xem {filtered.length} kết quả
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Ngày cụ thể">
            <input
              type="date"
              className={inputClass}
              value={filter.date ?? ''}
              onChange={(e) =>
                setFilter({ ...filter, date: e.target.value || null, range: e.target.value ? 'all' : filter.range })
              }
            />
          </Field>
          <Field label="Phân loại">
            <select
              className={inputClass}
              value={filter.category ?? ''}
              onChange={(e) => setFilter({ ...filter, category: (e.target.value as CategoryKey) || null })}
            >
              <option value="">Tất cả phân loại</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Thành viên">
            <select
              className={inputClass}
              value={filter.memberId ?? ''}
              onChange={(e) => setFilter({ ...filter, memberId: e.target.value || null })}
            >
              <option value="">Tất cả thành viên</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.archived ? ' (đã lưu trữ)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái công việc">
            <select
              className={inputClass}
              value={filter.status ?? ''}
              onChange={(e) => setFilter({ ...filter, status: (e.target.value as TaskStatus) || null })}
            >
              <option value="">Tất cả trạng thái</option>
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Trạng thái báo cáo">
            <select
              className={inputClass}
              value={filter.reportStatus ?? ''}
              onChange={(e) => setFilter({ ...filter, reportStatus: (e.target.value as ReportStatus) || null })}
            >
              <option value="">Tất cả</option>
              {REPORT_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Sheet>
    </Page>
  )
}
