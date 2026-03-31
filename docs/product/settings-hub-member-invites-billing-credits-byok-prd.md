# Settings Hub, Member Invites, Billing, and Credits PRD

## 목적

- 헤더 우측 유저 메뉴를 사이드바 하단 계정 카드로 재구성한다.
- 설정 워크스페이스에서 언어, 멤버 초대, 구독, 크레딧을 한 곳에서 관리한다.
- `platform-api` 기준 멤버 초대 계약을 제품/BFF에 반영한다.
- 구독은 플랫폼 계약을 따르되, AI 크레딧은 제품 서비스 내부 `account / ledger` 기준으로 관리한다.

## 포함 범위

- 사이드바 하단 계정 카드
  - 현재 로그인 이메일 노출
  - 위로 열리는 메뉴
  - `설정`, `로그아웃` 액션
- 설정 라우트
  - `/settings/general`
  - `/settings/domain`
  - `/settings/members`
  - `/settings/subscription`
  - `/settings/credits`
- 멤버 초대
  - `GET /tenants/{tenantId}/members`
  - `POST /tenants/{tenantId}/invites`
  - `POST /tenant-invites/{token}/accept`
  - 수락 후 `GET /platform/me` 재조회
- 구독/결제 UI
  - Free / Business / Enterprise 플랜 렌더링
  - Business는 플랫폼이 만든 Stripe Checkout 세션 URL로 리다이렉트
  - 고객 포털도 플랫폼 세션 URL로 리다이렉트
- 크레딧 UI
  - 잔액, 차감 정책, 최근 변동, 충전 CTA
  - AI 생성은 후보 탐색만 수행하고, 선택한 후보 반영 시 차감
  - 크레딧 부족 시 후보 반영 대신 바로 recharge URL 기반 충전 동선
- 신규 기능 플래그
  - `SETTINGS_V2_ENABLED`
  - `BILLING_UI_ENABLED`
  - `CREDITS_ENFORCEMENT_ENABLED`

## 제외 범위

- invite 메일 발송, resend, revoke, delivery 조회
- 제품이 직접 Stripe secret key를 보유하는 결제 구현
- BYOK 기능 제공
- 주기별 크레딧 리셋 정책 자동화

## 핵심 정책

### 계정 카드와 설정

- 계정 카드는 `/api/auth/session` 기준으로 이메일과 이름을 표시한다.
- `/settings` 경로에서는 기존 앱 사이드바 메뉴 대신 설정 섹션 메뉴를 같은 위치에 노출한다.
- `설정 > 도메인`은 tenant 공개 링크용 발급 도메인을 관리하며, `OWNER/ADMIN`만 볼 수 있고 실제 발급/변경은 `OWNER`만 수행한다.
- locale source-of-truth는 `ps_locale` 쿠키다.
- `ko`, `en`, `ja` locale은 설정 화면뿐 아니라 공통 셸과 주요 업무 화면에도 같은 기준으로 반영한다.

### 멤버 초대

- 제품/BFF는 `platform-api` 실제 경로 `/tenants/...`, `/tenant-invites/...`를 그대로 사용한다.
- 제품은 invite 생성 응답의 `inviteToken`으로 canonical 링크 `/tenant-invites?token={url-encoded inviteToken}`를 조합한다.
- 기존 `/tenant-invites/{token}` 형식 링크는 rewrite 또는 redirect로 호환 유지할 수 있다.
- `inviteToken`은 MVP 편의용 응답으로 간주하며 장기 고정 계약으로 취급하지 않는다.
- 기본 `expiresInDays`는 `7`로 고정하고, 현재 범위에서 관리자 입력으로 노출하지 않는다.

### 구독/결제

- 플랜과 가격은 서버 카탈로그를 우선한다.
- Business 셀프서브 결제는 Stripe test mode Checkout을 사용한다.
- Stripe secret, webhook secret, 운영 결제 키는 제품 저장소에 두지 않는다.
- 제품은 플랫폼이 돌려준 Checkout / Portal URL로만 리다이렉트한다.
- 추가 크레딧 충전은 제품이 제공하는 recharge URL로 유도하고, 이후 직접 결제 연동 또는 운영 결제 링크로 확장할 수 있다.
- 운영 환경의 설정 사이드바에서는 `dev001@evriz.co.kr`부터 `dev999@evriz.co.kr`까지의 계정에만 `구독` 메뉴를 노출한다.

### 크레딧

- 차감 정책 기준:
  - AI 템플릿 생성: 2
  - AI 훈련 안내 페이지 생성: 1
