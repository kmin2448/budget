-- 집행내역 고유 ID 지원: 행번호 대신 UUID로 파일·병합 매칭
ALTER TABLE expenditure_files ADD COLUMN IF NOT EXISTS row_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_expenditure_files_row_uuid ON expenditure_files(row_uuid);

ALTER TABLE expenditure_merges ADD COLUMN IF NOT EXISTS row_uuid TEXT;
CREATE INDEX IF NOT EXISTS idx_expenditure_merges_row_uuid ON expenditure_merges(row_uuid);
