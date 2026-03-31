# 플랫폼 연동 계약

이 문서는 PhishSense가 `platform-api` 및 EVRIZ Auth와 연동할 때 유지해야 하는 공식 계약을 정리합니다.

## 연동 범위

- 제품 진입 전 tenant/entitlement 컨텍스트 조회
- 첫 tenant 생성 중계
- entitlement callback 수신과 로컬 동기화

## Outbound: `platform-api` 호출

### `GET /platform/me`

- 목적: 로그인 사용자의 tenant와 제품 entitlement 상태 조회
- 인증: `Authorization: Bearer {access_token}`
- 선택 헤더: `X-Platform-Tenant-Id`
- 사용 위치:
  - `/api/auth/platform-context`
  - onboarding 이후 재평가
  - 다중 tenant 선택 반영

### `POST /tenants`

- 목적: 첫 회사/조직 생성
- 인증: `Authorization: Bearer {access_token}`
- 요청 본문:

```json
{
  "name": "Acme Security"
}
```

- PhishSense는 브라우저가 직접 호출하지 않고 `POST /api/platform/tenants` BFF로 중계합니다.

## Inbound: entitlement callback

### `POST /webhooks/platform/entitlements`

- 목적: tenant별 제품 entitlement 상태를 로컬 DB에 반영
- 처리 조건:
  - `X-Platform-Event-Id` 헤더 필수
  - `X-Platform-Timestamp`, `X-Platform-Key-Id`, `X-Platform-Signature` 검증
  - 서명 원문은 `<timestamp>\n<body>`
  - `eventId` 기준 멱등 처리

### 헤더 규칙

- `X-Platform-Event-Id: <uuid>`
- `X-Platform-Timestamp: <epoch-seconds>`
- `X-Platform-Key-Id: <key-id>`
- `X-Platform-Signature: sha256=<hex-hmac>`

### payload 핵심 필드

```json
{
  "eventId": "0cb94b55-9937-43c5-aeeb-a39c9c9252d1",
  "tenantId": "tenant-001",
  "productId": "PHISHSENSE",
  "entitlement": {
    "planCode": "BUSINESS",
    "status": "ACTIVE",
    "seatLimit": 50,
    "expiresAt": "2026-04-09T00:00:00Z",
    "sourceType": "MANUAL"
  }
}
```

### 로컬 반영 규칙

- `productId !== "PHISHSENSE"` 이면 무시합니다.
- `platform_entitlement_events`에 `eventId`를 먼저 기록해 중복 수신을 막습니다.
- `platform_entitlements`를 `(tenant_id, product_id)` 기준으로 upsert 합니다.
- 반영 후 tenant 기준 플랫폼 컨텍스트 캐시를 무효화합니다.

## 제품 내부 BFF 계약

### `GET /api/auth/platform-context`

- 목적: 세션, local entitlement, `/platform/me` 결과를 조합해 현재 접근 상태를 판정
- 주요 응답 필드:
  - `authenticated`
  - `status`
  - `hasAccess`
  - `onboardingRequired`
  - `currentTenantId`
  - `localEntitlement`

### `POST /api/platform/tenants`

- 목적: 로그인 세션을 사용해 tenant 생성 요청을 중계
- 성공 시:
  - 세션의 `tenantId` 갱신
  - 플랫폼 컨텍스트 재조회
  - `201 Created`와 함께 `createdTenant` 및 최신 컨텍스트 반환
- 현재 단계에서는 업무 데이터 provisioning 자동화를 함께 수행하지 않아도 됩니다.
- 따라서 새 tenant는 비어 있는 업무 상태로 시작할 수 있습니다.

## 실패 처리 기준

- `/platform/me`가 `401`이면 제품은 `platform_unauthorized` 상태로 간주합니다.
- `/platform/me`가 `403`이면 tenant 선택 필요 상태로 간주합니다.
- 플랫폼이 일시적으로 실패하면 `platform_unavailable` 상태를 반환합니다.
- callback은 `2xx`만 성공으로 간주하며, 비정상 응답은 재시도 대상입니다.
