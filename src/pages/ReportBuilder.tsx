import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Page } from '../components/Layout'
import { StatusBadge } from '../components/TaskCard'
import { useToast } from '../components/Toast'
import { Badge, Button, ConfirmDialog, EmptyState } from '../components/ui'
import { RepoError } from '../data/errors'
import { copyText } from '../lib/clipboard'
import { categoryInfo } from '../lib/constants'
import { formatDateTimeVN, formatDateVN, formatDayHeading, todayVN } from '../lib/dates'
import {
  generateReport,
  groupByDate,
  summarize,
  type ReportOptions,
  type ReportTaskInput,
} from '../lib/reportGenerator'
import type { Task } from '../lib/types'
import { uuid } from '../lib/uuid'
import {
  clearReportDraft,
  isMeaningfulDraft,
  loadReportDraft,
  newReportDraft,
  reconcileDraft,
  saveReportDraft,
  type ReportDraft,
} from '../state/drafts'
import { useData, useMemberMap } from '../state/selectors'
import { useAppState, useSession } from '../state/StoreContext'

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

export function ReportBuilderPage() {
  const { store, scope } = useSession()
  const { ready, online } = useAppState()
  const { tasks, reports } = useData()
  const memberMap = useMemberMap()
  const toast = useToast()
  const navigate = useNavigate()

  const [draft, setDraftState] = useState<ReportDraft>(() => loadReportDraft(scope) ?? newReportDraft())
  const [resumed] = useState(() => isMeaningfulDraft(loadReportDraft(scope)))
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const submitting = useRef(false)
  const reconciled = useRef(false)

  const setDraft = (next: ReportDraft | ((d: ReportDraft) => ReportDraft)) => {
    setDraftState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      saveReportDraft(scope, value)
      return value
    })
  }

  // Công việc đủ điều kiện: tất cả công việc CHƯA BÁO CÁO, không phụ thuộc ngày.
  const eligible = useMemo(() => tasks.filter((t) => t.report_status === 'unreported'), [tasks])
  const groups = useMemo(() => groupByDate(eligible), [eligible])
  const selectedSet = useMemo(() => new Set(draft.selectedIds), [draft.selectedIds])
  const selectedTasks = useMemo(() => eligible.filter((t) => selectedSet.has(t.id)), [eligible, selectedSet])

  // Đối chiếu bản nháp khi dữ liệu thay đổi (ví dụ đã xuất từ thiết bị khác).
  useEffect(() => {
    if (!ready || exporting) return
    // Bản nháp này đã được máy chủ xác nhận trước đó (ví dụ mất phản hồi)?
    const done = reports.find((r) => r.request_id === draft.requestId)
    if (done) {
      clearReportDraft(scope)
      toast(`Báo cáo ${done.code} đã được xuất thành công trước đó.`, 'info')
      navigate(`/reports/${done.id}`, { replace: true })
      return
    }
    const { draft: next, removed } = reconcileDraft(draft, tasks)
    if (removed > 0) {
      setDraft(next)
      toast(`${removed} công việc đã chọn không còn ở trạng thái “Chưa báo cáo” và đã được bỏ khỏi bản nháp.`, 'info')
    }
    reconciled.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tasks, reports])

  const toReportInput = (t: Task): ReportTaskInput => ({
    ...t,
    team_member_name: t.team_member_id ? (memberMap.get(t.team_member_id)?.name ?? null) : null,
  })

  const buildContent = (ids: Set<string>, options: ReportOptions) =>
    generateReport(eligible.filter((t) => ids.has(t.id)).map(toReportInput), options)

  const toggle = (id: string) =>
    setDraft((d) => ({
      ...d,
      selectedIds: d.selectedIds.includes(id) ? d.selectedIds.filter((x) => x !== id) : [...d.selectedIds, id],
    }))

  const selectAll = () => setDraft((d) => ({ ...d, selectedIds: eligible.map((t) => t.id) }))
  const clearAll = () => setDraft((d) => ({ ...d, selectedIds: [] }))

  const createPreview = () => {
    if (selectedTasks.length === 0) return
    const ids = selectedTasks.map((t) => t.id)
    setDraft((d) => {
      if (d.edited && d.content.trim() && sameSet(d.generatedFor, ids)) return { ...d, step: 'preview' }
      if (d.edited && d.content.trim()) toast('Lựa chọn đã thay đổi nên nội dung báo cáo được tạo lại.', 'info')
      return { ...d, step: 'preview', content: buildContent(new Set(ids), d.options), edited: false, generatedFor: ids }
    })
    window.scrollTo(0, 0)
  }

  const regenerate = (options: ReportOptions) => {
    const ids = selectedTasks.map((t) => t.id)
    setDraft((d) => ({ ...d, options, content: buildContent(new Set(ids), options), edited: false, generatedFor: ids }))
  }

  const copy = async () => {
    // CHỈ sao chép — không thay đổi trạng thái báo cáo của bất kỳ công việc nào.
    const ok = await copyText(draft.content)
    toast(
      ok
        ? 'Đã sao chép báo cáo. Công việc vẫn “Chưa báo cáo” cho tới khi bạn xác nhận xuất.'
        : 'Không thể sao chép, hãy chọn và sao chép thủ công.',
      ok ? 'success' : 'error',
    )
  }

  const confirmExport = async () => {
    if (submitting.current) return // chống bấm nhiều lần
    submitting.current = true
    setExporting(true)
    try {
      const report = await store.confirmExport({
        requestId: draft.requestId,
        taskIds: selectedTasks.map((t) => t.id),
        content: draft.content,
      })
      clearReportDraft(scope)
      setConfirmOpen(false)
      toast(`Đã xuất báo cáo ${report.code} (${report.task_count} công việc).`)
      navigate(`/reports/${report.id}`, { replace: true })
    } catch (e) {
      const err = e instanceof RepoError ? e : new RepoError('UNKNOWN')
      setConfirmOpen(false)
      if (err.code === 'REQUEST_ID_CONFLICT') {
        setDraft((d) => ({ ...d, requestId: uuid() }))
        toast('Lựa chọn đã thay đổi so với lần gửi trước. Vui lòng bấm xác nhận lại.', 'info')
      } else if (err.code === 'NETWORK' || err.code === 'PENDING_SYNC') {
        toast(`${err.message} Báo cáo CHƯA được xuất; bản nháp vẫn được giữ.`, 'error')
      } else {
        toast(`${err.message} Báo cáo CHƯA được xuất.`, 'error')
      }
    } finally {
      submitting.current = false
      setExporting(false)
    }
  }

  const discard = () => {
    clearReportDraft(scope)
    setDraftState(newReportDraft())
    setDiscardOpen(false)
    toast('Đã huỷ bản nháp. Tất cả công việc vẫn giữ trạng thái “Chưa báo cáo”.', 'info')
  }

  const today = todayVN()
  const summary = summarize(selectedTasks)
  const unselected = eligible.length - selectedTasks.length

  // ------------------------------------------------------------------ BƯỚC 2: XEM TRƯỚC
  if (draft.step === 'preview' && selectedTasks.length > 0) {
    return (
      <Page title="Xem trước báo cáo" subtitle={`${selectedTasks.length} công việc đã chọn`} back="/reports">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Badge className="bg-brand-50 text-brand-800">{summary.total} công việc</Badge>
          <Badge className="bg-brand-50 text-brand-800">{summary.days} ngày</Badge>
          <Badge className="bg-brand-50 text-brand-800">
            {formatDateVN(summary.dateFrom)}
            {summary.dateFrom !== summary.dateTo ? ` – ${formatDateVN(summary.dateTo)}` : ''}
          </Badge>
          <Badge className="bg-emerald-50 text-emerald-800">{summary.done} hoàn thành</Badge>
        </div>

        <details className="mb-3 rounded-2xl bg-white p-3 shadow-card">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Tuỳ chọn nội dung</summary>
          <div className="mt-2 space-y-2">
            {(
              [
                ['showStatus', 'Ghi chú trạng thái việc chưa hoàn thành'],
                ['showMember', 'Ghi tên thành viên được giao / phối hợp'],
                ['showNotes', 'Kèm ghi chú của công việc'],
              ] as [keyof ReportOptions, string][]
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-3 py-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-brand-600"
                  checked={draft.options[key]}
                  onChange={(e) => {
                    const options = { ...draft.options, [key]: e.target.checked }
                    if (draft.edited) setDraft((d) => ({ ...d, options }))
                    else regenerate(options)
                  }}
                />
                {label}
              </label>
            ))}
            {draft.edited && (
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => regenerate(draft.options)}>
                Tạo lại nội dung (bỏ phần đã sửa)
              </Button>
            )}
          </div>
        </details>

        <label htmlFor="report-content" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Nội dung báo cáo {draft.edited && <span className="font-normal text-amber-700">· đã chỉnh sửa</span>}
        </label>
        <textarea
          id="report-content"
          className="block min-h-[50vh] w-full rounded-2xl border-0 bg-white p-4 text-[15px] leading-relaxed text-slate-900 shadow-card ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-brand-500"
          value={draft.content}
          onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value, edited: true }))}
          spellCheck={false}
        />
        <p className="mt-1.5 px-1 text-xs text-slate-500">
          Chỉnh sửa tại đây không làm thay đổi công việc gốc. Nội dung này sẽ được lưu cố định khi bạn xác nhận xuất.
        </p>
        {!online && (
          <p className="mt-2 rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-700">
            Đang ngoại tuyến — bạn vẫn có thể sao chép, nhưng cần có mạng để xác nhận xuất báo cáo.
          </p>
        )}

        <div className="sticky bottom-0 z-20 -mx-4 mt-4 space-y-2 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur pb-safe">
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon="back"
              onClick={() => setDraft((d) => ({ ...d, step: 'select' }))}
              className="shrink-0"
            >
              Chọn lại
            </Button>
            <Button variant="secondary" icon="copy" block onClick={copy} disabled={!draft.content.trim()}>
              Sao chép báo cáo
            </Button>
          </div>
          <Button
            variant="success"
            size="lg"
            icon="send"
            block
            onClick={() => setConfirmOpen(true)}
            disabled={!draft.content.trim() || exporting}
            loading={exporting}
          >
            Xác nhận xuất báo cáo
          </Button>
        </div>

        <ConfirmDialog
          open={confirmOpen}
          title="Xác nhận xuất báo cáo?"
          confirmLabel="Xác nhận xuất"
          loading={exporting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={confirmExport}
          message={
            <>
              <strong>{selectedTasks.length}</strong> công việc đã chọn sẽ được đánh dấu <strong>“Đã báo cáo”</strong>{' '}
              và gắn với một mã báo cáo mới.
              {unselected > 0 && (
                <>
                  {' '}
                  <strong>{unselected}</strong> công việc không chọn vẫn giữ trạng thái “Chưa báo cáo” cho lần sau.
                </>
              )}
            </>
          }
        />
      </Page>
    )
  }

  // ------------------------------------------------------------------ BƯỚC 1: CHỌN CÔNG VIỆC
  return (
    <Page
      title="Xuất báo cáo mới"
      subtitle="Chọn từng công việc cần đưa vào báo cáo"
      back="/reports"
      actions={
        isMeaningfulDraft(draft) ? (
          <Button variant="ghost" size="sm" onClick={() => setDiscardOpen(true)}>
            Huỷ nháp
          </Button>
        ) : undefined
      }
    >
      {resumed && isMeaningfulDraft(draft) && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Đang tiếp tục bản nháp lưu lúc {formatDateTimeVN(draft.updatedAt)}. Chưa có công việc nào bị đánh dấu.
        </p>
      )}

      {!ready ? null : eligible.length === 0 ? (
        <EmptyState icon="checkCircle" title="Không có công việc chưa báo cáo">
          Tất cả công việc đã được báo cáo. Ghi nhận thêm công việc để tạo báo cáo mới.
        </EmptyState>
      ) : (
        <>
          <div className="sticky top-[56px] z-20 -mx-4 mb-3 border-b border-slate-200/70 bg-slate-50/95 px-4 py-2 backdrop-blur">
            <div className="space-y-2">
              <p className="text-sm text-slate-700" data-testid="selection-counts">
                Đã chọn <strong className="text-brand-700">{selectedTasks.length}</strong> · Chưa chọn{' '}
                <strong>{unselected}</strong> · Tổng {eligible.length} việc chưa báo cáo
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={selectAll}
                  disabled={selectedTasks.length === eligible.length}
                >
                  Chọn tất cả
                </Button>
                <Button variant="secondary" size="sm" onClick={clearAll} disabled={selectedTasks.length === 0}>
                  Bỏ chọn tất cả
                </Button>
              </div>
            </div>
          </div>

          {groups.map((g) => (
            <section key={g.date} className="mb-4">
              <h2 className="mb-2 px-1 text-sm font-bold text-slate-600">
                {formatDayHeading(g.date, today)}{' '}
                <span className="font-medium text-slate-400">· {g.tasks.length} việc</span>
              </h2>
              <ul className="space-y-2">
                {g.tasks.map((t) => {
                  const checked = selectedSet.has(t.id)
                  const member = t.team_member_id ? memberMap.get(t.team_member_id) : undefined
                  return (
                    <li key={t.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-3.5 shadow-card ring-2 transition-colors ${
                          checked ? 'ring-brand-500' : 'ring-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-6 w-6 shrink-0 accent-brand-600"
                          checked={checked}
                          onChange={() => toggle(t.id)}
                          aria-label={t.description}
                          data-task-id={t.id}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium leading-snug text-slate-900">
                            {t.description}
                          </span>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            <StatusBadge status={t.status} />
                            <Badge className={categoryInfo(t.category).color}>{categoryInfo(t.category).short}</Badge>
                            {member && (
                              <Badge className="bg-sky-50 text-sky-800">
                                <Icon name="user" className="h-3 w-3" />
                                {member.name}
                              </Badge>
                            )}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur pb-safe">
            <Button size="lg" block icon="report" disabled={selectedTasks.length === 0} onClick={createPreview}>
              Tạo báo cáo ({selectedTasks.length})
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={discardOpen}
        title="Huỷ bản nháp báo cáo?"
        message="Lựa chọn và nội dung đã chỉnh sửa sẽ bị xoá. Không có công việc nào bị thay đổi trạng thái."
        confirmLabel="Huỷ bản nháp"
        cancelLabel="Giữ lại"
        danger
        onCancel={() => setDiscardOpen(false)}
        onConfirm={discard}
      />
    </Page>
  )
}
