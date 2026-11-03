# Kiến trúc & kế hoạch triển khai

## Tổng quan

```
┌──────────────── Điện thoại (PWA, React + TS + Vite + Tailwind) ────────────────┐
│ Pages (tiếng Việt) ──► AppStore (offline-first)                                 │
│                          ├─ base: dữ liệu đã xác nhận (đệm localStorage)       │
│                          ├─ outbox: thay đổi chờ gửi (bền, tự thử lại)          │
│                          └─ data = base + outbox (hiển thị lạc quan)           │
│                        Repository ─┬─ SupabaseRepository (đám mây)              │
│                                    └─ LocalRepository (chế độ dùng thử)        │
│ Bản nháp: nhập nhanh & báo cáo (localStorage theo người dùng)                   │
│ Service worker (Workbox): mở ứng dụng khi không có mạng                         │
└──────────────────────────────┬──────────────────────────────────────────────────┘
                               │ HTTPS (khoá anon + JWT người dùng)
┌──────────────────────────────▼──────────── Supabase ───────────────────────────┐
│ Auth (email/mật khẩu) · PostgREST · Realtime                                    │
│ PostgreSQL: team_members, tasks, reports (bất biến), report_events              │
│ RLS: user_id = auth.uid() · quyền cấp cột chặn sửa trạng thái báo cáo           │
│ RPC SECURITY DEFINER: confirm_report_export · restore_task_to_unreported ·      │
│                       import_backup                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Mô hình dữ liệu

| Bảng | Vai trò |
| --- | --- |
| `team_members` | Thành viên; có `archived` để lưu trữ, không xoá |
| `tasks` | Công việc gồm `work_date` (mặc định là hôm nay theo giờ VN), `category`, `status`, `priority`, `assignment_type` (`self`/`assigned`/`coordinated`), `team_member_id`, và **trạng thái báo cáo riêng của từng công việc**: `report_status`, `report_id`, `reported_at` |
| `reports` | Ảnh chụp bất biến: `code` (BC-YYYYMMDD-NNN), `request_id` (idempotency), `content` (văn bản cuối cùng sau khi đã sửa), `task_ids`, `task_count`, `date_from`/`date_to`, `task_snapshot` (dữ liệu công việc tại thời điểm xuất), `exported_at`, `status` |
| `report_events` | Nhật ký: `exported`, `task_restored` (kèm lý do) |

## Quy tắc xuất báo cáo (phần cốt lõi)

1. **Danh sách đủ điều kiện:** mọi công việc có `report_status = 'unreported'`, không lọc theo ngày. Danh sách được nhóm theo ngày thực tế và mặc định **không chọn** việc nào.
2. **Chỉ thao tác theo ID:** client gửi `p_task_ids uuid[]`. Không có API nào đánh dấu công việc theo ngày.
3. **Xem trước và chỉnh sửa:** nội dung được tạo từ dữ liệu thật của các việc đã chọn (`src/lib/reportGenerator.ts`). Sửa nội dung không ảnh hưởng tới công việc gốc.
4. **Sao chép** chỉ gọi clipboard (`src/lib/clipboard.ts`) và không đụng tới dữ liệu.
5. **Xác nhận** gọi RPC `confirm_report_export(request_id, task_ids, content)`. Trong **một giao dịch**, RPC thực hiện:
   - `pg_advisory_xact_lock` theo người dùng để tuần tự hoá mọi lần xuất đồng thời;
   - nếu `request_id` đã tồn tại với cùng tập ID thì trả lại báo cáo cũ (gửi lại sau khi mất phản hồi sẽ không tạo bản trùng); khác tập ID thì báo `REQUEST_ID_CONFLICT`;
   - `SELECT … FOR UPDATE` các công việc; nếu thiếu việc nào thì báo `TASK_NOT_FOUND`, nếu có việc đã báo cáo thì báo `TASK_ALREADY_REPORTED` và **huỷ toàn bộ** giao dịch;
   - tạo báo cáo kèm ảnh chụp, cập nhật đúng các ID đã chọn, rồi ghi sự kiện.
6. Client chỉ báo **thành công sau khi RPC trả về** (máy chủ đã commit). Trước đó, outbox phải được gửi hết (`requireSynced`) để những việc tạo khi ngoại tuyến đã có trên máy chủ.
7. **Bản nháp** (`requestId`, các ID đã chọn, nội dung, tuỳ chọn) được lưu trên thiết bị sau mỗi thay đổi. Rời trang thì giữ nguyên bản nháp và không công việc nào bị đổi trạng thái. Khi mở lại, bản nháp được đối chiếu: việc đã được báo cáo ở nơi khác sẽ bị loại khỏi lựa chọn, và nếu `requestId` đã được máy chủ ghi nhận thì ứng dụng chuyển thẳng tới báo cáo đó.
8. **Khôi phục:** RPC `restore_task_to_unreported` đưa công việc về “Chưa báo cáo”, ghi sự kiện `task_restored` và giữ nguyên báo cáo cũ.

## Bảo mật

- RLS trên mọi bảng: chỉ được đọc/ghi dữ liệu của chính mình.
- Quyền cấp cột: role `authenticated` **không** có quyền INSERT/UPDATE các cột `report_status`, `report_id`, `reported_at`. Các cột này chỉ thay đổi qua RPC.
- `reports` chỉ cho SELECT; thêm trigger chặn UPDATE để báo cáo luôn bất biến.
- Trigger kiểm tra thành viên được gán phải thuộc cùng người dùng.
- RPC `SECURITY DEFINER` đặt `search_path = public`, tự kiểm tra `auth.uid()`, đã thu hồi quyền của `anon`.
- Frontend chỉ chứa khoá `anon` công khai. Khi đăng xuất, dữ liệu đệm trên thiết bị bị xoá (có cảnh báo nếu còn thay đổi chưa đồng bộ).

## Đồng bộ & ngoại tuyến

- Thao tác thêm/sửa/xoá công việc và thành viên được hiển thị ngay, đưa vào outbox lưu bền, rồi gửi tuần tự. Gặp lỗi mạng thì giữ trong hàng đợi và thử lại theo backoff (3s → 60s), cũng như khi có sự kiện `online` hoặc khi ứng dụng được mở lại.
- ID công việc do client tạo (UUID). Nếu gửi lại sau khi máy chủ đã lưu (lỗi 23505) thì coi là thành công.
- Đồng bộ nhiều thiết bị: Supabase Realtime (`postgres_changes`, lọc theo `user_id`) kích hoạt tải lại, kèm tải lại khi ứng dụng trở lại tiền cảnh.
- Thao tác xuất, khôi phục và nhập sao lưu **bắt buộc trực tuyến** và không bao giờ được đưa vào hàng đợi.

## Múi giờ

Mọi “ngày làm việc” đều tính theo `Asia/Ho_Chi_Minh`: phía client qua `Intl.DateTimeFormat`, phía máy chủ qua `public.vn_today()`. Mã báo cáo cũng dùng ngày theo giờ Việt Nam.

## Các giai đoạn triển khai

| Giai đoạn | Nội dung | Trạng thái |
| --- | --- | --- |
| 1 | Giao diện tiếng Việt, điều hướng dưới, nhập nhanh, PWA | ✅ |
| 2 | Schema Supabase, RLS, Auth, đồng bộ offline-first | ✅ |
| 3 | Chọn từng việc, xem trước/sửa, sao chép, xuất nguyên tử, lịch sử, khôi phục | ✅ |
| 4 | Đội nhóm, Tổng quan, sao lưu JSON/CSV, kiểm thử unit/DB/E2E, CI | ✅ |
