import { useState } from 'react'
import type { TeamMemberInput } from '../lib/types'
import { Button, Field, Sheet, inputClass } from './ui'

export function MemberFormSheet({
  open,
  onClose,
  initial,
  title,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  initial?: Partial<TeamMemberInput>
  title: string
  onSubmit: (v: Pick<TeamMemberInput, 'name' | 'role' | 'phone' | 'note'>) => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!name.trim()) {
      setError('Vui lòng nhập tên thành viên.')
      return
    }
    onSubmit({ name: name.trim(), role: role.trim() || null, phone: phone.trim() || null, note: note.trim() || null })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button block size="lg" icon="check" onClick={submit}>
          Lưu
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="Họ và tên *">
          <input
            className={inputClass}
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="VD: Nguyễn Thị Lan"
          />
          {error && (
            <span className="mt-1 block text-sm text-red-600" role="alert">
              {error}
            </span>
          )}
        </Field>
        <Field label="Vai trò / vị trí">
          <input
            className={inputClass}
            value={role ?? ''}
            onChange={(e) => setRole(e.target.value)}
            placeholder="VD: Giám sát khu vực"
          />
        </Field>
        <Field label="Số điện thoại">
          <input
            className={inputClass}
            type="tel"
            inputMode="tel"
            value={phone ?? ''}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Ghi chú">
          <textarea
            className={`${inputClass} resize-none`}
            rows={2}
            value={note ?? ''}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
    </Sheet>
  )
}
