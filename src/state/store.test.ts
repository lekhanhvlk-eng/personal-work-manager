import { beforeEach, describe, expect, it } from 'vitest'
import { FlakyRepository } from '../test/helpers'
import { AppStore } from './store'
import { clearReportDraft, loadReportDraft, newReportDraft, reconcileDraft, saveReportDraft } from './drafts'
import { uuid } from '../lib/uuid'

let server: FlakyRepository
let store: AppStore

const make = () => new AppStore(server, 'test', { attachWindowEvents: false, retryDelays: [60_000] })

beforeEach(async () => {
  server = new FlakyRepository()
  store = make()
  await store.start()
})

describe('AppStore — đồng bộ và ngoại tuyến', () => {
  it('nhập nhanh: công việc hiển thị ngay và được lưu lên máy chủ', async () => {
    const t = store.addTask({ description: '  Kiểm tra cửa hàng  ' })
    expect(store.getState().data.tasks[0].description).toBe('Kiểm tra cửa hàng')
    await store.flush()
    expect((await server.inner.fetchAll()).tasks.map((x) => x.id)).toEqual([t.id])
    expect(store.getState().pending).toHaveLength(0)
  })

  it('mất mạng: thay đổi được giữ trong hàng đợi (kể cả khi tải lại ứng dụng) và tự gửi khi có mạng', async () => {
    server.offline = true
    const t = store.addTask({ description: 'Ghi khi mất mạng' })
    await store.flush()
    expect(store.getState().online).toBe(false)
    expect(store.getState().pending).toHaveLength(1)
    store.dispose()

    // Mở lại ứng dụng khi vẫn mất mạng: dữ liệu vẫn còn từ bộ nhớ đệm + outbox.
    const reopened = make()
    await reopened.start()
    expect(reopened.getState().data.tasks.map((x) => x.id)).toEqual([t.id])
    expect(reopened.getState().pending).toHaveLength(1)

    server.offline = false
    await reopened.sync()
    expect(reopened.getState().pending).toHaveLength(0)
    expect((await server.inner.fetchAll()).tasks.map((x) => x.id)).toEqual([t.id])
    reopened.dispose()
  })

  it('sửa và xoá công việc được đồng bộ', async () => {
    const t = store.addTask({ description: 'Bản đầu' })
    store.updateTask(t.id, { description: 'Bản sửa', status: 'in_progress' })
    await store.flush()
    expect((await server.inner.fetchAll()).tasks[0]).toMatchObject({ description: 'Bản sửa', status: 'in_progress' })
    store.deleteTask(t.id)
    await store.flush()
    expect((await server.inner.fetchAll()).tasks).toHaveLength(0)
    expect(store.getState().data.tasks).toHaveLength(0)
  })

  it('xuất báo cáo bắt buộc trực tuyến: khi mất mạng không có công việc nào bị đổi trạng thái', async () => {
    const t = store.addTask({ description: 'Việc 1' })
    await store.flush()
    server.offline = true
    await expect(store.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'x' })).rejects.toMatchObject({
      code: 'NETWORK',
    })
    expect(store.getState().data.tasks[0].report_status).toBe('unreported')
    expect((await server.inner.fetchAll()).tasks[0].report_status).toBe('unreported')
  })

  it('việc tạo khi ngoại tuyến được đồng bộ TRƯỚC khi xuất báo cáo', async () => {
    server.offline = true
    const t = store.addTask({ description: 'Tạo offline' })
    await store.flush()
    server.offline = false
    const report = await store.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'x' })
    expect(report.task_ids).toEqual([t.id])
    expect(store.getState().data.tasks[0].report_status).toBe('reported')
  })

  it('mất phản hồi sau khi máy chủ đã commit: gửi lại cùng requestId không tạo báo cáo trùng', async () => {
    const t = store.addTask({ description: 'Việc' })
    await store.flush()
    const requestId = uuid()
    server.dropNextExportResponse = true
    await expect(store.confirmExport({ requestId, taskIds: [t.id], content: 'x' })).rejects.toMatchObject({
      code: 'NETWORK',
    })
    const retry = await store.confirmExport({ requestId, taskIds: [t.id], content: 'x' })
    expect(retry.task_ids).toEqual([t.id])
    expect((await server.inner.fetchAll()).reports).toHaveLength(1)
  })

  it('đồng bộ nhiều thiết bị: thiết bị B thấy công việc và báo cáo từ thiết bị A', async () => {
    const deviceB = new AppStore(server, 'deviceB', { attachWindowEvents: false })
    await deviceB.start()
    const t = store.addTask({ description: 'Từ thiết bị A' })
    await store.flush()
    await store.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'x' })
    await deviceB.refresh()
    expect(deviceB.getState().data.tasks[0]).toMatchObject({ id: t.id, report_status: 'reported' })
    expect(deviceB.getState().data.reports).toHaveLength(1)
    deviceB.dispose()
  })

  it('xuất trùng từ thiết bị khác bị từ chối và dữ liệu được làm mới', async () => {
    const deviceB = new AppStore(server, 'deviceB', { attachWindowEvents: false })
    const t = store.addTask({ description: 'Việc chung' })
    await store.flush()
    await deviceB.start()
    await store.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'A' })
    await expect(deviceB.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'B' })).rejects.toMatchObject({
      code: 'TASK_ALREADY_REPORTED',
    })
    await deviceB.refresh()
    expect(deviceB.getState().data.tasks[0].report_status).toBe('reported')
    expect((await server.inner.fetchAll()).reports).toHaveLength(1)
    deviceB.dispose()
  })

  it('khôi phục công việc đã báo cáo', async () => {
    const t = store.addTask({ description: 'Việc' })
    await store.flush()
    await store.confirmExport({ requestId: uuid(), taskIds: [t.id], content: 'x' })
    await store.restoreTask(t.id, 'Cần báo cáo lại')
    expect(store.getState().data.tasks[0].report_status).toBe('unreported')
    expect(store.getState().data.events.map((e) => e.event_type)).toEqual(['exported', 'task_restored'])
    expect(store.getState().data.reports).toHaveLength(1)
  })
})

describe('Bản nháp báo cáo', () => {
  beforeEach(() => clearReportDraft('test'))

  it('được lưu và khôi phục sau khi rời trang', () => {
    const d = {
      ...newReportDraft(),
      selectedIds: ['a', 'b'],
      step: 'preview' as const,
      content: 'Nội dung',
      edited: true,
    }
    saveReportDraft('test', d)
    const loaded = loadReportDraft('test')!
    expect(loaded).toMatchObject({
      requestId: d.requestId,
      selectedIds: ['a', 'b'],
      step: 'preview',
      content: 'Nội dung',
      edited: true,
    })
  })

  it('đối chiếu: bỏ công việc đã được báo cáo ở nơi khác', () => {
    const t1 = store.addTask({ description: '1' })
    const t2 = store.addTask({ description: '2' })
    const tasks = store
      .getState()
      .data.tasks.map((t) => (t.id === t1.id ? { ...t, report_status: 'reported' as const } : t))
    const { draft, removed } = reconcileDraft({ ...newReportDraft(), selectedIds: [t1.id, t2.id] }, tasks)
    expect(removed).toBe(1)
    expect(draft.selectedIds).toEqual([t2.id])
  })
})
