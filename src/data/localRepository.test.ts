import { beforeEach, describe, expect, it } from 'vitest'
import { newMember, newTask } from './factory'
import { LocalRepository } from './localRepository'
import { uuid } from '../lib/uuid'

let repo: LocalRepository

async function seedFive() {
  const descriptions = [
    'Kiểm tra 5 cửa hàng Vinamilk',
    'Điều phối lịch làm việc của team',
    'Đào tạo nhân viên mới',
    'Chuẩn bị báo cáo audit',
    'Theo dõi khắc phục vi phạm tại cửa hàng',
  ]
  const tasks = []
  for (const [i, d] of descriptions.entries()) {
    const t = newTask({ description: d, work_date: '2026-11-01' }, new Date(Date.UTC(2026, 10, 1, 1, i)))
    tasks.push(await repo.createTask(t))
  }
  return tasks
}

const unreported = async () => (await repo.fetchAll()).tasks.filter((t) => t.report_status === 'unreported')

beforeEach(() => {
  repo = new LocalRepository('pwm:test:db', () => new Date('2026-11-03T03:00:00Z'))
})

describe('Kịch bản kiểm thử xuất một phần (mục 8)', () => {
  it('chọn 1,2,3 → chỉ 3 việc được xuất; 4,5 vẫn chưa báo cáo dù cùng ngày; lần sau chỉ còn 4,5', async () => {
    const [t1, t2, t3, t4, t5] = await seedFive()
    const report = await repo.confirmExport({ requestId: uuid(), taskIds: [t1.id, t2.id, t3.id], content: 'BÁO CÁO' })

    expect(report.code).toBe('BC-20261103-001')
    expect(report.task_count).toBe(3)
    expect(report.date_from).toBe('2026-11-01')
    expect(report.date_to).toBe('2026-11-01')

    const db = await repo.fetchAll()
    for (const t of [t1, t2, t3]) {
      const row = db.tasks.find((x) => x.id === t.id)!
      expect(row.report_status).toBe('reported')
      expect(row.report_id).toBe(report.id)
    }
    expect((await unreported()).map((t) => t.id)).toEqual([t4.id, t5.id])

    const next = await repo.confirmExport({ requestId: uuid(), taskIds: [t4.id, t5.id], content: 'BÁO CÁO 2' })
    expect(next.code).toBe('BC-20261103-002')
    expect(await unreported()).toHaveLength(0)
  })
})

describe('LocalRepository — quy tắc xuất báo cáo', () => {
  it('chống xuất trùng: lỗi và không thay đổi gì nếu có việc đã báo cáo', async () => {
    const [t1, t2] = await seedFive()
    await repo.confirmExport({ requestId: uuid(), taskIds: [t1.id], content: 'x' })
    await expect(
      repo.confirmExport({ requestId: uuid(), taskIds: [t1.id, t2.id], content: 'x' }),
    ).rejects.toMatchObject({
      code: 'TASK_ALREADY_REPORTED',
    })
    expect((await repo.fetchAll()).reports).toHaveLength(1)
    expect((await unreported()).map((t) => t.id)).toContain(t2.id)
  })

  it('hai yêu cầu đồng thời với cùng công việc: chỉ một thành công', async () => {
    const [t1, t2] = await seedFive()
    const results = await Promise.allSettled([
      repo.confirmExport({ requestId: uuid(), taskIds: [t1.id, t2.id], content: 'x' }),
      repo.confirmExport({ requestId: uuid(), taskIds: [t2.id, t1.id], content: 'x' }),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await repo.fetchAll()).reports).toHaveLength(1)
  })

  it('idempotent theo requestId', async () => {
    const [t1] = await seedFive()
    const requestId = uuid()
    const a = await repo.confirmExport({ requestId, taskIds: [t1.id], content: 'x' })
    const b = await repo.confirmExport({ requestId, taskIds: [t1.id], content: 'x' })
    expect(b.id).toBe(a.id)
    expect((await repo.fetchAll()).reports).toHaveLength(1)
  })

  it('ảnh chụp báo cáo giữ nguyên khi công việc gốc bị sửa/xoá', async () => {
    const m = await repo.createMember(newMember({ name: 'Lan' }))
    const t = await repo.createTask(newTask({ description: 'Gốc', team_member_id: m.id, assignment_type: 'assigned' }))
    const r = await repo.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'Nội dung đã sửa' })
    await repo.updateTask(t.id, { description: 'Đã đổi' })
    await repo.updateMember(m.id, { name: 'Tên mới' })
    await repo.deleteTask(t.id)
    const stored = (await repo.fetchAll()).reports[0]
    expect(stored.content).toBe('Nội dung đã sửa')
    expect(stored.task_snapshot[0]).toMatchObject({ description: 'Gốc', team_member_name: 'Lan' })
    expect(r.task_ids).toEqual([t.id])
  })

  it('cập nhật công việc không thể đổi trạng thái báo cáo', async () => {
    const [t1] = await seedFive()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await repo.updateTask(t1.id, { report_status: 'reported', description: 'Mới' } as any)
    const row = (await repo.fetchAll()).tasks.find((t) => t.id === t1.id)!
    expect(row.report_status).toBe('unreported')
    expect(row.description).toBe('Mới')
  })

  it('khôi phục: công việc trở lại chưa báo cáo, báo cáo cũ giữ nguyên, có sự kiện', async () => {
    const [t1, t2] = await seedFive()
    const r = await repo.confirmExport({ requestId: uuid(), taskIds: [t1.id, t2.id], content: 'x' })
    await repo.restoreTask(t1.id, 'Bổ sung số liệu')
    const db = await repo.fetchAll()
    expect(db.tasks.find((t) => t.id === t1.id)!.report_status).toBe('unreported')
    expect(db.reports[0].task_ids).toEqual(r.task_ids)
    expect(db.events.map((e) => e.event_type)).toEqual(['exported', 'task_restored'])
    expect(db.events[1]).toMatchObject({ task_id: t1.id, report_id: r.id, note: 'Bổ sung số liệu' })
    await expect(repo.restoreTask(t1.id, null)).rejects.toMatchObject({ code: 'TASK_NOT_REPORTED' })
  })

  it('nhập sao lưu không ghi đè dữ liệu hiện có', async () => {
    const [t1] = await seedFive()
    const backup = {
      app: 'personal-work-manager' as const,
      version: 1 as const,
      exported_at: '',
      ...{ team_members: [], reports: [], report_events: [] },
      tasks: [{ ...t1, description: 'Bản cũ' }],
    }
    await repo.updateTask(t1.id, { description: 'Bản mới' })
    const res = await repo.importBackup(backup)
    expect(res).toMatchObject({ tasks: 0, skipped: 1 })
    expect((await repo.fetchAll()).tasks.find((t) => t.id === t1.id)!.description).toBe('Bản mới')
  })
})
