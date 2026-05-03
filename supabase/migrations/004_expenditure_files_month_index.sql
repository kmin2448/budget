-- 인건비 월별 청구서 지원: expenditure_files에 month_index 컬럼 추가
alter table expenditure_files
  add column if not exists month_index integer;

-- (sheet_name, row_index, month_index) 복합 인덱스 — 월별 조회 최적화
create index if not exists idx_expenditure_files_sheet_row_month
  on expenditure_files(sheet_name, row_index, month_index);
