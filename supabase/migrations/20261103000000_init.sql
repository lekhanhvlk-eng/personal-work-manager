-- =====================================================================
-- Personal Work Manager & Smart Reporting — schema khởi tạo
-- Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh
-- =====================================================================
-- Nguyên tắc:
--  * Mỗi bản ghi thuộc về một người dùng (user_id = auth.uid()), bảo vệ bằng RLS.
--  * Trạng thái báo cáo của công việc (report_status / report_id / reported_at)
--    KHÔNG thể sửa trực tiếp từ client — chỉ thay đổi qua các hàm RPC
--    confirm_report_export() và restore_task_to_unreported() (giao dịch nguyên tử).
--  * Báo cáo (reports) là ảnh chụp bất biến: không có quyền UPDATE/DELETE.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Hàm tiện ích
-- ---------------------------------------------------------------------
create or replace function public.vn_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Thành viên đội nhóm
-- ---------------------------------------------------------------------
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  role        text check (role is null or char_length(role) <= 120),
  phone       text check (phone is null or char_length(phone) <= 40),
  note        text check (note is null or char_length(note) <= 2000),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists team_members_user_idx on public.team_members (user_id, archived, name);

create trigger team_members_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Báo cáo (ảnh chụp bất biến)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  code           text not null,                       -- Mã báo cáo hiển thị, ví dụ BC-20261103-001
  request_id     uuid not null,                       -- Khoá idempotency do client tạo
  status         text not null default 'confirmed' check (status in ('confirmed')),
  content        text not null check (char_length(btrim(content)) > 0),
  task_ids       uuid[] not null check (cardinality(task_ids) > 0),
  task_count     integer not null check (task_count > 0),
  date_from      date not null,
  date_to        date not null,
  task_snapshot  jsonb not null,                      -- Ảnh chụp dữ liệu công việc tại thời điểm xuất
  exported_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint reports_user_code_key unique (user_id, code),
  constraint reports_user_request_key unique (user_id, request_id),
  constraint reports_date_range check (date_from <= date_to)
);

create index if not exists reports_user_exported_idx on public.reports (user_id, exported_at desc);

-- Bảo đảm báo cáo không bao giờ bị sửa (kể cả từ hàm SECURITY DEFINER).
create or replace function public.reports_block_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'REPORT_IMMUTABLE' using errcode = 'P0001',
    hint = 'Báo cáo đã xuất là ảnh chụp bất biến và không thể chỉnh sửa.';
end;
$$;

create trigger reports_immutable
  before update on public.reports
  for each row execute function public.reports_block_update();

-- ---------------------------------------------------------------------
-- Công việc
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  description      text not null check (char_length(btrim(description)) between 1 and 4000),
  work_date        date not null default public.vn_today(),
  category         text not null default 'other' check (category in (
                     'boss_assigned', 'team_coordination', 'store_audit', 'issue_handling',
                     'reporting_analysis', 'training', 'follow_up', 'other')),
  status           text not null default 'done' check (status in (
                     'not_started', 'in_progress', 'done', 'awaiting_feedback', 'pending')),
  priority         text check (priority is null or priority in ('low', 'medium', 'high')),
  assignment_type  text not null default 'self' check (assignment_type in ('self', 'assigned', 'coordinated')),
  team_member_id   uuid references public.team_members (id) on delete set null,
  notes            text check (notes is null or char_length(notes) <= 4000),
  due_date         date,
  report_status    text not null default 'unreported' check (report_status in ('unreported', 'reported')),
  report_id        uuid references public.reports (id) on delete set null,
  reported_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tasks_report_consistency check (
    (report_status = 'unreported' and report_id is null and reported_at is null)
    or (report_status = 'reported')
  )
);

create index if not exists tasks_user_date_idx on public.tasks (user_id, work_date desc, created_at desc);
create index if not exists tasks_user_report_idx on public.tasks (user_id, report_status);
create index if not exists tasks_member_idx on public.tasks (team_member_id);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Thành viên được gán phải thuộc cùng người dùng.
create or replace function public.tasks_check_member_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_member_id is not null and not exists (
    select 1 from public.team_members m
    where m.id = new.team_member_id and m.user_id = new.user_id
  ) then
    raise exception 'INVALID_TEAM_MEMBER' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger tasks_member_owner
  before insert or update of team_member_id, user_id on public.tasks
  for each row execute function public.tasks_check_member_owner();

