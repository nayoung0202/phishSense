# Product Tenant Onboarding Guide

## 목적

- 제품/BFF가 `platform-api`의 tenant 관련 API를 연동해 onboarding, tenant 선택, 멤버십 관리 흐름을 구현할 수 있게 한다.
- entitlement callback 문서와 분리해 사용자 주도 tenant 흐름만 설명한다.

## 먼저 읽을 문서

- `docs/api/platform-me.md`
- `docs/api/entitlement-policy.md`
- `docs/api/tenant-api.md`
- `docs/architecture/platform_api_handoff.md`
- 멤버 초대 기능만 따로 구현하는 경우: `docs/integration/member-invite-handoff.md`
- 설정/구독/크래딧/BYOK 범위: `docs/product/settings-hub-member-invites-billing-credits-byok-prd.md`

## 인증 규칙

- 모든 tenant API는 `Authorization: Bearer {access_token}` 헤더를 사용한다.
- `id_token`이 아니라 `auth`가 발급한 사용자 `access_token`을 사용한다.
- `platform-api`는 `iss`, `exp`, `aud contains expectedAudience`를 검증한다.
- expected audience는 `platform-api` base URL이다.
- `aud`, `iss`, 서명이 맞지 않으면 `401 Unauthorized`가 발생한다.

## 제품/BFF 기준 기본 흐름

1. 로그인 직후 `GET /platform/me` 호출
2. 응답의 `hasTenant`, `currentTenantId`, `tenants[]`를 기준으로 분기
3. 필요한 경우 tenant 생성 또는 tenant 선택 UI 진입
4. tenant가 확정되면 tenant 상세/멤버 API 호출

## `/platform/me` 분기 규칙

### tenant 없음

- `hasTenant == false`
- `tenants == []`
- `currentTenantId == null`
- 제품 처리:
  - onboarding 화면 노출
  - `POST /tenants` 호출로 첫 tenant 생성

### tenant 1개

- `hasTenant == true`
- `tenants.length == 1`
- `currentTenantId` 자동 채움
- 제품 처리:
  - 별도 selector 없이 현재 tenant 진입 가능

### tenant 여러 개

- `hasTenant == true`
- `tenants.length >= 2`
- `currentTenantId == null`일 수 있음
- 제품 처리:
  - tenant selector UI 제공
  - 선택한 tenant id를 로컬 상태에 저장
  - 필요 시 `X-Platform-Tenant-Id`와 함께 `GET /platform/me` 재조회

## 제품이 직접 연동할 API

### tenant 생성

- `POST /tenants`
- 권한: 인증 사용자
- 요청 예시:

```json
{
  "name": "Acme"
}
```

- 성공 응답: `201 Created`

```json
{
  "tenantId": "9f6d31d3-c0ea-4f08-ae16-1f4d64f1f7d8",
  "name": "Acme",
  "role": "OWNER"
}
```

- 사용 시점:
  - 첫 onboarding
  - 사용자가 새 조직을 추가로 만들고 싶을 때
- 제품 처리:
  - 성공 후 `/platform/me` 재조회 또는 생성 응답 기반 tenant 전환
  - 재조회 시 기본 `PHISHSENSE` entitlement `FREE + 5석`이 `products[]`에 보여야 한다.
  - product callback은 비동기로 오므로 `/platform/me` 즉시 반영과 product local projection 반영 시점은 다를 수 있다.

### tenant 조회

- `GET /tenants/{tenantId}`
- 권한: membership 필요
- 성공 응답: `200 OK`

```json
{
  "tenantId": "9f6d31d3-c0ea-4f08-ae16-1f4d64f1f7d8",
  "name": "Acme",
  "role": "ADMIN"
}
```

- 사용 시점:
  - 설정 화면
  - tenant 이름/내 role 표시

### tenant 수정

- `PATCH /tenants/{tenantId}`
- 권한: `OWNER`, `ADMIN`
- 성공 응답: `200 OK`

```json
{
  "tenantId": "9f6d31d3-c0ea-4f08-ae16-1f4d64f1f7d8",
  "name": "Acme Security",
  "role": "OWNER"
}
```

- 사용 시점:
  - 조직 이름 변경

### 멤버 목록 조회

- `GET /tenants/{tenantId}/members`
- 권한: membership 필요
- 성공 응답: `200 OK`

```json
[
  {
    "userId": "user-1",
    "role": "OWNER"
  },
  {
    "userId": "user-2",
    "role": "MEMBER"
  }
]
```

- 사용 시점:
  - 조직 멤버 관리 화면

### invite 생성

- `POST /tenants/{tenantId}/invites`
- 권한: `OWNER`, `ADMIN`
- 요청 예시:

```json
{
  "email": "member@acme.com",
  "role": "MEMBER",
  "expiresInDays": 7
}
```

- 성공 응답: `201 Created`

```json
{
  "inviteId": "8a6d5f93-4f89-4170-93ca-90c1edeb6b36",
  "inviteToken": "eJx8P5Y9P2WQ6rX8W0TnC9j0Y7P4cN3f",
  "expiresAt": "2026-03-17T00:00:00Z"
}
```

- 현재 응답 특징:
  - MVP 편의를 위해 raw `inviteToken`이 포함될 수 있다.
