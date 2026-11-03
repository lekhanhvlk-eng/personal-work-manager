import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_URL, UserSession, createAuthUser, resetDatabase } from './helpers'

const run = DATABASE_URL ? describe : describe.skip

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'

interface TaskRow {
  id: string
  description: string
  report_status: string
  report_id: string | null
  work_date: string
}

async function addTask(s: UserSession, description: string, workDate = '2026-11-01'): Promise<string> {
  const id = randomUUID()
  await s.query('insert into public.tasks (id, description, work_date) values ($1, $2, $3)', [
    id,
    description,
    workDate,
  ])
  return id
}

async function unreported(s: UserSession): Promise<TaskRow[]> {
  const r = await s.query<TaskRow>(
    `select id, description, report_status, report_id, work_date::text from public.tasks
      where report_status = 'unreported' order by created_at, description`,
  )
  return r.rows
}

async function exportTasks(
  s: UserSession,
  ids: string[],
  requestId = randomUUID(),
  content = 'BÁO CÁO CÔNG VIỆC\n- test',
) {
  const r = await s.query('select * from public.confirm_report_export($1, $2::uuid[], $3)', [requestId, ids, content])
  return r.rows[0]
}

run('CSDL: xuất báo cáo nguyên tử', () => {
  let a: UserSession
  let b: UserSession

  beforeAll(async () => {
    await resetDatabase()
    await createAuthUser(USER_A, 'a@example.com')
    await createAuthUser(USER_B, 'b@example.com')
  })

  beforeEach(async () => {
    a = await UserSession.open(USER_A)
    b = await UserSession.open(USER_B)
    // Mỗi test bắt đầu từ dữ liệu trống (xoá dữ liệu qua quyền chủ sở hữu).
    const admin = await UserSession.open(USER_A)
    await admin.query('reset role')
    await admin.query('truncate public.report_events, public.tasks, public.reports, public.team_members cascade')
    await admin.close()
  })

  afterEach(async () => {
    await a?.close().catch(() => {})
    await b?.close().catch(() => {})
  })

  it('kịch bản xuất một phần: chọn 1,2,3 — còn lại 4,5 chưa báo cáo dù cùng ngày', async () => {
    const t1 = await addTask(a, 'Kiểm tra 5 cửa hàng Vinamilk')
    const t2 = await addTask(a, 'Điều phối lịch làm việc của team')
    const t3 = await addTask(a, 'Đào tạo nhân viên mới')
    const t4 = await addTask(a, 'Chuẩn bị báo cáo audit')
    const t5 = await addTask(a, 'Theo dõi khắc phục vi phạm cửa hàng')

    const report = await exportTasks(a, [t1, t2, t3])
    expect(report.task_count).toBe(3)
    expect(report.code).toMatch(/^BC-\d{8}-001$/)
    expect([...report.task_ids].sort()).toEqual([t1, t2, t3].sort())

    const remaining = await unreported(a)
    expect(remaining.map((t) => t.id).sort()).toEqual([t4, t5].sort())

    const reported = await a.query<TaskRow>(`select id, report_id from public.tasks where report_status = 'reported'`)
    expect(reported.rows).toHaveLength(3)
    expect(reported.rows.every((r) => r.report_id === report.id)).toBe(true)

    // Chu kỳ tiếp theo chỉ còn 4 và 5.
    const next = await exportTasks(a, [t4, t5])
    expect(next.code).toMatch(/-002$/)
    expect(await unreported(a)).toHaveLength(0)
  })

  it('chặn xuất trùng: công việc đã báo cáo không thể xuất lần nữa (huỷ toàn bộ giao dịch)', async () => {
    const t1 = await addTask(a, 'Việc 1')
    const t2 = await addTask(a, 'Việc 2')
    await exportTasks(a, [t1])

    await expect(exportTasks(a, [t1, t2])).rejects.toThrow(/TASK_ALREADY_REPORTED/)
    // t2 không bị đánh dấu do giao dịch bị huỷ.
    const rows = await unreported(a)
    expect(rows.map((r) => r.id)).toEqual([t2])
    const count = await a.query('select count(*)::int as n from public.reports')
    expect(count.rows[0].n).toBe(1)
  })

  it('chặn xuất trùng khi hai yêu cầu đồng thời chứa cùng công việc', async () => {
    const ids = [await addTask(a, 'Việc A'), await addTask(a, 'Việc B')]
    const a2 = await UserSession.open(USER_A)
    try {
      const results = await Promise.allSettled([exportTasks(a, ids), exportTasks(a2, ids)])
      const ok = results.filter((r) => r.status === 'fulfilled')
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
      expect(ok).toHaveLength(1)
      expect(failed).toHaveLength(1)
      expect(String(failed[0].reason)).toMatch(/TASK_ALREADY_REPORTED/)
      const count = await a.query('select count(*)::int as n from public.reports')
      expect(count.rows[0].n).toBe(1)
    } finally {
      await a2.close()
    }
  })

  it('idempotent: gửi lại cùng request_id trả về đúng báo cáo cũ, không tạo bản trùng', async () => {
    const ids = [await addTask(a, 'Việc A')]
    const requestId = randomUUID()
    const first = await exportTasks(a, ids, requestId)
    const retry = await exportTasks(a, ids, requestId)
    expect(retry.id).toBe(first.id)
    const count = await a.query('select count(*)::int as n from public.reports')
    expect(count.rows[0].n).toBe(1)

    const other = await addTask(a, 'Việc khác')
    await expect(exportTasks(a, [other], requestId)).rejects.toThrow(/REQUEST_ID_CONFLICT/)
  })

  it('từ chối danh sách rỗng và nội dung rỗng', async () => {
    const t = await addTask(a, 'Việc')
    await expect(exportTasks(a, [])).rejects.toThrow(/NO_TASKS_SELECTED/)
    await expect(exportTasks(a, [t], randomUUID(), '   ')).rejects.toThrow(/EMPTY_CONTENT/)
    expect(await unreported(a)).toHaveLength(1)
  })

  it('ảnh chụp báo cáo không thay đổi khi công việc gốc bị sửa hoặc xoá sau đó', async () => {
    const t = await addTask(a, 'Mô tả gốc')
    const report = await exportTasks(a, [t], randomUUID(), 'Nội dung đã chỉnh sửa bởi người dùng')
    await a.query(`update public.tasks set description = 'Mô tả mới' where id = $1`, [t])
    await a.query(`delete from public.tasks where id = $1`, [t])
    const r = await a.query('select content, task_snapshot from public.reports where id = $1', [report.id])
    expect(r.rows[0].content).toBe('Nội dung đã chỉnh sửa bởi người dùng')
    expect(r.rows[0].task_snapshot[0].description).toBe('Mô tả gốc')
  })

  it('báo cáo là bất biến: client không thể sửa hoặc xoá', async () => {
    const report = await exportTasks(a, [await addTask(a, 'Việc')])
    await expect(a.query(`update public.reports set content = 'x' where id = $1`, [report.id])).rejects.toThrow(
      /permission denied/,
    )
    await expect(a.query(`delete from public.reports where id = $1`, [report.id])).rejects.toThrow(/permission denied/)
  })

  it('client không thể tự đổi trạng thái báo cáo (chỉ qua RPC)', async () => {
    const t = await addTask(a, 'Việc')
    await expect(a.query(`update public.tasks set report_status = 'reported' where id = $1`, [t])).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      a.query(`insert into public.tasks (description, report_status) values ('x', 'reported')`),
    ).rejects.toThrow(/permission denied/)
  })

  it('khôi phục công việc: trở lại chưa báo cáo, giữ nguyên báo cáo cũ và ghi sự kiện', async () => {
    const t1 = await addTask(a, 'Việc 1')
    const t2 = await addTask(a, 'Việc 2')
    const report = await exportTasks(a, [t1, t2])

    await a.query('select * from public.restore_task_to_unreported($1, $2)', [t1, 'Cần bổ sung số liệu'])
    const rows = await unreported(a)
    expect(rows.map((r) => r.id)).toEqual([t1])

    const rep = await a.query('select task_ids, task_count from public.reports where id = $1', [report.id])
    expect(rep.rows[0].task_count).toBe(2)
    expect(rep.rows[0].task_ids).toContain(t1)

    const ev = await a.query(
      `select event_type, task_id, note from public.report_events where report_id = $1 order by created_at`,
      [report.id],
    )
    expect(ev.rows.map((e) => e.event_type)).toEqual(['exported', 'task_restored'])
    expect(ev.rows[1]).toMatchObject({ task_id: t1, note: 'Cần bổ sung số liệu' })

    // Có thể xuất lại trong báo cáo mới.
    const again = await exportTasks(a, [t1])
    expect(again.id).not.toBe(report.id)
    await expect(a.query('select public.restore_task_to_unreported($1)', [t2])).resolves.toBeDefined()
    await expect(a.query('select public.restore_task_to_unreported($1)', [t2])).rejects.toThrow(/TASK_NOT_REPORTED/)
  })

  it('RLS: người dùng khác không thấy và không thể xuất/khôi phục dữ liệu của bạn', async () => {
    const t = await addTask(a, 'Bí mật của A')
    const seen = await b.query('select * from public.tasks')
    expect(seen.rows).toHaveLength(0)
    await expect(exportTasks(b, [t])).rejects.toThrow(/TASK_NOT_FOUND/)
    const upd = await b.query(`update public.tasks set description = 'hack' where id = $1`, [t])
    expect(upd.rowCount).toBe(0)
    const del = await b.query(`delete from public.tasks where id = $1`, [t])
    expect(del.rowCount).toBe(0)
    await expect(b.query(`insert into public.tasks (description, user_id) values ('x', $1)`, [USER_A])).rejects.toThrow(
      /row-level security/,
    )

    await exportTasks(a, [t])
    const reports = await b.query('select * from public.reports')
    expect(reports.rows).toHaveLength(0)
    await expect(b.query('select public.restore_task_to_unreported($1)', [t])).rejects.toThrow(/TASK_NOT_FOUND/)
  })

  it('không thể gán công việc cho thành viên của người dùng khác', async () => {
    const m = await b.query(`insert into public.team_members (name) values ('Thành viên B') returning id`)
    await expect(
      a.query(`insert into public.tasks (description, team_member_id) values ('x', $1)`, [m.rows[0].id]),
    ).rejects.toThrow(/INVALID_TEAM_MEMBER/)
  })

  it('ngày công việc mặc định theo múi giờ Asia/Ho_Chi_Minh', async () => {
    const r = await a.query(`insert into public.tasks (description) values ('x') returning work_date::text as d`)
    const vn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
    expect(r.rows[0].d).toBe(vn)
  })

  it('nhập sao lưu an toàn: không ghi đè, bỏ qua bản ghi trùng', async () => {
    const memberId = randomUUID()
    const taskId = randomUUID()
    const reportId = randomUUID()
    const reportedTaskId = randomUUID()
    const payload = {
      team_members: [{ id: memberId, name: 'Lan', archived: false }],
      reports: [
        {
          id: reportId,
          code: 'BC-20261101-001',
          content: 'BÁO CÁO',
          task_ids: [reportedTaskId],
          task_count: 1,
          date_from: '2026-11-01',
          date_to: '2026-11-01',
          task_snapshot: [],
          exported_at: '2026-11-01T10:00:00Z',
        },
      ],
      tasks: [
        { id: taskId, description: 'Việc nhập', work_date: '2026-11-02', team_member_id: memberId },
        {
          id: reportedTaskId,
          description: 'Việc đã báo cáo',
          work_date: '2026-11-01',
          report_status: 'reported',
          report_id: reportId,
          reported_at: '2026-11-01T10:00:00Z',
        },
      ],
      report_events: [{ id: randomUUID(), report_id: reportId, event_type: 'exported' }],
    }
    const r1 = await a.query('select public.import_backup($1::jsonb) as r', [JSON.stringify(payload)])
    expect(r1.rows[0].r).toMatchObject({ team_members: 1, tasks: 2, reports: 1, report_events: 1, skipped: 0 })

    await a.query(`update public.tasks set description = 'Đã sửa' where id = $1`, [taskId])
    const r2 = await a.query('select public.import_backup($1::jsonb) as r', [JSON.stringify(payload)])
    expect(r2.rows[0].r).toMatchObject({ tasks: 0, skipped: 5 })
    const t = await a.query('select description from public.tasks where id = $1', [taskId])
    expect(t.rows[0].description).toBe('Đã sửa')
    const rt = await a.query('select report_status, report_id from public.tasks where id = $1', [reportedTaskId])
    expect(rt.rows[0]).toEqual({ report_status: 'reported', report_id: reportId })
  })
})
