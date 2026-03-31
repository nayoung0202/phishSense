# Settings Hub, Member Invites, Billing, and Credits PRD

## 목적

- 헤더 우측 유저 메뉴를 사이드바 하단 계정 카드로 재구성한다.
- 설정 워크스페이스에서 언어, 멤버 초대, 구독, 크래딧을 한 곳에서 관리한다.
- `platform-api` 기준 멤버 초대 계약을 제품/BFF에 반영한다.
- 결제와 크레딧 정책은 제품 상수가 아니라 플랫폼 계약과 서버 카탈로그 기준으로 관리한다.

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
  - 잔액, 포함 크레딧, 예약 차감, 차감 정책, 최근 변동, 충전 CTA
  - AI 생성 전 credit authorization, 성공 시 settle, 실패 시 release
  - 크레딧 부족 시 바로 결제 기반 충전 동선
- 신규 기능 플래그
  - `SETTINGS_V2_ENABLED`
  - `BILLING_UI_ENABLED`
  - `CREDITS_ENFORCEMENT_ENABLED`

## 제외 범위

- invite 메일 발송, resend, revoke, delivery 조회
- 제품이 직접 Stripe secret key를 보유하는 결제 구현
- BYOK 기능 제공
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

- 플랜과 가격은 서버 카탈로그를 우선한다.
- Business 셀프서브 결제는 Stripe test mode Checkout을 사용한다.
- Stripe secret, webhook secret, 운영 결제 키는 제품 저장소에 두지 않는다.
- 제품은 플랫폼이 돌려준 Checkout / Portal URL로만 리다이렉트한다.
- 추가 크레딧 충전은 바로 결제 기반으로 유도하고, 결제 세션은 플랫폼 계약을 기준으로 생성한다.
- 운영 환경의 설정 사이드바에서는 `dev001@evriz.co.kr`부터 `dev999@evriz.co.kr`까지의 계정에만 `구독` 메뉴를 노출한다.

### 크레딧

- 차감 정책 기준:
  - AI 템플릿 생성: 2
  - AI 훈련 안내 페이지 생성: 1
- tenant 생성 후 entitlement plan이 확정되면 초기 포함 크레딧을 자동 부여한다.
  - `FREE`: 3
  - `BUSINESS`: 10
  - `ENTERPRISE`: 별도 계약
- `체험하기` 흐름을 포함한 모든 AI 생성은 동일한 차감 정책을 적용한다.
- 크레딧이 부족하면 AI 생성은 차단하고 바로 결제 기반 충전 CTA를 노출한다.
- 현재 범위에서는 BYOK를 제공하지 않는다.
- route 계약은 추후 플랫폼 중앙관리 또는 확장 정책으로 전환할 수 있도록 tenant-scoped BFF 형태를 유지한다.

## 제품 라우트와 BFF

### 제품 라우트

- `/settings`
- `/settings/general`
- `/settings/members`
- `/settings/subscription`
- `/settings/credits`
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

## 권한

- `일반`: 로그인 사용자
- `멤버`: tenant member 조회 가능, `OWNER/ADMIN`만 초대 가능
- `구독`: `OWNER`
- `크레딧`: `OWNER/ADMIN`

## 구현 메모

- tenant-scoped BFF는 기존 ready tenant 검증과 membership 검증을 재사용한다.
- 플랫폼 billing/credits API가 준비되지 않은 개발 환경에서는 서버 fallback 카탈로그를 사용한다.
- billing v1 checkout/portal POST는 tenant `OWNER`만 허용하고 `Idempotency-Key`를 필수로 전달한다.
- billing v1 redirect는 raw URL 대신 `appKey=PHISHSENSE`와 route key allowlist 조합을 사용한다.
- Stripe 복귀 후 제품 접근 제어는 `/platform/me`와 로컬 entitlement projection으로 판단하고, billing subscription 조회는 billing/settings 표시용으로만 사용한다.
- 초기 포함 크레딧 부여와 충전 결제 세션 생성은 플랫폼 계약을 기준으로 한다.
- 현재 AI 실행 엔진은 서버 관리형 기본 키를 사용하고, 차감 여부는 플랫폼 credits flow가 판단한다.

## 검증 기준

- 사이드바 최하단 계정 카드가 현재 로그인 이메일을 표시한다.
- 멤버 화면에서 목록 조회, 초대 링크 생성, 링크 복사가 가능하다.
- 초대 수락 후 `GET /platform/me`가 재조회되고 onboarding/ready 분기가 갱신된다.
- 구독 화면은 서버 카탈로그를 렌더링하고 route key 기반 Stripe Checkout/Portal로 이동한다.
- Stripe 복귀 후 `GET /platform/me`와 `GET /tenants/{tenantId}/billing/subscriptions/PHISHSENSE` 재조회 결과로 상태를 갱신한다.
- 크레딧 화면은 잔액, 포함 크레딧, 예약 차감, 차감 정책, 최근 변동, 충전 CTA를 함께 제공한다.
- 크레딧이 부족하면 AI 생성이 차단되고 바로 결제 충전 동선으로 이동할 수 있다.
