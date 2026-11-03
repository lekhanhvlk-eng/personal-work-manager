import { Link } from 'react-router-dom'
import { categoryInfo, priorityInfo, statusInfo } from '../lib/constants'
import { formatDateVN } from '../lib/dates'
import type { Task, TeamMember } from '../lib/types'
import { Icon } from './Icon'
import { Badge } from './ui'

export function StatusBadge({ status }: { status: Task['status'] }) {
  const s = statusInfo(status)
  return (
    <Badge className={s.color}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Badge>
  )
}

export function ReportBadge({ task, code }: { task: Task; code?: string }) {
  return task.report_status === 'reported' ? (
    <Badge className="bg-slate-800 text-white">
      <Icon name="check" className="h-3 w-3" />
      Đã báo cáo{code ? ` · ${code}` : ''}
    </Badge>
  ) : (
    <Badge className="bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">Chưa báo cáo</Badge>
  )
}

export function TaskCard({
  task,
  member,
  reportCode,
  onToggleDone,
  showDate,
}: {
  task: Task
  member?: TeamMember
  reportCode?: string
  onToggleDone?: (task: Task) => void
  showDate?: boolean
}) {
  const cat = categoryInfo(task.category)
  const done = task.status === 'done'
  return (
    <div className="flex items-start gap-1 rounded-2xl bg-white p-1 shadow-card" data-testid="task-card">
      {onToggleDone && (
        <button
          type="button"
          onClick={() => onToggleDone(task)}
          className={`shrink-0 rounded-full p-2.5 ${done ? 'text-emerald-600' : 'text-slate-300'} active:bg-slate-100`}
          aria-label={done ? 'Bỏ đánh dấu hoàn thành' : 'Đánh dấu hoàn thành'}
        >
          <Icon name={done ? 'checkCircle' : 'circle'} className="h-6 w-6" />
        </button>
      )}
      <Link to={`/tasks/${task.id}`} className={`min-w-0 flex-1 py-2 pr-3 ${onToggleDone ? '' : 'pl-3'}`}>
        <p
          className={`line-clamp-3 text-[15px] font-medium leading-snug ${done ? 'text-slate-600' : 'text-slate-900'}`}
        >
          {task.description}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showDate && (
            <Badge className="bg-slate-100 text-slate-600">
              <Icon name="calendar" className="h-3 w-3" />
              {formatDateVN(task.work_date)}
            </Badge>
          )}
          <StatusBadge status={task.status} />
          <Badge className={cat.color}>{cat.short}</Badge>
          {task.priority === 'high' && <Badge className={priorityInfo('high').color}>Ưu tiên cao</Badge>}
          {member && (
            <Badge className="bg-sky-50 text-sky-800">
              <Icon name="user" className="h-3 w-3" />
              {task.assignment_type === 'assigned'
                ? 'Giao: '
                : task.assignment_type === 'coordinated'
                  ? 'Phối hợp: '
                  : ''}
              {member.name}
            </Badge>
          )}
          {!member && task.assignment_type !== 'self' && (
            <Badge className="bg-sky-50 text-sky-800">
              {task.assignment_type === 'assigned' ? 'Giao việc' : 'Điều phối'}
            </Badge>
          )}
          <ReportBadge task={task} code={reportCode} />
        </div>
      </Link>
    </div>
  )
}
