import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Page, SyncIndicator } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { useToast } from '../components/Toast'
import { Button, EmptyState, SectionTitle } from '../components/ui'
import { formatDayHeading, todayVN } from '../lib/dates'
import { sortNewestFirst } from '../lib/filters'
import type { Task } from '../lib/types'
import { computeStats, useData, useMemberMap, useReportCodeMap } from '../state/selectors'
import { useAppState, useSession } from '../state/StoreContext'

function Stat({
  label,
  value,
  icon,
  tone,
  to,
}: {
  label: string
  value: number
  icon: IconName
  tone: string
  to: string
}) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card active:bg-slate-50">
      <span className={`rounded-xl p-2 ${tone}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-extrabold leading-none text-slate-900">{value}</span>
        <span className="mt-1 block text-xs font-medium leading-tight text-slate-500">{label}</span>
      </span>
    </Link>
  )
}

export function DashboardPage() {
  const { store, mode } = useSession()
  const { ready } = useAppState()
  const { tasks, reports } = useData()
  const memberMap = useMemberMap()
  const codes = useReportCodeMap()
  const toast = useToast()
  const navigate = useNavigate()
  const today = todayVN()
  const stats = useMemo(() => computeStats(tasks, reports.length, today), [tasks, reports.length, today])
  const todayTasks = useMemo(() => sortNewestFirst(tasks.filter((t) => t.work_date === today)), [tasks, today])

  const toggleDone = (t: Task) => {
    store.updateTask(t.id, { status: t.status === 'done' ? 'in_progress' : 'done' })
    toast(t.status === 'done' ? 'Đã chuyển về “Đang thực hiện”.' : 'Đã đánh dấu hoàn thành.')
  }

  return (
    <Page
      title="Tổng quan"
      subtitle={formatDayHeading(today, today)}
      actions={
        <>
          <SyncIndicator />
          <Link to="/settings" className="rounded-full p-2 text-slate-600 active:bg-slate-200" aria-label="Cài đặt">
            <Icon name="cog" className="h-6 w-6" />
          </Link>
        </>
      }
    >
      {mode === 'demo' && (
        <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          <strong>Chế độ dùng thử:</strong> dữ liệu chỉ lưu trên thiết bị này. Cấu hình Supabase để đồng bộ đám mây.{' '}
          <Link to="/settings" className="font-semibold underline">
            Cài đặt
          </Link>
        </div>
      )}

      {/* Chỉ số quan trọng nhất */}
      <section
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 to-rose-500 p-5 text-white shadow-lg shadow-red-600/20"
        aria-labelledby="unreported-label"
      >
        <p id="unreported-label" className="text-sm font-bold uppercase tracking-wide text-white/90">
          Công việc chưa báo cáo
        </p>
        <p className="mt-1 text-6xl font-extrabold leading-none" data-testid="unreported-count">
          {ready ? stats.unreported : '…'}
        </p>
        <p className="mt-2 text-sm text-white/85">
          {stats.unreported > 0
            ? 'Sẵn sàng để chọn và đưa vào báo cáo tiếp theo.'
            : 'Tất cả công việc đã được báo cáo.'}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate('/tasks?report=unreported')}
            className="h-11 rounded-xl bg-white/15 text-sm font-semibold ring-1 ring-inset ring-white/30 active:bg-white/25"
          >
            Xem danh sách
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports/new')}
            className="h-11 rounded-xl bg-white text-sm font-bold text-red-700 active:bg-red-50"
          >
            XUẤT BÁO CÁO
          </button>
        </div>
      </section>

      <Button size="lg" block icon="bolt" className="mt-3" onClick={() => navigate('/add')}>
        Ghi nhanh công việc
      </Button>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Stat
          label="Tổng công việc đã ghi nhận"
          value={stats.total}
          icon="list"
          tone="bg-slate-100 text-slate-700"
          to="/tasks"
        />
        <Stat
          label="Công việc đã hoàn thành"
          value={stats.done}
          icon="checkCircle"
          tone="bg-emerald-50 text-emerald-700"
          to="/tasks?status=done"
        />
        <Stat
          label="Công việc đang thực hiện"
          value={stats.inProgress}
          icon="clock"
          tone="bg-blue-50 text-blue-700"
          to="/tasks?status=in_progress"
        />
        <Stat
          label="Công việc chờ xử lý"
          value={stats.waiting}
          icon="inbox"
          tone="bg-orange-50 text-orange-700"
          to="/tasks?status=pending"
        />
        <Stat
          label="Công việc đã báo cáo"
          value={stats.reported}
          icon="check"
          tone="bg-slate-800 text-white"
          to="/tasks?report=reported"
        />
        <Stat
          label="Tổng số báo cáo đã xuất"
          value={stats.reports}
          icon="report"
          tone="bg-indigo-50 text-indigo-700"
          to="/reports"
        />
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-slate-400">“Chờ xử lý” gồm cả công việc chờ phản hồi.</p>

      <SectionTitle
        action={
          <Link to="/tasks?range=today" className="text-sm font-semibold text-brand-700">
            Xem tất cả
          </Link>
        }
      >
        Hôm nay · {stats.today} công việc
      </SectionTitle>
      {todayTasks.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-card">
          <EmptyState icon="bolt" title="Chưa ghi nhận công việc nào hôm nay">
            Bấm “Ghi nhanh công việc” để bắt đầu.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-2">
          {todayTasks.slice(0, 6).map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              member={t.team_member_id ? memberMap.get(t.team_member_id) : undefined}
              reportCode={t.report_id ? codes.get(t.report_id) : undefined}
              onToggleDone={toggleDone}
            />
          ))}
        </div>
      )}
    </Page>
  )
}
