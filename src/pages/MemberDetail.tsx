import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MemberFormSheet } from '../components/MemberForm'
import { Page } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { useToast } from '../components/Toast'
import { Button, Card, Chip, ConfirmDialog, EmptyState, SectionTitle } from '../components/ui'
import { STATUSES } from '../lib/constants'
import { sortNewestFirst } from '../lib/filters'
import type { Task, TaskStatus } from '../lib/types'
import { useData, useReportCodeMap } from '../state/selectors'
import { useSession } from '../state/StoreContext'

export function MemberDetailPage() {
  const { id } = useParams()
  const { store } = useSession()
  const { members, tasks } = useData()
  const codes = useReportCodeMap()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [status, setStatus] = useState<TaskStatus | null>(null)

  const member = members.find((m) => m.id === id)
  const memberTasks = useMemo(() => sortNewestFirst(tasks.filter((t) => t.team_member_id === id)), [tasks, id])
  if (!member) {
    return (
      <Page title="Thành viên" back="/team">
        <EmptyState title="Không tìm thấy thành viên" />
      </Page>
    )
  }
  const counts = Object.fromEntries(STATUSES.map((s) => [s.key, memberTasks.filter((t) => t.status === s.key).length]))
  const visible = status ? memberTasks.filter((t) => t.status === status) : memberTasks

  const toggleDone = (t: Task) => {
    store.updateTask(t.id, { status: t.status === 'done' ? 'in_progress' : 'done' })
    toast(t.status === 'done' ? 'Đã chuyển về “Đang thực hiện”.' : 'Đã đánh dấu hoàn thành.')
  }

  return (
    <Page title={member.name} subtitle={member.role ?? (member.archived ? 'Đã lưu trữ' : 'Thành viên')} back="/team">
      <Card className="p-4">
        {member.phone && (
          <p className="text-sm text-slate-600">
            Điện thoại:{' '}
            <a href={`tel:${member.phone}`} className="font-semibold text-brand-700">
              {member.phone}
            </a>
          </p>
        )}
        {member.note && <p className="mt-1 text-sm text-slate-600">{member.note}</p>}
        {member.archived && <p className="mt-1 text-sm font-semibold text-amber-700">Thành viên đã được lưu trữ.</p>}
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" icon="pencil" onClick={() => setEditing(true)}>
            Sửa
          </Button>
          <Button variant="secondary" size="sm" icon="archive" onClick={() => setArchiveOpen(true)}>
            {member.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
          </Button>
        </div>
      </Card>

      {!member.archived && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button icon="send" onClick={() => navigate(`/add?member=${member.id}&type=assigned`)}>
            Giao việc
          </Button>
          <Button
            variant="secondary"
            icon="users"
            onClick={() => navigate(`/add?member=${member.id}&type=coordinated`)}
          >
            Ghi nhận điều phối
          </Button>
        </div>
      )}

      <SectionTitle>Công việc liên quan · {memberTasks.length}</SectionTitle>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip selected={!status} onClick={() => setStatus(null)}>
          Tất cả
        </Chip>
        {STATUSES.map((s) => (
          <Chip key={s.key} selected={status === s.key} onClick={() => setStatus(s.key)}>
            {s.label} ({counts[s.key]})
          </Chip>
        ))}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Chưa có công việc">Dùng “Giao việc” hoặc “Ghi nhận điều phối” để thêm.</EmptyState>
      ) : (
        <div className="space-y-2">
          {visible.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              member={member}
              reportCode={t.report_id ? codes.get(t.report_id) : undefined}
              onToggleDone={toggleDone}
              showDate
            />
          ))}
        </div>
      )}

      {editing && (
        <MemberFormSheet
          open
          title="Sửa thông tin thành viên"
          initial={member}
          onClose={() => setEditing(false)}
          onSubmit={(v) => {
            store.updateMember(member.id, v)
            setEditing(false)
            toast('Đã lưu thông tin thành viên.')
          }}
        />
      )}
      <ConfirmDialog
        open={archiveOpen}
        title={member.archived ? 'Bỏ lưu trữ thành viên?' : 'Lưu trữ thành viên?'}
        message={
          member.archived
            ? 'Thành viên sẽ xuất hiện lại trong danh sách để giao việc.'
            : 'Thành viên sẽ được ẩn khỏi danh sách giao việc. Toàn bộ lịch sử công việc vẫn được giữ nguyên.'
        }
        confirmLabel={member.archived ? 'Bỏ lưu trữ' : 'Lưu trữ'}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          store.updateMember(member.id, { archived: !member.archived })
          setArchiveOpen(false)
          toast(member.archived ? 'Đã bỏ lưu trữ.' : 'Đã lưu trữ thành viên.')
        }}
      />
    </Page>
  )
}
