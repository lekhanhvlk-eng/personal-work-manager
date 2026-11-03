import { useMemo } from 'react'
import type { Task, TeamMember } from '../lib/types'
import { useAppState } from './StoreContext'

export function useData() {
  return useAppState().data
}

export function useMemberMap(): Map<string, TeamMember> {
  const { members } = useData()
  return useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
}

export function useReportCodeMap(): Map<string, string> {
  const { reports } = useData()
  return useMemo(() => new Map(reports.map((r) => [r.id, r.code])), [reports])
}

export interface DashboardStats {
  total: number
  done: number
  inProgress: number
  waiting: number
  unreported: number
  reported: number
  reports: number
  today: number
}

export function computeStats(tasks: Task[], reportCount: number, today: string): DashboardStats {
  let done = 0
  let inProgress = 0
  let waiting = 0
  let unreported = 0
  let todayCount = 0
  for (const t of tasks) {
    if (t.status === 'done') done++
    else if (t.status === 'in_progress') inProgress++
    else if (t.status === 'pending' || t.status === 'awaiting_feedback') waiting++
    if (t.report_status === 'unreported') unreported++
    if (t.work_date === today) todayCount++
  }
  return {
    total: tasks.length,
    done,
    inProgress,
    waiting,
    unreported,
    reported: tasks.length - unreported,
    reports: reportCount,
    today: todayCount,
  }
}
