import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Page } from '../components/Layout'
import { StatusBadge } from '../components/TaskCard'
import { useToast } from '../components/Toast'
import { Badge, Button, Card, ConfirmDialog, EmptyState, SectionTitle, inputClass } from '../components/ui'
import { copyText } from '../lib/clipboard'
import { formatDateTimeVN, formatDateVN } from '../lib/dates'
import type { TaskSnapshot } from '../lib/types'
import { useData } from '../state/selectors'
import { useSession } from '../state/StoreContext'

export function ReportDetailPage() {
  const { id } = useParams()
  const { store } = useSession()
  const { reports, tasks, events } = useData()
  const toast = useToast()
  const [restoreTarget, setRestoreTarget] = useState<TaskSnapshot | null>(null)
  const [note, setNote] = useState('')
  const [restoring, setRestoring] = useState(false)

  const report = reports.find((r) => r.id === id)
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const reportEvents = useMemo(
    () => events.filter((e) => e.report_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [events, id],
  )

  if (!report) {
    return (
      <Page title="Báo cáo" back="/reports">
        <EmptyState title="Không tìm thấy báo cáo" />
      </Page>
    )
  }

  const snapshot = [...report.task_snapshot]
  const snapshotIds = new Set(snapshot.map((s) => s.id))
  // Phòng trường hợp báo cáo nhập từ sao lưu không có ảnh chụp chi tiết.
  for (const tid of report.task_ids) {
    if (!snapshotIds.has(tid)) {
      snapshot.push({ id: tid, description: '(không có ảnh chụp chi tiết)' } as TaskSnapshot)
    }
  }

  return (
    <Page title={report.code} subtitle={`Xuất lúc ${formatDateTimeVN(report.exported_at)}`} back="/reports">
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge className="bg-emerald-50 text-emerald-700">
          <Icon name="check" className="h-3 w-3" />
          Đã xác nhận
        </Badge>
        <Badge className="bg-slate-100 text-slate-700">{report.task_count} công việc</Badge>
        <Badge className="bg-slate-100 text-slate-700">
          Ngày {formatDateVN(report.date_from)}
          {report.date_from !== report.date_to ? ` – ${formatDateVN(report.date_to)}` : ''}
        </Badge>
      </div>

      <Card className="p-4">
        <pre
          className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-slate-900"
          data-testid="report-content"
        >
          {report.content}
        </pre>
      </Card>
      <p className="mt-1.5 px-1 text-xs text-slate-500">
        Đây là ảnh chụp cố định tại thời điểm xuất — không thay đổi khi công việc gốc được chỉnh sửa.
      </p>
      <Button
        className="mt-3"
        block
        size="lg"
        icon="copy"
        onClick={async () =>
          toast((await copyText(report.content)) ? 'Đã sao chép báo cáo.' : 'Không thể sao chép.', 'success')
        }
      >
        Sao chép báo cáo
      </Button>

      <SectionTitle>Công việc trong báo cáo</SectionTitle>
      <ul className="space-y-2">
        {snapshot.map((s) => {
          const current = taskMap.get(s.id)
          const stillLinked = current?.report_id === report.id
          return (
            <li key={s.id} className="rounded-2xl bg-white p-3.5 shadow-card">
              <p className="text-[15px] font-medium leading-snug text-slate-900">{s.description}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {s.work_date && <Badge className="bg-slate-100 text-slate-600">{formatDateVN(s.work_date)}</Badge>}
                {s.status && <StatusBadge status={s.status} />}
                {s.team_member_name && <Badge className="bg-sky-50 text-sky-800">{s.team_member_name}</Badge>}
                {!current ? (
                  <Badge className="bg-slate-100 text-slate-500">Công việc gốc đã bị xoá</Badge>
                ) : stillLinked ? null : (
                  <Badge className="bg-amber-50 text-amber-800">
                    {current.report_status === 'unreported'
                      ? 'Đã khôi phục · chờ báo cáo lại'
                      : 'Đã khôi phục & báo cáo lại'}
                  </Badge>
                )}
              </div>
              {current && (
                <div className="mt-2 flex gap-2">
                  <Link to={`/tasks/${current.id}`} className="text-sm font-semibold text-brand-700">
                    Xem công việc
                  </Link>
                  {stillLinked && (
                    <button
                      type="button"
                      onClick={() => setRestoreTarget(s)}
                      className="ml-auto flex items-center gap-1 text-sm font-semibold text-slate-600"
                    >
                      <Icon name="restore" className="h-4 w-4" />
                      Khôi phục về chưa báo cáo
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <SectionTitle>Nhật ký</SectionTitle>
      <ol className="space-y-2 border-l-2 border-slate-200 pl-4">
        {reportEvents.map((e) => {
          const s = snapshot.find((x) => x.id === e.task_id)
          return (
            <li key={e.id} className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{formatDateTimeVN(e.created_at)}</span> ·{' '}
              {e.event_type === 'exported' ? (
                <>Xác nhận xuất báo cáo ({report.task_count} công việc)</>
              ) : (
                <>
                  Khôi phục “{s?.description ?? 'công việc'}” về chưa báo cáo{e.note ? ` — Lý do: ${e.note}` : ''}
                </>
              )}
            </li>
          )
        })}
        {reportEvents.length === 0 && (
          <li className="text-sm text-slate-500">Xác nhận xuất lúc {formatDateTimeVN(report.exported_at)}</li>
        )}
      </ol>

      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Khôi phục công việc?"
        message="Công việc sẽ trở về “Chưa báo cáo” và xuất hiện trong lần xuất báo cáo tiếp theo. Báo cáo này vẫn được giữ nguyên và sự kiện khôi phục được ghi lại."
        confirmLabel="Khôi phục"
        loading={restoring}
        onCancel={() => setRestoreTarget(null)}
        onConfirm={async () => {
          if (!restoreTarget) return
          setRestoring(true)
          try {
            await store.restoreTask(restoreTarget.id, note.trim() || null)
            toast('Đã khôi phục công việc về “Chưa báo cáo”.')
            setRestoreTarget(null)
            setNote('')
          } catch (e) {
            toast((e as Error).message, 'error')
          } finally {
            setRestoring(false)
          }
        }}
      >
        <textarea
          rows={2}
          className={`${inputClass} mt-3 resize-none`}
          placeholder="Lý do khôi phục (không bắt buộc)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmDialog>
    </Page>
  )
}