-- ---------------------------------------------------------------------
-- Nhật ký sự kiện báo cáo (xuất / khôi phục)
-- ---------------------------------------------------------------------
create table if not exists public.report_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  report_id   uuid not null references public.reports (id) on delete cascade,
  task_id     uuid,                                   -- không dùng FK: giữ lịch sử kể cả khi công việc bị xoá
  event_type  text not null check (event_type in ('exported', 'task_restored')),
  note        text check (note is null or char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);

create index if not exists report_events_user_idx on public.report_events (user_id, created_at desc);
create index if not exists report_events_report_idx on public.report_events (report_id);

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.team_members  enable row level security;
alter table public.tasks         enable row level security;
alter table public.reports       enable row level security;
alter table public.report_events enable row level security;

create policy "team_members_select_own" on public.team_members
  for select to authenticated using (user_id = auth.uid());
create policy "team_members_insert_own" on public.team_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "team_members_update_own" on public.team_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "team_members_delete_own" on public.team_members
  for delete to authenticated using (user_id = auth.uid());

create policy "tasks_select_own" on public.tasks
  for select to authenticated using (user_id = auth.uid());
create policy "tasks_insert_own" on public.tasks
  for insert to authenticated with check (user_id = auth.uid());
create policy "tasks_update_own" on public.tasks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_delete_own" on public.tasks
  for delete to authenticated using (user_id = auth.uid());

create policy "reports_select_own" on public.reports
  for select to authenticated using (user_id = auth.uid());

create policy "report_events_select_own" on public.report_events
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Quyền cấp cột: client không thể tự đổi trạng thái báo cáo.
-- ---------------------------------------------------------------------
revoke all on public.team_members, public.tasks, public.reports, public.report_events from anon;
revoke all on public.team_members, public.tasks, public.reports, public.report_events from authenticated;

grant select, insert, update, delete on public.team_members to authenticated;

grant select, delete on public.tasks to authenticated;
grant insert (id, user_id, description, work_date, category, status, priority, assignment_type,
              team_member_id, notes, due_date, created_at)
  on public.tasks to authenticated;
grant update (description, work_date, category, status, priority, assignment_type,
              team_member_id, notes, due_date)
  on public.tasks to authenticated;

grant select on public.reports to authenticated;
grant select on public.report_events to authenticated;

