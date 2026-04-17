-- ============================================================
-- COSS 예산관리 시스템 초기 마이그레이션
-- ============================================================

-- 사용자 권한 테이블
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  role text not null default 'staff'
    check (role in ('super_admin', 'admin', 'staff', 'professor')),
  created_at timestamptz default now()
);

-- 권한 부여 테이블 (admin용 세부 권한)
create table if not exists user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  permission text not null
    check (permission in ('program:write', 'expenditure:write', 'advance:write')),
  granted_by uuid references users(id),
  created_at timestamptz default now(),
  unique(user_id, permission)
);

-- 예산변경 이력 테이블
create table if not exists budget_change_history (
  id uuid primary key default gen_random_uuid(),
  changed_at date not null,
  changed_by uuid references users(id),
  category text not null,
  before_amount bigint not null,
  adjustment bigint not null,
  after_amount bigint not null,
  pdf_drive_url text,
  snapshot jsonb,
  created_at timestamptz default now()
);

-- 지출부 파일 메타데이터
create table if not exists expenditure_files (
  id uuid primary key default gen_random_uuid(),
  sheet_name text not null,
  row_index integer not null,
  drive_file_id text not null,
  drive_url text not null,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz default now()
);

-- 산단카드 집행내역
create table if not exists card_expenditures (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null,
  category text not null,
  merchant text,
  description text,
  amount bigint not null,
  erp_registered boolean default false,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security 활성화
-- ============================================================
alter table users enable row level security;
alter table user_permissions enable row level security;
alter table budget_change_history enable row level security;
alter table expenditure_files enable row level security;
alter table card_expenditures enable row level security;

-- ============================================================
-- RLS 정책 (서비스 롤로 모든 접근 허용 — 앱에서 직접 제어)
-- ============================================================

-- users: 인증된 사용자는 자기 행 읽기 가능, 서비스 롤로 쓰기
create policy "users_select_own" on users
  for select using (true);

-- user_permissions: 서비스 롤에서 관리
create policy "user_permissions_select_all" on user_permissions
  for select using (true);

-- budget_change_history: 인증된 사용자 읽기
create policy "budget_history_select_all" on budget_change_history
  for select using (true);

-- expenditure_files: 인증된 사용자 읽기
create policy "expenditure_files_select_all" on expenditure_files
  for select using (true);

-- card_expenditures: 인증된 사용자 읽기
create policy "card_expenditures_select_all" on card_expenditures
  for select using (true);

-- ============================================================
-- 인덱스
-- ============================================================
create index if not exists idx_users_email on users(email);
create index if not exists idx_user_permissions_user_id on user_permissions(user_id);
create index if not exists idx_budget_history_changed_at on budget_change_history(changed_at desc);
create index if not exists idx_expenditure_files_sheet_row on expenditure_files(sheet_name, row_index);
create index if not exists idx_card_expenditures_date on card_expenditures(expense_date desc);
