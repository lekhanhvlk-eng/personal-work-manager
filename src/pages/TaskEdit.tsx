import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Page } from '../components/Layout'
import { ReportBadge } from '../components/TaskCard'
import { TaskForm } from '../components/TaskForm'
import { useToast } from '../components/Toast'
import { Button, Card, ConfirmDialog, EmptyState, inputClass } from '../components/ui'
import { formatDateTimeVN } from '../lib/dates'
import { useData } from '../state/selectors'
import { useSession } from '../state/StoreContext'

export function TaskEditPage() {
  const { id } = useParams()
  const { store } = useSession()
  const { tasks, members, reports } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoreNote, setRestoreNote] = useState('')
  const [restoring, setRestoring] = useState(false)

  const task = tasks.find((t) => t.id === id)
  if (!task) {
    return (
      <Page title="Công việc" back>
        <EmptyState title="Không tìm thấy công việc">Công việc có thể đã bị xoá.</EmptyState>
      </Page>
    )
  }
  const report = task.report_id ? reports.find((r) => r.id === task.report_id) : undefined

  return (
    <Page
      title="Chi tiết công việc"
      back
      actions={
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="rounded-full p-2 text-red-600 active:bg-red-50"
          aria-label="Xoá công việc"
        >
          <Icon name="trash" className="h-6 w-6" />
        </button>
      }
    >
      <Card className="mb-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">Trạng thái báo cáo</span>
          <ReportBadge task={task} />
        </div>
        {task.report_status === 'reported' && (
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            {report ? (
              <p>
                Thuộc báo cáo{' '}
                <Link to={`/reports/${report.id}`} className="font-semibold text-brand-700 underline">
                  {report.code}
                </Link>{' '}
                · xuất lúc {formatDateTimeVN(task.reported_at)}
              </p>
            ) : (
              <p>Đã báo cáo lúc {formatDateTimeVN(task.reported_at)}</p>
            )}
            <p className="text-xs text-slate-500">Chỉnh sửa công việc không làm thay đổi nội dung báo cáo đã xuất.</p>
            <Button variant="secondary" size="sm" icon="restore" onClick={() => setConfirmRestore(true)}>
              Khôi phục về “Chưa báo cáo”
            </Button>
          </div>
        )}
      </Card>

      <TaskForm
        mode="edit"
        initial={task}
        members={members}
        onSubmit={(values) => {
          store.updateTask(task.id, values)
          toast('Đã lưu thay đổi.')
          navigate(-1)
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        danger
        title="Xoá công việc này?"
        message={
          <>
            Công việc sẽ bị xoá vĩnh viễn và không thể hoàn tác.
            {task.report_status === 'reported' && ' Báo cáo đã xuất trước đó vẫn được giữ nguyên.'}
          </>
        }
        confirmLabel="Xoá"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          store.deleteTask(task.id)
          setConfirmDelete(false)
          toast('Đã xoá công việc.')
          navigate('/tasks', { replace: true })
        }}
      />

      <ConfirmDialog
        open={confirmRestore}
        title="Khôi phục công việc?"
        message="Công việc sẽ trở về trạng thái “Chưa báo cáo” để đưa vào báo cáo sau. Báo cáo cũ vẫn được giữ nguyên và sự kiện khôi phục sẽ được ghi lại."
        confirmLabel="Khôi phục"
        loading={restoring}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={async () => {
          setRestoring(true)
          try {
            await store.restoreTask(task.id, restoreNote.trim() || null)
            toast('Đã khôi phục công việc về “Chưa báo cáo”.')
            setConfirmRestore(false)
            setRestoreNote('')
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
          value={restoreNote}
          onChange={(e) => setRestoreNote(e.target.value)}
        />
      </ConfirmDialog>
    </Page>
  )
}
