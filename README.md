# Trợ lý Công việc — Quản lý công việc & Báo cáo thông minh

Ứng dụng web cài đặt được (PWA), tối ưu cho điện thoại Android, giúp người giám sát:

- **Ghi nhận công việc trong vài giây.** Chỉ bắt buộc nhập nội dung; ngày mặc định là hôm nay theo giờ Việt Nam.
- **Điều phối đội nhóm:** giao việc, ghi nhận điều phối, theo dõi trạng thái từng thành viên.
- **Xuất báo cáo:** tự chọn **từng công việc** cần báo cáo, xem trước, chỉnh sửa, sao chép sang Zalo/Outlook, rồi **xác nhận xuất**. Công việc không được chọn vẫn ở trạng thái “Chưa báo cáo” cho lần sau.
- **Lưu trên đám mây:** dùng Supabase (PostgreSQL + Auth + Row Level Security), đồng bộ giữa nhiều thiết bị và vẫn ghi được khi mất mạng.

> Kiến trúc chi tiết: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

---

## 1. Chạy thử nhanh (không cần Supabase)

```bash
npm install
npm run dev          # mở http://localhost:5173
```

Khi chưa cấu hình Supabase, ứng dụng chạy ở **Chế độ dùng thử**: dữ liệu chỉ nằm trong trình duyệt của thiết bị đó. Vào **Cài đặt → Tạo dữ liệu mẫu** để có sẵn dữ liệu thử, gồm cả kịch bản 5 công việc cùng ngày. Dữ liệu mẫu chỉ có trong chế độ dùng thử và không bao giờ được ghi vào tài khoản đám mây.

## 2. Cài đặt Supabase (lưu trữ đám mây)

1. Tạo dự án mới tại <https://supabase.com>. Bạn có thể chọn vùng Singapore (`ap-southeast-1`) để có độ trễ thấp từ Việt Nam.
2. **Tạo cơ sở dữ liệu** bằng một trong hai cách:
   - **Dashboard:** mở *SQL Editor*, dán toàn bộ nội dung `supabase/migrations/20261103000000_init.sql` rồi bấm *Run*.
   - **Supabase CLI:**
     ```bash
     npx supabase init            # chỉ lần đầu, tạo supabase/config.toml (giữ nguyên thư mục migrations)
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npx supabase db push
     ```
3. **Cấu hình xác thực** (*Authentication → Providers → Email*): bật Email. Nên giữ *Confirm email*.
   Trong *Authentication → URL Configuration*, đặt **Site URL** là địa chỉ triển khai (ví dụ `https://tro-ly-cong-viec.vercel.app`) và thêm `http://localhost:5173` vào *Redirect URLs*.