- tenant entitlement plan 기준으로 서비스가 초기 포함 크레딧을 자동 부여한다.
  - `FREE`: 3
  - `BUSINESS`: 10
  - `ENTERPRISE`: 별도 계약
- `체험하기` 흐름을 포함한 모든 AI 생성은 동일한 차감 정책을 적용한다.
- 크레딧은 `tenant_credit_accounts`와 `tenant_credit_ledger`를 기준으로 관리한다.
- 최근 변동은 최소 `지급`, `차감`, `충전`, `복구` 이력을 제공한다.
- AI 생성은 후보 탐색 단계로 두고, 선택한 후보를 템플릿 또는 훈련 안내 페이지에 반영할 때 차감한다.
- 크레딧이 부족하면 후보 반영은 차단하고 바로 recharge CTA를 노출한다.
- 현재 범위에서는 BYOK를 제공하지 않는다.
- route 계약은 tenant-scoped BFF 형태를 유지하되, 내부 구현은 제품 서비스의 로컬 credit service를 사용한다.

### 도메인

- tenant 공개 링크는 제품 로컬 DB의 발급 도메인 1개를 우선 사용한다.
- 발급 도메인 형식은 `slug.TENANT_DOMAIN_BASE`이며 slug는 one-label 규칙만 허용한다.
- 현재 범위의 CNAME 안내는 고객사 DNS 운영 참고용이며, 커스텀 도메인 자동 검증/SSL 발급은 제외한다.

## 제품 라우트와 BFF

### 제품 라우트

- `/settings`
- `/settings/general`
- `/settings/domain`
- `/settings/members`
- `/settings/subscription`
- `/settings/credits`
- `/tenant-invites?token=...`
- legacy alias: `/tenant-invites/{token}`

### 제품 BFF

- `GET /api/settings/domain`
- `POST /api/settings/domain`
- `GET /api/platform/tenants/:tenantId/members`
- `POST /api/platform/tenants/:tenantId/invites`
- `POST /api/platform/tenant-invites/:token/accept`
- `GET /api/platform/billing/catalog`
- `GET /api/platform/tenants/:tenantId/billing/subscriptions/PHISHSENSE`
- `POST /api/platform/tenants/:tenantId/billing/checkout-sessions`
- `POST /api/platform/tenants/:tenantId/billing/portal-sessions`
- `GET /api/platform/tenants/:tenantId/credits`
- `POST /api/templates/ai-apply`
- `POST /api/training-pages/ai-apply`

## 권한

- `일반`: 로그인 사용자
- `도메인`: `OWNER/ADMIN` 조회, `OWNER` 변경
- `멤버`: tenant member 조회 가능, `OWNER/ADMIN`만 초대 가능
- `구독`: `OWNER`
- `크레딧`: `OWNER/ADMIN`

## 구현 메모

- tenant-scoped BFF는 기존 ready tenant 검증과 membership 검증을 재사용한다.
- billing catalog가 준비되지 않은 개발 환경에서는 서버 fallback 카탈로그를 사용한다.
- billing v1 checkout/portal POST는 tenant `OWNER`만 허용하고 `Idempotency-Key`를 필수로 전달한다.
- billing v1 redirect는 raw URL 대신 `appKey=PHISHSENSE`와 route key allowlist 조합을 사용한다.
- Stripe 복귀 후 제품 접근 제어는 `/platform/me`와 로컬 entitlement projection으로 판단하고, billing subscription 조회는 billing/settings 표시용으로만 사용한다.
- 초기 포함 크레딧은 로컬 entitlement plan 기준으로 제품 서비스가 부여한다.
- 최근 변동은 로컬 credit ledger에서 조회한다.
- 현재 AI 실행 엔진은 서버 관리형 기본 키를 사용하고, 차감 여부는 제품 credit service가 판단한다.

## 검증 기준

- 사이드바 최하단 계정 카드가 현재 로그인 이메일을 표시한다.
- 멤버 화면에서 목록 조회, 초대 링크 생성, 링크 복사가 가능하다.
- 초대 수락 후 `GET /platform/me`가 재조회되고 onboarding/ready 분기가 갱신된다.
- 구독 화면은 서버 카탈로그를 렌더링하고 route key 기반 Stripe Checkout/Portal로 이동한다.
- Stripe 복귀 후 `GET /platform/me`와 `GET /tenants/{tenantId}/billing/subscriptions/PHISHSENSE` 재조회 결과로 상태를 갱신한다.
- 크레딧 화면은 잔액, 차감 정책, 최근 변동, 충전 CTA를 함께 제공한다.
- 크레딧이 부족하면 AI 생성이 차단되고 바로 결제 충전 동선으로 이동할 수 있다.