- 제품 주의:
  - 이 응답을 장기 공개 계약으로 가정하지 않는다.
  - 초대 메일 발송 책임은 별도 운영 절차 또는 후속 시스템일 수 있다.

### invite 수락

- `POST /tenant-invites/{token}/accept`
- 권한: 인증 사용자 + invite email과 현재 사용자 email 일치
- 성공 응답: `200 OK`, response body 없음
- 제품 처리:
  - 성공 후 `/platform/me` 재조회
  - `404` 또는 `409`이면 잘못된 token, 이메일 불일치, 만료, 중복 수락 가능성 처리

### 멤버 제거

- `DELETE /tenants/{tenantId}/members/{userId}`
- 권한: `OWNER`
- 성공 응답: `204 No Content`, response body 없음
- 주의:
  - 마지막 `OWNER` 제거 불가
  - 자기 자신 제거는 Phase 1에서 허용하지 않음

## 권장 제품 플로우

### 첫 로그인

1. `/platform/me` 호출
2. `hasTenant == false`면 tenant 생성 화면
3. `POST /tenants`
4. `/platform/me` 재조회
5. `products[]`에서 기본 `PHISHSENSE/FREE/5/ACTIVE` 확인
6. entitlement 상태 확인 후 제품 진입

### 다중 tenant 사용자

1. `/platform/me` 호출
2. `currentTenantId == null`이면 selector 화면
3. 선택한 tenant를 로컬 상태에 저장
4. 필요 시 `X-Platform-Tenant-Id`로 `/platform/me` 재조회
5. 이후 tenant별 API는 선택된 `tenantId` 기준으로 호출

### 멤버 초대

1. `GET /tenants/{tenantId}/members`
2. `POST /tenants/{tenantId}/invites` with `expiresInDays=7`
3. 제품 또는 운영 절차가 invite 전달
4. 수신자는 로그인 후 `POST /tenant-invites/{token}/accept`
5. 성공 후 `/platform/me` 재조회

## 오류 처리 가이드

- `401 Unauthorized`
  - 잘못된 access token
  - `aud`/`iss`/서명 불일치
- `403 Forbidden`
  - membership 없음
  - role 부족
- `404 Not Found`
  - tenant 또는 invite 대상 없음
- `409 Conflict`
  - invite email 불일치
  - invite 만료
  - 이미 수락된 invite
  - 이미 멤버인 사용자
  - 마지막 `OWNER` 제거 시도
- `400 Bad Request`
  - 잘못된 tenant id 형식
  - 유효하지 않은 요청 body

### 앱 레이어 공통 오류 응답 예시

- 적용 범위:
  - `400`, `403`, `404`, `409`, `500`
  - controller/service 레이어에서 발생한 tenant/invite 예외

```json
{
  "timestamp": "2026-03-10T00:00:00Z",
  "status": 409,
  "error": "Conflict",
  "message": "Invite already accepted",
  "path": "/tenant-invites/eJx8P5Y9P2WQ6rX8W0TnC9j0Y7P4cN3f/accept"
}
```

- 주의:
  - `401 Unauthorized`는 Spring Security resource server 단계에서 먼저 차단될 수 있다.
  - 현재 `platform-api`는 `401`에 대한 별도 JSON body contract를 정의하지 않는다.
  - 따라서 제품은 `401` 응답 body가 비어 있어도 처리할 수 있어야 한다.

## invite 링크와 로그인 후 복귀 정책

- 현재 `platform-api` contract는 invite 수락 API만 정의한다:
  - `POST /tenant-invites/{token}/accept`
- 즉, 브라우저에서 여는 invite 링크 URL 형식은 `platform-api`가 직접 제공하지 않는다.
- 제품/BFF 권장 정책:
  - raw `inviteToken`을 포함한 제품 측 landing URL을 만든다.
  - 예시: `{product-base-url}/tenant-invites/{inviteToken}`
  - 비로그인 상태로 진입하면 로그인 화면으로 보내되 `inviteToken`과 원래 진입 경로를 보존한다.
  - 로그인 성공 후 invite 수락 화면으로 복귀한 다음 `POST /tenant-invites/{token}/accept`를 호출한다.
  - 수락 성공 후 `/platform/me`를 재조회하고 현재 tenant 진입 또는 selector로 보낸다.

## 제품이 들고 있어야 하는 최소 상태

- 현재 로그인 사용자 access token
- 선택된 tenant id
- `/platform/me` 응답 캐시
- invite 수락용 token

## 책임 분리

- 제품/BFF 책임:
  - 화면 분기
  - tenant selector 상태 관리
  - invite 링크 진입/수락 UX
  - 권한 부족/충돌 오류 메시지 처리
- `platform-api` 책임:
  - JWT 검증
  - membership 검증
  - role 검증
  - tenant/invite 데이터 저장

## 수기 검증 체크리스트

- 올바른 access token으로 `/platform/me` 호출
- `hasTenant == false` 사용자에서 `POST /tenants` 성공
- tenant 2개 이상일 때 selector 분기
- `GET /tenants/{tenantId}` membership 없는 사용자 `403`
- `PATCH /tenants/{tenantId}` role 없는 사용자 `403`
- `POST /tenants/{tenantId}/invites` 성공
- `POST /tenant-invites/{token}/accept` 성공 후 `/platform/me` 반영
- 마지막 `OWNER` 제거 시 `409`