4. **Realtime:** migration đã tự thêm các bảng vào publication `supabase_realtime`. Bạn có thể kiểm tra ở *Database → Publications*.
5. **Biến môi trường:** sao chép `.env.example` thành `.env.local` rồi điền:
   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon / publishable key>
   ```
   Lấy hai giá trị này tại *Project Settings → API*.
   **Tuyệt đối không** đặt `service_role` key vào frontend hoặc vào bất kỳ biến `VITE_*` nào. Ứng dụng chỉ cần khoá công khai `anon`; mọi quyền truy cập đều được RLS bảo vệ.
6. Chạy `npm run dev`, đăng ký tài khoản, xác nhận email, rồi đăng nhập.

### Dữ liệu mẫu cho tài khoản kiểm thử (tuỳ chọn)

Đăng ký một tài khoản **riêng** để kiểm thử, sửa email trong `supabase/seed_demo.sql` rồi chạy file đó trong SQL Editor. Tập lệnh sẽ tự dừng nếu tài khoản đã có dữ liệu, để không trộn dữ liệu mẫu với dữ liệu thật.

## 3. Triển khai (deploy)

Ứng dụng là trang tĩnh (`npm run build` → thư mục `dist/`).

- **Vercel:** import repository, chọn Framework *Vite*, khai báo `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` trong *Environment Variables*, rồi deploy. Chuyển hướng SPA đã được cấu hình sẵn trong `vercel.json`.
- **Netlify:** import repository rồi khai báo hai biến môi trường như trên; `netlify.toml` đã có sẵn cấu hình.
- **Hosting khác:** chạy `npm run build` rồi phục vụ thư mục `dist/` qua HTTPS, chuyển mọi đường dẫn về `index.html`, và không lưu đệm `sw.js`.

Sau khi deploy, cập nhật *Site URL* và *Redirect URLs* trong Supabase Auth.

### Cài lên điện thoại Android

Mở địa chỉ ứng dụng bằng Chrome, chọn menu **⋮ → Cài đặt ứng dụng** (hoặc *Thêm vào màn hình chính*). Ứng dụng có biểu tượng riêng, mở toàn màn hình và có lối tắt “Thêm công việc” và “Xuất báo cáo mới”.

## 4. Kiểm thử

| Lệnh | Nội dung |
| --- | --- |
| `npm test` | Kiểm thử đơn vị/logic (Vitest + jsdom): tạo báo cáo, lọc, ngày giờ VN, kho dữ liệu, đồng bộ ngoại tuyến, bản nháp |
| `npm run test:db` | Kiểm thử tích hợp trên **PostgreSQL thật**: migration, RLS, xuất nguyên tử, chống trùng (kể cả 2 yêu cầu đồng thời), idempotency, khôi phục, ảnh chụp bất biến, nhập sao lưu. Cần `TEST_DATABASE_URL` |
| `npm run test:e2e` | Kiểm thử đầu-cuối Playwright trên khung hình Android (Pixel 7 và màn hình 360px), chạy ở chế độ dùng thử |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |

Ví dụ chạy kiểm thử CSDL với PostgreSQL cục bộ:

```bash
createdb pwm_test
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/pwm_test npm run test:db
```

> Bộ kiểm thử CSDL **xoá và tạo lại** schema `public`/`auth` của database được chỉ định. Chỉ dùng database kiểm thử riêng, không bao giờ trỏ vào Supabase thật.

GitHub Actions (`.github/workflows/ci.yml`) chạy toàn bộ các bước trên cho mỗi lần push.

### Các tiêu chí nghiệm thu đã có kiểm thử tự động

| Tiêu chí | Kiểm thử |
| --- | --- |
| Nhập nhanh, ngày mặc định hôm nay | e2e `nhập nhanh…`, unit `dates.test.ts` |
| Lưu trữ & đồng bộ đám mây, nhiều thiết bị | unit `store.test.ts` (đồng bộ nhiều thiết bị), db tests |
| Sửa, xoá có xác nhận | e2e `sửa và xoá…`, unit `store.test.ts` |
| Chọn / bỏ chọn, Chọn tất cả / Bỏ chọn tất cả | e2e `XUẤT MỘT PHẦN…` |
| Xuất một phần, nhiều việc cùng ngày (mục 8) | e2e, `localRepository.test.ts`, db `kịch bản xuất một phần` |
| Sao chép không đổi trạng thái | e2e (đọc clipboard rồi kiểm tra số việc chưa báo cáo vẫn là 5) |
| Xác nhận rõ ràng, xuất nguyên tử | db tests (huỷ toàn bộ khi có lỗi), unit store |
| Chống xuất trùng (kể cả đồng thời) | db `hai yêu cầu đồng thời`, unit, e2e bấm đúp |
| Khôi phục việc đã xuất | db, unit, e2e |
| Ảnh chụp báo cáo lịch sử không đổi | db, unit |
| Mất mạng & khôi phục bản nháp | unit `store.test.ts` (outbox bền), e2e bản nháp & PWA ngoại tuyến |
| Giao diện Android | e2e trên 2 khung hình, kiểm tra không cuộn ngang |

## 5. Sao lưu & khôi phục

Vào **Cài đặt**:

- **Sao lưu JSON:** tải toàn bộ công việc, thành viên, báo cáo và nhật ký.
- **Xuất CSV:** có BOM UTF‑8 để Excel hiển thị đúng tiếng Việt; đã chống CSV injection.
- **Khôi phục:** chỉ **thêm** những bản ghi còn thiếu, không ghi đè và không xoá dữ liệu hiện có. Trên đám mây, việc khôi phục chạy trong một giao dịch duy nhất (RPC `import_backup`).

Ứng dụng **không bao giờ tự xoá** công việc sau khi báo cáo.

## 6. Cấu trúc thư mục

```
supabase/migrations/   Schema, RLS, RPC (confirm_report_export, restore_task_to_unreported, import_backup)
supabase/seed_demo.sql Dữ liệu mẫu cho tài khoản kiểm thử
src/lib/               Logic thuần: tạo báo cáo, lọc, ngày giờ VN, CSV/JSON
src/data/              Repository: Supabase (đám mây) & Local (dùng thử)
src/state/             Store offline-first (outbox), bản nháp, xác thực
src/pages/, components/ Giao diện tiếng Việt
tests/db/              Kiểm thử tích hợp PostgreSQL
e2e/                   Kiểm thử Playwright (Android)
```

## 7. Bản mở trên điện thoại qua link (không cần tài khoản)

```bash
npm run build:artifact   # → dist-artifact/tro-ly-cong-viec.html
```

Lệnh này đóng gói toàn bộ ứng dụng thành **một tệp HTML**. Dữ liệu được lưu trong trình duyệt của điện thoại, không cần Supabase, và giao diện, tính năng vẫn giữ nguyên. Vì trang mở qua link không tải tệp xuống được, phần sao lưu dùng cách **sao chép / dán**.
