import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Page, SyncIndicator } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Badge, EmptyState, SectionTitle, inputClass } from '../components/ui'
import { copyText } from '../lib/clipboard'
import { formatDateTimeVN, formatDateVN } from '../lib/dates'
import { foldVietnamese } from '../lib/filters'
import { isMeaningfulDraft, loadReportDraft } from '../state/drafts'
import { useData } from '../state/selectors'
import { useSession } from '../state/StoreContext'

export function ReportsPage() {
  const { scope } = useSession()
  const { tasks, reports, events } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const unreported = tasks.filter((t) => t.report_status === 'unreported').length
  const draft = loadReportDraft(scope)
  const hasDraft = isMeaningfulDraft(draft)

  const restoredCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of events) if (e.event_type === 'task_restored') m.set(e.report_id, (m.get(e.report_id) ?? 0) + 1)
    return m
  }, [events])

  const list = useMemo(() => {
    const k = foldVietnamese(q.trim())
    return [...reports]
      .sort((a, b) => b.exported_at.localeCompare(a.exported_at))
      .filter(
        (r) =>
          !k ||
          foldVietnamese(`${r.code} ${r.content} ${formatDateVN(r.date_from)} ${formatDateVN(r.date_to)}`).includes(k),
      )
  }, [reports, q])

  return (
    <Page title="Báo cáo" subtitle={`${reports.length} báo cáo đã xuất`} actions={<SyncIndicator />}>
      <button
        type="button"
        onClick={() => navigate('/reports/new')}
        className="flex w-full items-center gap-4 rounded-3xl bg-brand-600 p-5 text-left text-white shadow-lg shadow-brand-600/25 active:bg-brand-700"
      >
        <span className="rounded-2xl bg-white/15 p-3">
          <Icon name="report" className="h-8 w-8" />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-extrabold tracking-wide">XUẤT BÁO CÁO MỚI</span>
          <span className="block text-sm text-white/85">
            {unreported} công việc chưa báo cáo{hasDraft ? ' · có bản nháp đang dở' : ''}
          </span>
        </span>
        <Icon name="chevronRight" className="h-6 w-6" />
      </button>

      <SectionTitle>Lịch sử báo cáo</SectionTitle>
      <div className="relative mb-3">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
        />
        <input
          type="search"
          className={`${inputClass} pl-11`}
          placeholder="Tìm theo mã, nội dung, ngày…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Tìm kiếm báo cáo"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState icon="report" title={reports.length ? 'Không tìm thấy báo cáo' : 'Chưa có báo cáo nào'}>
          {reports.length ? 'Thử từ khoá khác.' : 'Báo cáo sau khi xác nhận xuất sẽ được lưu tại đây.'}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id} className="rounded-2xl bg-white shadow-card">
              <Link to={`/reports/${r.id}`} className="block p-4 active:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{r.code}</span>
                  <Badge className="bg-emerald-50 text-emerald-700">
                    <Icon name="check" className="h-3 w-3" />
                    Đã xác nhận
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {r.task_count} công việc · ngày {formatDateVN(r.date_from)}
                  {r.date_from !== r.date_to ? ` – ${formatDateVN(r.date_to)}` : ''}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Xuất lúc {formatDateTimeVN(r.exported_at)}
                  {restoredCount.get(r.id) ? ` · ${restoredCount.get(r.id)} việc đã khôi phục` : ''}
                </p>
              </Link>
              <div className="border-t border-slate-100 px-2 py-1">
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 active:bg-brand-50"
                  onClick={async () =>
                    toast((await copyText(r.content)) ? `Đã sao chép ${r.code}.` : 'Không thể sao chép.')
                  }
                >
                  <Icon name="copy" className="h-4 w-4" />
                  Sao chép
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