-- ---------------------------------------------------------------------
-- RPC: Xác nhận xuất báo cáo (NGUYÊN TỬ, CHỐNG TRÙNG, IDEMPOTENT)
-- ---------------------------------------------------------------------
-- * Thao tác trên danh sách ID công việc cụ thể, không bao giờ theo ngày.
-- * Khoá tư vấn (advisory lock) theo người dùng => tuần tự hoá mọi lần xuất đồng thời.
-- * Khoá hàng (FOR UPDATE) các công việc được chọn.
-- * Nếu bất kỳ công việc nào đã được báo cáo => huỷ toàn bộ (TASK_ALREADY_REPORTED).
-- * Gọi lại với cùng p_request_id (ví dụ mất mạng sau khi máy chủ đã commit)
--   => trả về báo cáo đã có, không tạo bản trùng.
create or replace function public.confirm_report_export(
  p_request_id uuid,
  p_task_ids   uuid[],
  p_content    text
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_ids       uuid[];
  v_existing  public.reports;
  v_report    public.reports;
  v_found     integer;
  v_reported  uuid[];
  v_prefix    text;
  v_seq       integer;
  v_from      date;
  v_to        date;
  v_snapshot  jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'INVALID_REQUEST' using errcode = 'P0001';
  end if;
  if p_task_ids is null or cardinality(p_task_ids) = 0 then
    raise exception 'NO_TASKS_SELECTED' using errcode = 'P0001';
  end if;
  if p_content is null or char_length(btrim(p_content)) = 0 then
    raise exception 'EMPTY_CONTENT' using errcode = 'P0001';
  end if;

  -- Tuần tự hoá các lần xuất của cùng người dùng.
  perform pg_advisory_xact_lock(hashtextextended('pwm_report_export:' || v_uid::text, 0));

  select array_agg(distinct x order by x) into v_ids from unnest(p_task_ids) as x where x is not null;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'NO_TASKS_SELECTED' using errcode = 'P0001';
  end if;

  -- Idempotency: yêu cầu này đã được commit trước đó?
  select * into v_existing from public.reports
   where user_id = v_uid and request_id = p_request_id;
  if found then
    if (select array_agg(x order by x) from unnest(v_existing.task_ids) as x) = v_ids then
      return v_existing;
    end if;
    raise exception 'REQUEST_ID_CONFLICT' using errcode = 'P0001';
  end if;

  -- Khoá các công việc được chọn.
  perform 1 from public.tasks
   where user_id = v_uid and id = any (v_ids)
   for update;

  select count(*) into v_found from public.tasks where user_id = v_uid and id = any (v_ids);
  if v_found <> cardinality(v_ids) then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0001';
  end if;

  select array_agg(id order by id) into v_reported
    from public.tasks
   where user_id = v_uid and id = any (v_ids) and report_status <> 'unreported';
  if v_reported is not null then
    raise exception 'TASK_ALREADY_REPORTED' using errcode = 'P0001',
      detail = array_to_string(v_reported, ',');
  end if;

  select min(work_date), max(work_date) into v_from, v_to
    from public.tasks where user_id = v_uid and id = any (v_ids);

  select jsonb_agg(
           jsonb_build_object(
             'id', t.id,
             'description', t.description,
             'work_date', t.work_date,
             'category', t.category,
             'status', t.status,
             'priority', t.priority,
             'assignment_type', t.assignment_type,
             'team_member_id', t.team_member_id,
             'team_member_name', m.name,
             'notes', t.notes,
             'due_date', t.due_date,
             'created_at', t.created_at
           ) order by t.work_date, t.created_at, t.id)
    into v_snapshot
    from public.tasks t
    left join public.team_members m on m.id = t.team_member_id
   where t.user_id = v_uid and t.id = any (v_ids);

  v_prefix := 'BC-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD') || '-';
  select coalesce(max(nullif(substring(code from char_length(v_prefix) + 1), '')::integer), 0) + 1
    into v_seq
    from public.reports
   where user_id = v_uid and code like v_prefix || '%' and substring(code from char_length(v_prefix) + 1) ~ '^[0-9]+$';

  insert into public.reports (user_id, code, request_id, status, content, task_ids, task_count,
                              date_from, date_to, task_snapshot)
  values (v_uid, v_prefix || lpad(v_seq::text, 3, '0'), p_request_id, 'confirmed', p_content, v_ids,
          cardinality(v_ids), v_from, v_to, v_snapshot)
  returning * into v_report;

  update public.tasks
     set report_status = 'reported',
         report_id     = v_report.id,
         reported_at   = v_report.exported_at
   where user_id = v_uid and id = any (v_ids) and report_status = 'unreported';

  get diagnostics v_found = row_count;
  if v_found <> cardinality(v_ids) then
    -- Không bao giờ xảy ra do đã khoá hàng, nhưng phòng thủ: huỷ toàn bộ giao dịch.
    raise exception 'EXPORT_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.report_events (user_id, report_id, task_id, event_type)
  values (v_uid, v_report.id, null, 'exported');

  return v_report;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: Khôi phục một công việc về trạng thái "Chưa báo cáo"
