# COSS 예산관리 시스템

KNU SDU COSS 2026년 본예산의 **프로그램별 예산 편성·집행·변경**을 통합 관리하는 웹 애플리케이션입니다.

---

## 목적

- 비목별 집행내역 입력 및 증빙 파일(PDF) 관리
- Google Sheets 기반 예산표 실시간 조회·수정
- 선지원금·산단카드 내역 관리
- 역할(Role) 기반 접근 제어 및 권한 관리

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router) + TypeScript |
| 인증 | NextAuth.js v5 + Google OAuth 2.0 |
| 예산 데이터 | Google Sheets API v4 (Named Range) |
| 파일 저장 | Google Drive API v3 (사용자 OAuth 토큰) |
| DB | Supabase (PostgreSQL + RLS) |
| UI | Tailwind CSS + shadcn/ui |
| 상태 관리 | TanStack Query v5 |
| PDF 생성 | jsPDF + html2canvas |

---

## 설치 방법

```bash
# 1. 저장소 클론
git clone https://github.com/kmin2448/budget.git
cd budget/coss-budget

# 2. 의존성 설치
npm install

# 3. 환경 변수 설정 (아래 섹션 참고)
cp .env.local.example .env.local
# .env.local 파일을 열어 값 채우기
```

---

## 실행 방법

```bash
# 개발 서버
npm run dev
# → http://localhost:3000 (포트 사용 중이면 3001)

# 프로덕션 빌드
npm run build
npm start

# Git 커밋 + 푸시 (Vercel 자동 배포 트리거)
npm run push

# 타입 검사
npm run type-check

# 테스트
npm run test
```

---

## 주요 기능

### 1. 대시보드
- 프로그램별 예산계획 / 집행완료 / 집행예정 요약 카드
- 비목별 집행률 테이블
- 프로그램 순서 드래그 변경

### 2. 비목별 집행내역
- 9개 비목(인건비, 장학금, 교육연구프로그램개발운영비 등) 탭 전환
- 집행 건명 입력 / 월별 그룹화 / 드래그로 월 이동
- Google Drive에 PDF 증빙 업로드 / 삭제 / 바로보기

### 3. 예산관리
- Google Sheets Named Range 기반 예산표 조회
- 증감액 입력 및 일괄 저장
- 변경 이력 관리
- 예산표 PDF 출력

### 4. 선지원금
- 선지원금 지급·정산 내역 관리

### 5. 산단카드
- 카드 사용 내역 입력 및 조회

### 6. 권한관리 (슈퍼어드민 전용)
- 사용자 초대(이메일) / 역할 변경 / 삭제
- 어드민에게 비목별 세부 편집 권한 부여
- 엑셀로 사용자 일괄 등록 / 다운로드

---

## 권한 체계

| 역할 | 설명 |
|------|------|
| `super_admin` | 모든 기능 + 권한관리 페이지 접근 |
| `admin` | 부여된 세부 편집 권한 범위 내 쓰기 |
| `viewer` | 읽기 전용 |

세부 편집 권한 목록: 대시보드 / 집행내역 / 예산관리 / 선지원금 / 산단카드

---

## 필수 환경 변수 (`.env.local`)

> **절대 Git에 커밋하지 마세요.**

```env
# Google OAuth (GCP 콘솔 → 사용자 인증 정보)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Google Sheets (스프레드시트 URL의 /d/{ID}/ 부분)
GOOGLE_SHEETS_ID=

# Google 서비스 계정 (Sheets 읽기/쓰기용)
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=

# Google Drive 루트 폴더 ID (선택 — 미설정 시 내 드라이브 루트)
GOOGLE_DRIVE_ROOT_FOLDER_ID=

# NextAuth
NEXTAUTH_URL=http://localhost:3000   # 배포 시 실제 도메인으로 변경
NEXTAUTH_SECRET=                     # openssl rand -base64 32 로 생성

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

### 환경 변수 발급 위치

| 변수 | 위치 |
|------|------|
| `GOOGLE_CLIENT_ID/SECRET` | [GCP 콘솔](https://console.cloud.google.com) → API 및 서비스 → 사용자 인증 정보 → OAuth 2.0 클라이언트 |
| `GOOGLE_SHEETS_ID` | 스프레드시트 주소창의 `/d/` 와 `/edit` 사이 문자열 |
| `GOOGLE_SERVICE_ACCOUNT_*` | GCP → 서비스 계정 → 키 발급 (JSON) |
| `SUPABASE_*` | [Supabase 대시보드](https://supabase.com) → Project Settings → API |
| `NEXTAUTH_SECRET` | 터미널: `openssl rand -base64 32` |

---

## 배포 (Vercel)

1. Vercel 프로젝트에서 **Root Directory**를 `coss-budget`으로 설정
2. Environment Variables에 `.env.local` 값 모두 등록
3. `NEXTAUTH_URL`을 배포된 실제 도메인으로 변경
4. GCP OAuth 승인된 리디렉션 URI에 `https://{도메인}/api/auth/callback/google` 추가
5. `npm run push` 실행 → Vercel 자동 배포 트리거

---

## 프로젝트 구조 요약

```
coss-budget/
├── app/
│   ├── (auth)/login/          # 로그인 페이지
│   ├── (dashboard)/           # 메인 대시보드·각 기능 페이지
│   └── api/                   # Route Handler (서버 API)
│       ├── auth/              # NextAuth 엔드포인트
│       ├── sheets/            # Google Sheets 읽기/쓰기
│       ├── drive/             # Google Drive 업로드/삭제
│       ├── budget/            # 예산 조회·수정·이력
│       ├── admin/             # 사용자·권한 관리
│       └── card/              # 산단카드 내역
├── components/                # React 컴포넌트
├── lib/                       # 유틸리티·클라이언트 초기화
├── hooks/                     # TanStack Query 커스텀 훅
├── types/                     # TypeScript 타입 정의
└── constants/sheets.ts        # Named Range 상수
```
