# Settings Hub, Member Invites, Billing, Credits, and BYOK PRD

## 목적

- 헤더 우측 유저 메뉴를 사이드바 하단 계정 카드로 재구성한다.
- 설정 워크스페이스에서 언어, 멤버 초대, 구독, 크래딧, BYOK를 한 곳에서 관리한다.
- `platform-api` 기준 멤버 초대 계약을 제품/BFF에 반영한다.
- 결제, 크래딧, BYOK 정책은 제품 상수가 아니라 플랫폼 계약과 서버 카탈로그 기준으로 관리한다.

## 포함 범위

- 사이드바 하단 계정 카드
  - 현재 로그인 이메일 노출
  - 위로 열리는 메뉴
  - `설정`, `로그아웃` 액션
- 설정 라우트
  - `/settings/general`
  - `/settings/members`
  - `/settings/subscription`
  - `/settings/credits`
  - `/settings/api-keys`
- 멤버 초대
  - `GET /tenants/{tenantId}/members`
  - `POST /tenants/{tenantId}/invites`
  - `POST /tenant-invites/{token}/accept`
  - 수락 후 `GET /platform/me` 재조회
- 구독/결제 UI
  - Free / Business / Enterprise 플랜 렌더링
  - Business는 플랫폼이 만든 Stripe Checkout 세션 URL로 리다이렉트
  - 고객 포털도 플랫폼 세션 URL로 리다이렉트
- 크래딧/BYOK UI
  - 잔액, 차감 정책, 최근 변동, 충전 CTA
  - BYOK API 키 CRUD UI
  - AI 생성 전 credit authorization, 성공 시 settle, 실패 시 release
- 신규 기능 플래그
  - `SETTINGS_V2_ENABLED`
  - `BILLING_UI_ENABLED`
  - `CREDITS_ENFORCEMENT_ENABLED`
  - `BYOK_UI_ENABLED`

## 제외 범위

- invite 메일 발송, resend, revoke, delivery 조회
- 제품이 직접 Stripe secret key를 보유하는 결제 구현
- BYOK 값을 평문으로 저장하거나 재노출하는 구현
- 플랫폼 없는 상태에서의 장기 billing/credits source-of-truth 결정

## 핵심 정책

### 계정 카드와 설정

- 계정 카드는 `/api/auth/session` 기준으로 이메일과 이름을 표시한다.
- `/settings` 경로에서는 기존 앱 사이드바 메뉴 대신 설정 섹션 메뉴를 같은 위치에 노출한다.
- locale source-of-truth는 `ps_locale` 쿠키다.
- `ko`, `en`, `ja` locale은 설정 화면뿐 아니라 공통 셸과 주요 업무 화면에도 같은 기준으로 반영한다.

### 멤버 초대

- 제품/BFF는 `platform-api` 실제 경로 `/tenants/...`, `/tenant-invites/...`를 그대로 사용한다.
- 제품은 invite 생성 응답의 `inviteToken`으로 canonical 링크 `/tenant-invites?token={url-encoded inviteToken}`를 조합한다.
- 기존 `/tenant-invites/{token}` 형식 링크는 rewrite 또는 redirect로 호환 유지할 수 있다.
- `inviteToken`은 MVP 편의용 응답으로 간주하며 장기 고정 계약으로 취급하지 않는다.
- 기본 `expiresInDays`는 `7`로 고정하고, 현재 범위에서 관리자 입력으로 노출하지 않는다.

### 구독/결제

- 플랜, 가격, 포함 크래딧은 서버 카탈로그를 우선한다.
- Business 셀프서브 결제는 Stripe test mode Checkout을 사용한다.
- Stripe secret, webhook secret, 운영 결제 키는 제품 저장소에 두지 않는다.
- 제품은 플랫폼이 돌려준 Checkout / Portal URL로만 리다이렉트한다.
- 운영 환경의 설정 사이드바에서는 `dev001@evriz.co.kr`부터 `dev999@evriz.co.kr`까지의 계정에만 `구독` 메뉴를 노출한다.

### 크래딧/BYOK