-- (Báo cáo cũ được giữ nguyên; ghi nhận sự kiện khôi phục.)
-- ---------------------------------------------------------------------
create or replace function public.restore_task_to_unreported(
  p_task_id uuid,
  p_note    text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_task  public.tasks;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pwm_report_export:' || v_uid::text, 0));

  select * into v_task from public.tasks
   where id = p_task_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'TASK_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_task.report_status <> 'reported' then
    raise exception 'TASK_NOT_REPORTED' using errcode = 'P0001';
  end if;

  if v_task.report_id is not null then
    insert into public.report_events (user_id, report_id, task_id, event_type, note)
    values (v_uid, v_task.report_id, v_task.id, 'task_restored', nullif(btrim(coalesce(p_note, '')), ''));
  end if;

  update public.tasks
     set report_status = 'unreported', report_id = null, reported_at = null
   where id = v_task.id
  returning * into v_task;

  return v_task;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: Nhập dữ liệu sao lưu (JSON) — an toàn, KHÔNG ghi đè, KHÔNG xoá.
-- Bản ghi đã tồn tại (trùng ID) được bỏ qua.
-- ---------------------------------------------------------------------
create or replace function public.import_backup(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_item     jsonb;
  v_members  integer := 0;
  v_tasks    integer := 0;
  v_reports  integer := 0;
  v_events   integer := 0;
  v_skipped  integer := 0;
  v_n        integer;
  v_report_id uuid;
  v_member_id uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_BACKUP' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pwm_report_export:' || v_uid::text, 0));

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'team_members', '[]'::jsonb)) loop
    insert into public.team_members (id, user_id, name, role, phone, note, archived, created_at)
    values ((v_item ->> 'id')::uuid, v_uid, v_item ->> 'name', v_item ->> 'role', v_item ->> 'phone',
            v_item ->> 'note', coalesce((v_item ->> 'archived')::boolean, false),
            coalesce((v_item ->> 'created_at')::timestamptz, now()))
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_members := v_members + v_n; v_skipped := v_skipped + (1 - v_n);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'reports', '[]'::jsonb)) loop
    insert into public.reports (id, user_id, code, request_id, status, content, task_ids, task_count,
                                date_from, date_to, task_snapshot, exported_at, created_at)
    values ((v_item ->> 'id')::uuid, v_uid, v_item ->> 'code',
            coalesce((v_item ->> 'request_id')::uuid, gen_random_uuid()), 'confirmed',
            v_item ->> 'content',
            array(select jsonb_array_elements_text(v_item -> 'task_ids'))::uuid[],
            (v_item ->> 'task_count')::integer,
            (v_item ->> 'date_from')::date, (v_item ->> 'date_to')::date,
            coalesce(v_item -> 'task_snapshot', '[]'::jsonb),
            coalesce((v_item ->> 'exported_at')::timestamptz, now()),
            coalesce((v_item ->> 'created_at')::timestamptz, now()))
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_reports := v_reports + v_n; v_skipped := v_skipped + (1 - v_n);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'tasks', '[]'::jsonb)) loop
    select id into v_report_id from public.reports
     where id = (v_item ->> 'report_id')::uuid and user_id = v_uid;
    select id into v_member_id from public.team_members
     where id = (v_item ->> 'team_member_id')::uuid and user_id = v_uid;
    insert into public.tasks (id, user_id, description, work_date, category, status, priority,
                              assignment_type, team_member_id, notes, due_date,
                              report_status, report_id, reported_at, created_at)
    values ((v_item ->> 'id')::uuid, v_uid, v_item ->> 'description',
            coalesce((v_item ->> 'work_date')::date, public.vn_today()),
            coalesce(v_item ->> 'category', 'other'), coalesce(v_item ->> 'status', 'done'),
            v_item ->> 'priority', coalesce(v_item ->> 'assignment_type', 'self'),
            v_member_id, v_item ->> 'notes', (v_item ->> 'due_date')::date,
            case when v_item ->> 'report_status' = 'reported' then 'reported' else 'unreported' end,
            case when v_item ->> 'report_status' = 'reported' then v_report_id else null end,
            case when v_item ->> 'report_status' = 'reported' then (v_item ->> 'reported_at')::timestamptz else null end,
            coalesce((v_item ->> 'created_at')::timestamptz, now()))
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_tasks := v_tasks + v_n; v_skipped := v_skipped + (1 - v_n);
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'report_events', '[]'::jsonb)) loop
    if exists (select 1 from public.reports where id = (v_item ->> 'report_id')::uuid and user_id = v_uid) then
      insert into public.report_events (id, user_id, report_id, task_id, event_type, note, created_at)
      values ((v_item ->> 'id')::uuid, v_uid, (v_item ->> 'report_id')::uuid, (v_item ->> 'task_id')::uuid,
              v_item ->> 'event_type', v_item ->> 'note',
              coalesce((v_item ->> 'created_at')::timestamptz, now()))
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_events := v_events + v_n; v_skipped := v_skipped + (1 - v_n);
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('team_members', v_members, 'tasks', v_tasks, 'reports', v_reports,
                            'report_events', v_events, 'skipped', v_skipped);
end;
$$;

revoke all on function public.confirm_report_export(uuid, uuid[], text) from public, anon;
revoke all on function public.restore_task_to_unreported(uuid, text) from public, anon;
revoke all on function public.import_backup(jsonb) from public, anon;
grant execute on function public.confirm_report_export(uuid, uuid[], text) to authenticated;
grant execute on function public.restore_task_to_unreported(uuid, text) to authenticated;
grant execute on function public.import_backup(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Đồng bộ thời gian thực (Supabase Realtime) giữa nhiều thiết bị
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks, public.team_members,
      public.reports, public.report_events;
  end if;
end;
$$;
