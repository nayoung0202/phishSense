# Tenant API

## 목적

- tenant 생성, 조회, 수정, 멤버 조회, 초대 생성/수락, 멤버 제거를 제공한다.

## Endpoint

- `POST /tenants`
- `GET /tenants/{tenantId}`
- `PATCH /tenants/{tenantId}`
- `GET /tenants/{tenantId}/members`
- `POST /tenants/{tenantId}/invites`
- `POST /tenant-invites/{token}/accept`
- `DELETE /tenants/{tenantId}/members/{userId}`

## 권한 규칙

- `POST /tenants`: 인증 사용자
- `GET /tenants/{tenantId}`: membership 필요
- `PATCH /tenants/{tenantId}`: `OWNER`, `ADMIN`
- `GET /tenants/{tenantId}/members`: membership 필요
- `POST /tenants/{tenantId}/invites`: `OWNER`, `ADMIN`
- `POST /tenant-invites/{token}/accept`: 인증 사용자 + invite email 일치
- `DELETE /tenants/{tenantId}/members/{userId}`: `OWNER`

## 요청 예시

### tenant 생성

```json
{
  "name": "Acme"
}
```

### invite 생성

```json
{
  "email": "member@acme.com",
  "role": "MEMBER",
  "expiresInDays": 7
}
```

## 응답 정책

- tenant 생성 시 생성된 tenant와 내 role을 반환한다.
- tenant 생성 성공 시 기본 `PHISHSENSE` entitlement가 자동 bootstrap된다.
  - 기본값: `planCode=FREE`, `seatLimit=5`, `status=ACTIVE`, `sourceType=BOOTSTRAP`
  - 제품은 성공 후 `GET /platform/me`를 재조회해 entitlement를 확인한다.
  - product callback은 기존 outbox dispatcher를 통해 비동기로 전달된다.
- invite 생성 시 초기 운영 편의를 위해 raw invite token을 응답에 포함할 수 있다.
- invite token은 DB에 raw 형태로 저장하지 않고 `token_hash`로만 저장한다.

## 성공 응답 예시

### `POST /tenants`

- `201 Created`

```json
{
  "tenantId": "9f6d31d3-c0ea-4f08-ae16-1f4d64f1f7d8",
  "name": "Acme",
  "role": "OWNER"
}
```

### `POST /tenants/{tenantId}/invites`

- `201 Created`

```json
{
  "inviteId": "8a6d5f93-4f89-4170-93ca-90c1edeb6b36",
  "inviteToken": "eJx8P5Y9P2WQ6rX8W0TnC9j0Y7P4cN3f",
  "expiresAt": "2026-03-17T00:00:00Z"
}
```

### `POST /tenant-invites/{token}/accept`

- `200 OK`
- response body 없음

### `GET /tenants/{tenantId}`

- `200 OK`

```json
{
  "tenantId": "9f6d31d3-c0ea-4f08-ae16-1f4d64f1f7d8",
  "name": "Acme",
  "role": "ADMIN"
}
```

### `PATCH /tenants/{tenantId}`

- `200 OK`

```json
{
  "tenantId": "9f6d31d3-c0ea-4f08-ae16-1f4d64f1f7d8",
  "name": "Acme Security",
  "role": "OWNER"
}
```

### `GET /tenants/{tenantId}/members`

- `200 OK`

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

### `DELETE /tenants/{tenantId}/members/{userId}`

- `204 No Content`
- response body 없음

## 오류 응답 정책

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

- 참고:
  - `401 Unauthorized`는 Spring Security resource server 단계에서 먼저 차단될 수 있다.
  - 현재 `platform-api`는 `401`에 대한 별도 JSON body contract를 정의하지 않는다.
  - 따라서 `401`은 위 JSON 형식과 다르거나 body가 비어 있을 수 있다.

## invite 링크 정책

- `platform-api`는 브라우저용 invite landing URL을 직접 제공하지 않는다.
- `platform-api`가 정의하는 contract는 `POST /tenant-invites/{token}/accept` API뿐이다.
- invite 링크 URL 형식과 로그인 후 복귀 흐름은 제품/BFF가 결정한다.
- 권장 최소 정책:
  - raw `inviteToken`을 포함한 제품 측 URL을 사용한다.
  - 비로그인 상태에서는 로그인으로 보내되 `inviteToken`과 진입 경로를 보존한다.
  - 로그인 후 invite 수락 화면으로 복귀해 `POST /tenant-invites/{token}/accept`를 호출한다.
  - 수락 성공 후 `/platform/me`를 재조회한다.

## 보호 규칙

- 일반 사용자 요청의 `tenantId`는 항상 membership으로 검증한다.
- 마지막 `OWNER` 제거는 허용하지 않는다.
- 자기 자신 제거는 Phase 1에서 허용하지 않는다.
