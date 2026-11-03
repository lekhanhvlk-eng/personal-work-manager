import { expect, test, type Page } from '@playwright/test'

async function addTask(page: Page, description: string) {
  await page.goto('/add')
  await page.getByLabel(/Nội dung công việc/).fill(description)
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page).toHaveURL(/\/tasks$/)
}

async function unreportedCount(page: Page) {
  await page.goto('/')
  return Number(await page.getByTestId('unreported-count').innerText())
}

const FIVE = [
  'Kiểm tra 5 cửa hàng Vinamilk',
  'Điều phối lịch làm việc của team',
  'Đào tạo nhân viên mới',
  'Chuẩn bị báo cáo audit',
  'Theo dõi khắc phục vi phạm cửa hàng',
]

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('nhập nhanh: chỉ cần nội dung, ngày mặc định hôm nay', async ({ page }) => {
  await page.goto('/add')
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Vui lòng nhập nội dung' })).toBeVisible()
  await page.getByLabel(/Nội dung công việc/).fill('Kiểm tra kho hàng Q.7')
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByText('Kiểm tra kho hàng Q.7')).toBeVisible()
  await expect(page.getByText(/^Hôm nay ·/)).toBeVisible()
  await expect(await unreportedCount(page)).toBe(1)
})

test('sửa và xoá công việc (có xác nhận)', async ({ page }) => {
  await addTask(page, 'Việc ban đầu')
  await page.getByText('Việc ban đầu').click()
  await page.getByLabel(/Nội dung công việc/).fill('Việc đã sửa')
  await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
  await expect(page.getByText('Việc đã sửa')).toBeVisible()
  await page.getByText('Việc đã sửa').click()
  await page.getByRole('button', { name: 'Xoá công việc' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Huỷ' }).click()
  await expect(page.getByLabel(/Nội dung công việc/)).toHaveValue('Việc đã sửa')
  await page.getByRole('button', { name: 'Xoá công việc' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xoá' }).click()
  await expect(page.getByText('Chưa có công việc nào')).toBeVisible()
})

test('XUẤT MỘT PHẦN: chọn 1,2,3 → chỉ 3 việc được báo cáo; 4,5 xuất hiện ở lần sau', async ({ page }) => {
  for (const d of FIVE) await addTask(page, d)
  expect(await unreportedCount(page)).toBe(5)

  await page.getByRole('button', { name: 'XUẤT BÁO CÁO' }).click()
  await expect(page).toHaveURL(/\/reports\/new/)
  // Mặc định không chọn việc nào
  await expect(page.getByTestId('selection-counts')).toContainText('Đã chọn 0 · Chưa chọn 5')
  await expect(page.getByRole('button', { name: /Tạo báo cáo/ })).toBeDisabled()

  // Chọn tất cả / bỏ chọn tất cả
  await page.getByRole('button', { name: 'Chọn tất cả', exact: true }).click()
  await expect(page.getByTestId('selection-counts')).toContainText('Đã chọn 5 · Chưa chọn 0')
  await page.getByRole('button', { name: 'Bỏ chọn tất cả' }).click()
  await expect(page.getByTestId('selection-counts')).toContainText('Đã chọn 0 · Chưa chọn 5')

  for (const d of FIVE.slice(0, 3)) await page.getByRole('checkbox', { name: d }).check()
  await expect(page.getByTestId('selection-counts')).toContainText('Đã chọn 3 · Chưa chọn 2')
  await page.getByRole('button', { name: 'Tạo báo cáo (3)' }).click()

  const editor = page.getByLabel(/Nội dung báo cáo/)
  const content = await editor.inputValue()
  for (const d of FIVE.slice(0, 3)) expect(content).toContain(d)
  for (const d of FIVE.slice(3)) expect(content).not.toContain(d)
  expect(content).toContain('- Tổng số công việc: 3.')

  // Sửa nội dung báo cáo không đổi công việc gốc
  await editor.fill(content.replace('BÁO CÁO CÔNG VIỆC', 'BÁO CÁO CÔNG VIỆC – ĐÃ CHỈNH SỬA'))

  // Sao chép KHÔNG thay đổi trạng thái báo cáo
  await page.getByRole('button', { name: 'Sao chép báo cáo' }).click()
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip).toContain('ĐÃ CHỈNH SỬA')
  await page.goto('/')
  expect(Number(await page.getByTestId('unreported-count').innerText())).toBe(5)

  // Quay lại: bản nháp được giữ nguyên (đang ở bước xem trước)
  await page.goto('/reports/new')
  await expect(page.getByLabel(/Nội dung báo cáo/)).toHaveValue(/ĐÃ CHỈNH SỬA/)

  // Xác nhận xuất
  await page.getByRole('button', { name: 'Xác nhận xuất báo cáo' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận xuất' }).click()
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('report-content')).toContainText('ĐÃ CHỈNH SỬA')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^BC-\d{8}-001$/)

  expect(await unreportedCount(page)).toBe(2)

  // Lần xuất tiếp theo chỉ còn việc 4 và 5
  await page.goto('/reports/new')
  await expect(page.getByTestId('selection-counts')).toContainText('Đã chọn 0 · Chưa chọn 2')
  for (const d of FIVE.slice(0, 3)) await expect(page.getByRole('checkbox', { name: d })).toHaveCount(0)
  for (const d of FIVE.slice(3)) await expect(page.getByRole('checkbox', { name: d })).toBeVisible()

  // Lịch sử công việc hiển thị mã báo cáo
  await page.goto('/tasks?report=reported')
  await expect(page.getByText(/Đã báo cáo · BC-/)).toHaveCount(3)
})

test('bản nháp được khôi phục sau khi tải lại trang; không có việc nào bị đánh dấu', async ({ page }) => {
  for (const d of FIVE.slice(0, 2)) await addTask(page, d)
  await page.goto('/reports/new')
  await page.getByRole('checkbox', { name: FIVE[1] }).check()
  await page.reload()
  await expect(page.getByText(/Đang tiếp tục bản nháp/)).toBeVisible()
  await expect(page.getByRole('checkbox', { name: FIVE[1] })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: FIVE[0] })).not.toBeChecked()
  expect(await unreportedCount(page)).toBe(2)
})

test('chống xác nhận trùng: bấm liên tiếp chỉ tạo một báo cáo', async ({ page }) => {
  await addTask(page, 'Việc duy nhất')
  await page.goto('/reports/new')
  await page.getByRole('checkbox', { name: 'Việc duy nhất' }).check()
  await page.getByRole('button', { name: /Tạo báo cáo/ }).click()
  await page.getByRole('button', { name: 'Xác nhận xuất báo cáo' }).click()
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận xuất' })
  await confirm.dblclick({ force: true }).catch(() => {})
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/)
  await page.goto('/reports')
  await expect(page.getByText(/^BC-\d{8}-\d{3}$/)).toHaveCount(1)
})

