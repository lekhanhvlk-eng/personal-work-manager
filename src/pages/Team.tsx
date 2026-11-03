import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { MemberFormSheet } from '../components/MemberForm'
import { Page, SyncIndicator } from '../components/Layout'
import { useToast } from '../components/Toast'
import { Button, Card, EmptyState, SectionTitle } from '../components/ui'
import type { Task } from '../lib/types'
import { useData } from '../state/selectors'
import { useSession } from '../state/StoreContext'

interface MemberStats {
  total: number
  open: number
  done: number
}

export function memberStats(tasks: Task[], memberId: string): MemberStats {
  const list = tasks.filter((t) => t.team_member_id === memberId)
  const done = list.filter((t) => t.status === 'done').length
  return { total: list.length, done, open: list.length - done }
}

export function TeamPage() {
  const { store } = useSession()
  const { members, tasks } = useData()
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const split = useMemo(() => {
    let self = 0
    let assigned = 0
    let coordinated = 0
    for (const t of tasks) {
      if (t.assignment_type === 'assigned') assigned++
      else if (t.assignment_type === 'coordinated') coordinated++
      else self++
    }
    return { self, assigned, coordinated }
  }, [tasks])

  const active = members.filter((m) => !m.archived).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  const archived = members.filter((m) => m.archived).sort((a, b) => a.name.localeCompare(b.name, 'vi'))

  return (
    <Page
      title="Đội nhóm"
      subtitle={`${active.length} thành viên đang hoạt động`}
      actions={
        <>
          <SyncIndicator />
          <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
            Thêm
          </Button>
        </>
      }
    >
      <Card className="grid grid-cols-3 divide-x divide-slate-100 p-1 text-center">
        <Link to="/tasks" className="p-3">
          <span className="block text-2xl font-extrabold text-slate-900">{split.self}</span>
          <span className="block text-xs text-slate-500">Tự thực hiện</span>
        </Link>
        <div className="p-3">
          <span className="block text-2xl font-extrabold text-brand-700">{split.assigned}</span>
          <span className="block text-xs text-slate-500">Đã giao việc</span>
        </div>
        <div className="p-3">
          <span className="block text-2xl font-extrabold text-sky-700">{split.coordinated}</span>
          <span className="block text-xs text-slate-500">Điều phối</span>
        </div>
      </Card>

      <SectionTitle>Thành viên</SectionTitle>
      {active.length === 0 ? (
        <Card>
          <EmptyState icon="users" title="Chưa có thành viên">
            Thêm thành viên để giao việc và theo dõi tiến độ.
            <div className="mt-3">
              <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
                Thêm thành viên
              </Button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-2">
          {active.map((m) => {
            const s = memberStats(tasks, m.id)
            return (
              <li key={m.id}>
                <Link
                  to={`/team/${m.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-card active:bg-slate-50"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base font-bold text-brand-800">
                    {m.name.trim().split(/\s+/).pop()?.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{m.name}</span>
                    <span className="block truncate text-xs text-slate-500">{m.role || 'Thành viên'}</span>
                  </span>
                  <span className="text-right text-xs leading-tight">
                    <span className="block font-semibold text-blue-700">{s.open} đang theo dõi</span>
                    <span className="block text-emerald-700">{s.done} hoàn thành</span>
                  </span>
                  <Icon name="chevronRight" className="h-5 w-5 text-slate-400" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <>
          <button
            type="button"
            className="mt-4 flex items-center gap-1 px-1 text-sm font-semibold text-slate-600"
            onClick={() => setShowArchived((v) => !v)}
          >
            <Icon name="archive" className="h-4 w-4" />
            {showArchived ? 'Ẩn' : 'Hiện'} thành viên đã lưu trữ ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-2">
              {archived.map((m) => (
                <li key={m.id}>
                  <Link
                    to={`/team/${m.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-white/60 p-3.5 text-slate-500 shadow-card"
                  >
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-xs">Đã lưu trữ</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {adding && (
        <MemberFormSheet
          open
          title="Thêm thành viên"
          onClose={() => setAdding(false)}
          onSubmit={(v) => {
            store.addMember(v)
            setAdding(false)
            toast(`Đã thêm ${v.name}.`)
          }}
        />
      )}
    </Page>
  )
}
