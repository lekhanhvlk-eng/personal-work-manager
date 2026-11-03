import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Page, SyncIndicator } from '../components/Layout'
import { TaskForm, defaultTaskValues, type TaskFormValues } from '../components/TaskForm'
import { useToast } from '../components/Toast'
import type { AssignmentType, CategoryKey } from '../lib/types'
import { clearTaskDraft, loadTaskDraft, saveTaskDraft } from '../state/drafts'
import { useData } from '../state/selectors'
import { useSession } from '../state/StoreContext'

export function AddTaskPage() {
  const { store, scope } = useSession()
  const { members } = useData()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [formKey, setFormKey] = useState(0)

  const presetMember = params.get('member')
  const presetType = params.get('type') as AssignmentType | null
  const presetCategory = params.get('category') as CategoryKey | null

  const { initial, restored } = useMemo(() => {
    const draft = loadTaskDraft(scope)
    const preset: Partial<TaskFormValues> = {}
    if (presetMember) preset.team_member_id = presetMember
    if (presetType) preset.assignment_type = presetType
    if (presetCategory) preset.category = presetCategory
    if (presetType === 'coordinated' && !presetCategory) preset.category = 'team_coordination'
    if (presetType === 'assigned') preset.status = 'in_progress'
    if (draft && draft.description?.trim() && !presetMember) {
      return { initial: defaultTaskValues({ ...draft }), restored: true }
    }
    return { initial: defaultTaskValues(preset), restored: false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, formKey])

  return (
    <Page
      title="Thêm công việc"
      subtitle="Chỉ cần nhập nội dung — các mục khác có sẵn mặc định"
      actions={<SyncIndicator />}
    >
      {restored && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>Đã khôi phục bản nháp chưa lưu.</span>
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              clearTaskDraft(scope)
              setFormKey((k) => k + 1)
            }}
          >
            Xoá nháp
          </button>
        </div>
      )}
      <TaskForm
        key={formKey}
        mode="add"
        autoFocus
        initial={initial}
        members={members}
        onChange={(v) => saveTaskDraft(scope, v)}
        onSubmit={(values, { addAnother }) => {
          try {
            store.addTask(values)
            toast('Đã lưu công việc.')
            if (addAnother) {
              saveTaskDraft(scope, { ...values, description: '', notes: null })
            } else {
              clearTaskDraft(scope)
              navigate('/tasks')
            }
          } catch (e) {
            toast((e as Error).message, 'error')
          }
        }}
      />
    </Page>
  )
}
