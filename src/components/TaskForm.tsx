import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ASSIGNMENT_TYPES, CATEGORIES, PRIORITIES, STATUSES } from '../lib/constants'
import { addDays, formatDateVN, todayVN } from '../lib/dates'
import type { TaskInput, TeamMember } from '../lib/types'
import { Icon } from './Icon'
import { Button, Chip, Field, inputClass } from './ui'

export type TaskFormValues = TaskInput

export function defaultTaskValues(overrides: Partial<TaskFormValues> = {}): TaskFormValues {
  return {
    description: '',
    work_date: todayVN(),
    category: 'other',
    status: 'done',
    priority: null,
    assignment_type: 'self',
    team_member_id: null,
    notes: null,
    due_date: null,
    ...overrides,
  }
}

function hasDetails(v: TaskFormValues) {
  return Boolean(v.priority || v.team_member_id || v.notes || v.due_date || v.assignment_type !== 'self')
}

export function TaskForm({
  initial,
  members,
  mode,
  onSubmit,
  onChange,
  autoFocus,
}: {
  initial: TaskFormValues
  members: TeamMember[]
  mode: 'add' | 'edit'
  onSubmit: (values: TaskFormValues, opts: { addAnother: boolean }) => void
  onChange?: (values: TaskFormValues) => void
  autoFocus?: boolean
}) {
  const [v, setV] = useState<TaskFormValues>(initial)
  const [showDetails, setShowDetails] = useState(mode === 'edit' || hasDetails(initial))
  const [error, setError] = useState<string | null>(null)
  const descRef = useRef<HTMLTextAreaElement>(null)
  const today = todayVN()
  const yesterday = addDays(today, -1)

  useEffect(() => {
    if (autoFocus) descRef.current?.focus()
  }, [autoFocus])

  const update = (patch: Partial<TaskFormValues>) => {
    setV((prev) => {
      const next = { ...prev, ...patch }
      onChange?.(next)
      return next
    })
    if (patch.description !== undefined && patch.description.trim()) setError(null)
  }

  const submit = (addAnother: boolean) => (e?: FormEvent) => {
    e?.preventDefault()
    if (!v.description.trim()) {
      setError('Vui lòng nhập nội dung công việc.')
      descRef.current?.focus()
      return
    }
    onSubmit({ ...v, description: v.description.trim(), notes: v.notes?.trim() || null }, { addAnother })
    if (addAnother) {
      const next = { ...v, description: '', notes: null }
      setV(next)
      onChange?.(next)
      descRef.current?.focus()
    }
  }

  const activeMembers = members.filter((m) => !m.archived || m.id === v.team_member_id)

  return (
    <form onSubmit={submit(false)} className="space-y-5" noValidate>
      <div>
        <label htmlFor="task-description" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Nội dung công việc <span className="text-red-600">*</span>
        </label>
        <textarea
          id="task-description"
          ref={descRef}
          rows={3}
          className={`${inputClass} resize-none text-[17px] leading-relaxed`}
          placeholder="VD: Kiểm tra 5 cửa hàng Vinamilk khu vực Quận 7"
          value={v.description}
          onChange={(e) => update({ description: e.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'task-description-error' : undefined}
          enterKeyHint="done"
        />
        {error && (
          <p id="task-description-error" className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Ngày làm việc</span>
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={v.work_date === today} onClick={() => update({ work_date: today })}>
            Hôm nay
          </Chip>
          <Chip selected={v.work_date === yesterday} onClick={() => update({ work_date: yesterday })}>
            Hôm qua
          </Chip>
          <label className="relative">
            <span
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium ring-1 ring-inset ${
                v.work_date !== today && v.work_date !== yesterday
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-700 ring-slate-200'
              }`}
            >
              <Icon name="calendar" className="h-4 w-4" />
              {v.work_date !== today && v.work_date !== yesterday ? formatDateVN(v.work_date) : 'Chọn ngày'}
            </span>
            <input
              type="date"
              aria-label="Chọn ngày làm việc"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={v.work_date}
              max={addDays(today, 365)}
              onChange={(e) => e.target.value && update({ work_date: e.target.value })}
            />
          </label>
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Phân loại</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip key={c.key} selected={v.category === c.key} onClick={() => update({ category: c.key })}>
              {c.short}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Trạng thái</span>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Chip key={s.key} selected={v.status === s.key} onClick={() => update({ status: s.key })}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-slate-100/70 p-1">
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700"
          aria-expanded={showDetails}
        >
          <span>Thêm chi tiết (không bắt buộc)</span>
          <Icon name="chevronDown" className={`h-5 w-5 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
        </button>
        {showDetails && (
          <div className="space-y-4 px-2 pb-3 pt-1">
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Hình thức</span>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
                {ASSIGNMENT_TYPES.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => update({ assignment_type: a.key })}
                    aria-pressed={v.assignment_type === a.key}
                    className={`rounded-lg px-1 py-2 text-xs font-semibold ${
                      v.assignment_type === a.key ? 'bg-brand-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    {a.key === 'self' ? 'Tự làm' : a.key === 'assigned' ? 'Giao việc' : 'Điều phối'}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {ASSIGNMENT_TYPES.find((a) => a.key === v.assignment_type)?.hint}
              </p>
            </div>

            <Field label="Thành viên liên quan">
              <select
                className={inputClass}
                value={v.team_member_id ?? ''}
                onChange={(e) => {
                  const id = e.target.value || null
                  update(
                    id && v.assignment_type === 'self'
                      ? { team_member_id: id, assignment_type: 'assigned' }
                      : { team_member_id: id },
                  )
                }}
              >
                <option value="">— Không chọn —</option>
                {activeMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.role ? ` · ${m.role}` : ''}
                    {m.archived ? ' (đã lưu trữ)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">Mức ưu tiên</span>
              <div className="flex flex-wrap gap-2">
                <Chip selected={!v.priority} onClick={() => update({ priority: null })}>
                  Không
                </Chip>
                {PRIORITIES.map((p) => (
                  <Chip key={p.key} selected={v.priority === p.key} onClick={() => update({ priority: p.key })}>
                    {p.label}
                  </Chip>
                ))}
              </div>
            </div>

            <Field label="Hạn hoàn thành">
              <div className="flex gap-2">
                <input
                  type="date"
                  className={inputClass}
                  value={v.due_date ?? ''}
                  onChange={(e) => update({ due_date: e.target.value || null })}
                />
                {v.due_date && (
                  <Button variant="ghost" onClick={() => update({ due_date: null })} aria-label="Xoá hạn hoàn thành">
                    <Icon name="x" />
                  </Button>
                )}
              </div>
            </Field>

            <Field label="Ghi chú">
              <textarea
                rows={2}
                className={`${inputClass} resize-none`}
                value={v.notes ?? ''}
                placeholder="Thông tin thêm (không bắt buộc)"
                onChange={(e) => update({ notes: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>

      <div
        className={`sticky z-10 -mx-1 flex gap-2 rounded-2xl bg-slate-50/95 p-1 backdrop-blur ${
          mode === 'add'
            ? 'bottom-[calc(env(safe-area-inset-bottom)+5.25rem)]'
            : 'bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]'
        }`}
      >
        {mode === 'add' ? (
          <>
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => submit(true)()}>
              Lưu & thêm tiếp
            </Button>
            <Button type="submit" size="lg" icon="check" className="flex-1">
              Lưu
            </Button>
          </>
        ) : (
          <Button type="submit" size="lg" icon="check" block>
            Lưu thay đổi
          </Button>
        )}
      </div>
    </form>
  )
}
