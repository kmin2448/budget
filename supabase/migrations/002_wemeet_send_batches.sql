-- WE-Meet 보내기 배치 이력 테이블
-- 보내기 시 여러 팀을 한 번에 묶어서 전송한 기록을 보관한다.
-- expenditure_row_index: 집행내역 시트의 행 번호 (clear 방식이라 row shift 없음)

create table if not exists public.wemeet_send_batches (
  id              uuid primary key default gen_random_uuid(),
  category        text not null,
  budget_type     text not null,           -- 'main' | 'carryover'
  description     text not null,           -- 전송된 지출건명 (건명(팀A,팀B,...))
  program_name    text,                    -- 구분/프로그램
  wemeet_row_indexes integer[] not null,   -- 집행현황 시트의 행 번호 배열
  expenditure_row_index integer,           -- 집행내역 시트의 행 번호
  sent_at         timestamptz default now(),
  sent_by         text                     -- 전송자 이메일
);

-- RLS: 서비스 롤로 접근 (앱에서 직접 제어)
alter table public.wemeet_send_batches enable row level security;