- 차감 정책 기준:
  - 템플릿 AI 생성 `standard`: 2
  - 템플릿 AI 생성 `experience`: 0
  - 훈련 안내 페이지 AI 생성 `standard`: 1
- 크래딧이 0이고 활성 BYOK가 없으면 AI 생성은 차단한다.
- `체험하기` 흐름의 템플릿 AI 생성만 무료 예외다.
- 현재 단계에서는 제품이 tenant별 BYOK를 암호화 저장하고 CRUD를 직접 처리한다.
- 제품은 마스킹된 메타데이터만 조회/표시하고 raw 키는 재노출하지 않는다.
- route 계약은 추후 플랫폼 중앙관리로 되돌릴 수 있도록 tenant-scoped BFF 형태를 유지한다.

## 제품 라우트와 BFF

### 제품 라우트

- `/settings`
- `/settings/general`
- `/settings/members`
- `/settings/subscription`
- `/settings/credits`
- `/settings/api-keys`
- `/tenant-invites?token=...`
- legacy alias: `/tenant-invites/{token}`

### 제품 BFF

- `GET /api/platform/tenants/:tenantId/members`
- `POST /api/platform/tenants/:tenantId/invites`
- `POST /api/platform/tenant-invites/:token/accept`
- `GET /api/platform/billing/catalog`
- `GET /api/platform/tenants/:tenantId/billing/subscriptions/PHISHSENSE`
- `POST /api/platform/tenants/:tenantId/billing/checkout-sessions`
- `POST /api/platform/tenants/:tenantId/billing/portal-sessions`
- `GET /api/platform/tenants/:tenantId/credits`
- `POST /api/platform/tenants/:tenantId/credits/authorizations`
- `POST /api/platform/tenants/:tenantId/credits/authorizations/:id/settle`
- `POST /api/platform/tenants/:tenantId/credits/authorizations/:id/release`
- `GET/POST/PATCH/DELETE /api/platform/tenants/:tenantId/ai-keys[...]`

## 권한

- `일반`: 로그인 사용자
- `멤버`: tenant member 조회 가능, `OWNER/ADMIN`만 초대 가능
- `구독`: `OWNER`
- `크래딧`: `OWNER/ADMIN`
- `API 키`: `OWNER`

## 구현 메모

- tenant-scoped BFF는 기존 ready tenant 검증과 membership 검증을 재사용한다.
- 플랫폼 billing/credits API가 준비되지 않은 개발 환경에서는 서버 fallback 카탈로그를 사용한다.
- billing v1 checkout/portal POST는 tenant `OWNER`만 허용하고 `Idempotency-Key`를 필수로 전달한다.
- billing v1 redirect는 raw URL 대신 `appKey=PHISHSENSE`와 route key allowlist 조합을 사용한다.
- Stripe 복귀 후 제품 접근 제어는 `/platform/me`와 로컬 entitlement projection으로 판단하고, billing subscription 조회는 billing/settings 표시용으로만 사용한다.
- 현재 AI 실행 엔진은 기존 서버 기본 키 fallback을 유지한다.
- 제품은 `AI_KEY_SECRET` 기반 암호화 저장을 사용하고, 추후 플랫폼 BYOK 중앙관리 또는 provider proxy로 전환 가능하도록 경계를 유지한다.

## 검증 기준

- 사이드바 최하단 계정 카드가 현재 로그인 이메일을 표시한다.
- 멤버 화면에서 목록 조회, 초대 링크 생성, 링크 복사가 가능하다.
- 초대 수락 후 `GET /platform/me`가 재조회되고 onboarding/ready 분기가 갱신된다.
- 구독 화면은 서버 카탈로그를 렌더링하고 route key 기반 Stripe Checkout/Portal로 이동한다.
- Stripe 복귀 후 `GET /platform/me`와 `GET /tenants/{tenantId}/billing/subscriptions/PHISHSENSE` 재조회 결과로 상태를 갱신한다.
- 크래딧 enforcement가 켜지면 usage context에 따라 차감 정책이 달라진다.
