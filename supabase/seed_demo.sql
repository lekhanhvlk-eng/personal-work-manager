-- =====================================================================
-- DỮ LIỆU MẪU — CHỈ DÙNG CHO TÀI KHOẢN KIỂM THỬ (KHÔNG dùng cho tài khoản thật)
-- =====================================================================
-- Cách dùng:
--   1. Đăng ký một tài khoản riêng để kiểm thử, ví dụ demo@example.com.
--   2. Sửa biến v_email bên dưới, chạy toàn bộ file trong Supabase SQL Editor.
-- Tập lệnh sẽ dừng nếu tài khoản đã có dữ liệu, để tránh trộn với dữ liệu thật.
-- Bao gồm kịch bản kiểm thử "5 công việc cùng ngày" (xuất một phần).
do $$
declare
  v_email text := 'demo@example.com';
  v_uid   uuid;
  v_lan   uuid := gen_random_uuid();
  v_minh  uuid := gen_random_uuid();
  v_hoa   uuid := gen_random_uuid();
  v_today date := public.vn_today();
begin
  select id into v_uid from auth.users where email = v_email;
  if v_uid is null then
    raise exception 'Không tìm thấy tài khoản %', v_email;
  end if;
  if exists (select 1 from public.tasks where user_id = v_uid) then
    raise exception 'Tài khoản % đã có dữ liệu — dừng để tránh trộn dữ liệu mẫu với dữ liệu thật.', v_email;
  end if;

  insert into public.team_members (id, user_id, name, role) values
    (v_lan,  v_uid, 'Nguyễn Thị Lan', 'Giám sát khu vực Q.7'),
    (v_minh, v_uid, 'Trần Văn Minh',  'Nhân viên kiểm kê'),
    (v_hoa,  v_uid, 'Lê Thu Hoa',     'Nhân viên mới');

  insert into public.tasks (user_id, description, work_date, category, status, assignment_type, team_member_id, created_at) values
    (v_uid, 'Kiểm tra và đánh giá hoạt động 5 cửa hàng Vinamilk',      v_today - 1, 'store_audit',        'done',        'self',        null,   now() - interval '50 min'),
    (v_uid, 'Điều phối lịch làm việc và phân công nhiệm vụ cho team',  v_today - 1, 'team_coordination',  'done',        'coordinated', v_lan,  now() - interval '40 min'),
    (v_uid, 'Đào tạo nhân viên mới về quy trình kiểm kê',              v_today - 1, 'training',           'done',        'self',        v_hoa,  now() - interval '30 min'),
    (v_uid, 'Chuẩn bị báo cáo kết quả audit',                          v_today - 1, 'reporting_analysis', 'in_progress', 'self',        null,   now() - interval '20 min'),
    (v_uid, 'Theo dõi tiến độ khắc phục vi phạm tại cửa hàng',          v_today - 1, 'follow_up',          'pending',     'assigned',    v_minh, now() - interval '10 min'),
    (v_uid, 'Họp giao ban đầu tuần với quản lý khu vực',               v_today - 2, 'boss_assigned',      'done',        'self',        null,   now() - interval '2 days'),
    (v_uid, 'Tổng hợp số liệu doanh số tuần và gửi sếp',               v_today,     'reporting_analysis', 'done',        'self',        null,   now());
end;
$$;
