# 시스템 개요

## 아키텍처 요약

PhishSense는 Next.js App Router 기반의 단일 저장소 애플리케이션입니다. 페이지 렌더링, BFF API, 인증 처리, 플랫폼 연동, 발송 워커가 하나의 코드베이스에서 관리됩니다.

## 기술 스택

| 영역 | 구성 |
| --- | --- |
| 웹 애플리케이션 | Next.js 15, React 18, TypeScript |
| UI | Tailwind CSS, Radix UI, TanStack Query |
| 서버 로직 | Next.js Route Handler, Node.js 런타임 |
| 데이터 계층 | PostgreSQL 16, Drizzle ORM, Zod |
| 발송/보고서 | Nodemailer, ExcelJS |
| 테스트 | Vitest, React Testing Library, MSW |

## 런타임 구성요소

### 1. 웹 애플리케이션

- `src/app/`이 페이지와 Route Handler를 함께 가집니다.
- `src/features/`는 도메인 화면 조합 로직을 관리합니다.
- `src/components/`는 재사용 UI와 에디터, 관리자 폼을 제공합니다.

### 2. 서버 도메인 계층

- `src/server/auth/`는 OIDC, 세션, 쿠키, 리다이렉트 정책을 담당합니다.
- `src/server/platform/`은 `platform-api` 클라이언트, callback 검증, 컨텍스트 해석을 담당합니다.
- `src/server/dao/`와 `src/server/services/`는 DB 접근과 비즈니스 로직을 분리합니다.
- `shared/`는 프론트/백엔드가 공유하는 스키마와 타입을 제공합니다.

### 3. 데이터 저장소

- 애플리케이션의 공식 저장소는 PostgreSQL입니다.
- 공용 테이블은 `shared/schema.ts`, 서버 전용 테이블은 `src/server/db/schema.ts`에 정의됩니다.
- 세션, 플랫폼 entitlement, 발송 설정 등 운영 상태도 DB에 저장합니다.

### 4. 비동기 워커

- `src/server/worker/send-worker.ts`는 `send_jobs` 큐를 polling 하며 메일 발송을 처리합니다.
- 웹 앱과 별도로 실행해야 하며, DB 환경 변수를 공유합니다.
- 실발송은 tenant별 `smtp_accounts`의 활성 발송 설정을 우선 사용하고, 활성 tenant 발송 설정이 없을 때만 `.env` SMTP 설정으로 fallback 합니다.
- tenant 발송 설정은 SMTP 전송 계정 정보와 허용 발신 도메인 정책을 관리하고, 실제 발신자 이름/이메일은 프로젝트 설정을 우선 사용합니다.

### 5. 외부 시스템

- EVRIZ OIDC: 로그인, 토큰 발급, 사용자 식별
- `platform-api`: tenant 생성, `/platform/me` 조회, entitlement callback 발행
- SMTP 서버: 실제 메일 발송

## 디렉터리 기준 구조

```text
src/
  app/          페이지와 API Route Handler
  features/     도메인 화면 조합
  components/   공통 UI와 관리자 컴포넌트
  hooks/        재사용 훅
  lib/          프론트 공용 유틸리티
  server/
    auth/       인증/세션
    dao/        DB 접근
    platform/   외부 플랫폼 연동
    services/   도메인 서비스
    worker/     비동기 워커
shared/         공용 스키마와 타입
```

## 핵심 요청 흐름

### 인증과 접근

1. 사용자가 보호된 페이지에 접근합니다.
2. `middleware.ts`가 세션 쿠키와 접근 수준을 검사합니다.
3. 세션이 없으면 로그인으로 리다이렉트하거나 `401`을 반환합니다.
4. 세션이 있으면 `/api/auth/platform-context`가 로컬 entitlement와 `/platform/me`를 조합해 접근 가능 여부를 판정합니다.

### 온보딩

1. tenant가 없거나 entitlement가 비활성인 사용자는 `/onboarding`으로 이동합니다.
2. 제품은 `POST /api/platform/tenants`로 tenant 생성을 중계합니다.
3. 세션 tenant를 갱신하고 플랫폼 컨텍스트를 재조회합니다.

### 발송

1. 프로젝트에서 발송 작업이 생성되면 `send_jobs`에 큐가 쌓입니다.
2. 발송 워커가 작업을 선점합니다.
3. 템플릿 검증, 추적 토큰 생성, SMTP 전송을 수행합니다.
4. 메일 오픈은 공개 오픈 픽셀 라우트, 링크 클릭은 피싱 랜딩 라우트, 제출은 훈련 안내/제출 라우트를 통해 추적됩니다.
5. 결과는 `project_targets`, `send_jobs`, `projects` 집계에 반영됩니다.

### 플랫폼 entitlement 동기화

1. `platform-api`가 `POST /webhooks/platform/entitlements`로 callback을 보냅니다.
2. 서버는 HMAC 서명과 timestamp를 검증합니다.
3. `eventId` 기준 중복 여부를 확인한 뒤 로컬 entitlement 테이블을 upsert 합니다.
4. 관련 플랫폼 컨텍스트 캐시를 무효화합니다.