test('khôi phục công việc đã báo cáo: báo cáo cũ giữ nguyên, có nhật ký', async ({ page }) => {
  await addTask(page, 'Việc cần báo cáo lại')
  await page.goto('/reports/new')
  await page.getByRole('checkbox', { name: 'Việc cần báo cáo lại' }).check()
  await page.getByRole('button', { name: /Tạo báo cáo/ }).click()
  await page.getByRole('button', { name: 'Xác nhận xuất báo cáo' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Xác nhận xuất' }).click()
  await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}$/)

  await page.getByRole('button', { name: 'Khôi phục về chưa báo cáo' }).click()
  await page.getByPlaceholder('Lý do khôi phục (không bắt buộc)').fill('Bổ sung số liệu')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Khôi phục' }).click()
  await expect(page.getByText('Đã khôi phục · chờ báo cáo lại')).toBeVisible()
  await expect(page.getByText(/Lý do: Bổ sung số liệu/)).toBeVisible()
  await expect(page.getByTestId('report-content')).toContainText('Việc cần báo cáo lại')
  expect(await unreportedCount(page)).toBe(1)
})

test('đội nhóm: thêm thành viên, giao việc, lưu trữ', async ({ page }) => {
  await page.goto('/team')
  await page.getByRole('button', { name: 'Thêm', exact: true }).click()
  await page.getByPlaceholder('VD: Nguyễn Thị Lan').fill('Phạm Văn Nam')
  await page.getByRole('dialog').getByRole('button', { name: 'Lưu' }).click()
  await page.getByRole('link', { name: /Phạm Văn Nam/ }).click()
  await page.getByRole('button', { name: 'Giao việc' }).click()
  await page.getByLabel(/Nội dung công việc/).fill('Kiểm kê cửa hàng Q.3')
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByText('Giao: Phạm Văn Nam')).toBeVisible()
  await page.goto('/team')
  await page.getByRole('link', { name: /Phạm Văn Nam/ }).click()
  await expect(page.getByText('Kiểm kê cửa hàng Q.3')).toBeVisible()
  await page.getByRole('button', { name: 'Lưu trữ' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Lưu trữ' }).click()
  await expect(page.getByText('Thành viên đã được lưu trữ.')).toBeVisible()
})

test('giao diện di động: không cuộn ngang trên mọi màn hình chính', async ({ page }) => {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Tạo dữ liệu mẫu' }).click()
  await expect(page.getByText(/Đã tạo dữ liệu mẫu/)).toBeVisible()
  for (const path of ['/', '/tasks', '/add', '/team', '/reports', '/reports/new', '/settings']) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `cuộn ngang tại ${path}`).toBeLessThanOrEqual(0)
  }
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible()
  for (const label of ['Tổng quan', 'Công việc', 'Thêm mới', 'Đội nhóm', 'Báo cáo']) {
    await expect(page.getByRole('navigation').getByText(label, { exact: true })).toBeVisible()
  }
})

test('PWA: ứng dụng vẫn mở được khi mất mạng (service worker)', async ({ page, context }) => {
  await addTask(page, 'Việc ghi trước khi mất mạng')
  // Chờ service worker cài đặt xong và kiểm soát trang (đã precache ứng dụng).
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 })
  await page.waitForFunction(async () => (await caches.keys()).some((k) => k.includes('precache')), null, {
    timeout: 20000,
  })
  await page.goto('/')
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('unreported-count')).toHaveText('1')
  await page.goto('/add')
  await page.getByLabel(/Nội dung công việc/).fill('Ghi khi ngoại tuyến')
  await page.getByRole('button', { name: 'Lưu', exact: true }).click()
  await expect(page.getByText('Ghi khi ngoại tuyến')).toBeVisible()
  await context.setOffline(false)
})
