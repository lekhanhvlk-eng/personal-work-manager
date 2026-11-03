import { todayVN } from '../lib/dates'
import type { Task, TaskInput, TeamMember, TeamMemberInput } from '../lib/types'
import { uuid } from '../lib/uuid'

export function newTask(input: Partial<TaskInput> & { description: string }, now: Date = new Date()): Task {
  const ts = now.toISOString()
  return {
    id: uuid(),
    description: input.description.trim(),
    work_date: input.work_date ?? todayVN(now),
    category: input.category ?? 'other',
    status: input.status ?? 'done',
    priority: input.priority ?? null,
    assignment_type: input.assignment_type ?? 'self',
    team_member_id: input.team_member_id ?? null,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    due_date: input.due_date ?? null,
    report_status: 'unreported',
    report_id: null,
    reported_at: null,
    created_at: ts,
    updated_at: ts,
  }
}

export function newMember(input: Partial<TeamMemberInput> & { name: string }, now: Date = new Date()): TeamMember {
  const ts = now.toISOString()
  return {
    id: uuid(),
    name: input.name.trim(),
    role: input.role?.trim() || null,
    phone: input.phone?.trim() || null,
    note: input.note?.trim() || null,
    archived: input.archived ?? false,
    created_at: ts,
    updated_at: ts,
  }
}
