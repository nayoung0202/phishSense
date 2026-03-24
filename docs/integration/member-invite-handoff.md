# Member Invite Handoff

## 목적

- 제품 개발팀이 `platform-api`의 현재 멤버 초대 기능을 바로 연동할 수 있도록 구현 범위, API 계약, 화면 플로우를 정리한다.
- tenant 전체 onboarding 가이드와 분리해 invite 생성과 수락에 필요한 최소 정보만 전달한다.

## 이 문서의 범위

- 멤버 목록 조회
- invite 생성
- 제품 측 invite 링크 생성과 전달
- 비로그인 진입 시 로그인 후 복귀
- invite 수락
- 수락 후 상태 재조회와 화면 전환

## 이 문서의 제외 범위

- invite 메일 발송 인프라
- resend/revoke API
- tenant 생성/선택 전체 onboarding
- entitlement callback 구현

## 현재 구현 상태

- 현재 구현된 endpoint는 아래 네 가지다.
  - `GET /tenants/{tenantId}/members`
  - `POST /tenants/{tenantId}/invites`
  - `POST /tenant-invites/{token}/accept`
  - `GET /platform/me`
- `platform-api`는 invite 생성과 수락만 처리한다.
- 메일 발송과 브라우저용 landing URL 제공은 현재 제품/BFF 또는 운영 절차 책임이다.
- invite 생성 응답에는 MVP 편의용 `inviteToken`이 포함될 수 있다.
- Phase 2에서 invite 메일 delivery가 `platform-api`로 이동하면 `inviteToken` 응답은 제거될 수 있다.
- 현재 구현 기준 endpoint 경로는 `/tenants/...`, `/tenant-invites/...` 이다.

## 먼저 읽을 문서

- `docs/api/tenant-api.md`
- `docs/api/platform-me.md`
- `docs/integration/product-tenant-onboarding-guide.md`
- `docs/architecture/platform_api_handoff.md`

## 제품팀이 먼저 받아야 할 값

- `platform-api` base URL
- `auth` issuer 또는 discovery URL
- `platform-api` 요청용 access token audience
- 제품 웹앱 base URL
- 제품 로그인 URL과 로그인 후 복귀 처리 방식

## 필수 전제

- invite 생성 호출자는 해당 tenant의 `OWNER` 또는 `ADMIN`이어야 한다.
- invite 수락 사용자는 `auth` access token에 `email` claim이 있어야 한다.
- invite 수락 사용자의 로그인 이메일은 invite 대상 이메일과 같아야 한다.
- 제품은 `inviteToken` 응답을 장기 고정 계약으로 가정하지 않는다.
- 현재 API는 `expiresInDays`를 필수로 요구하고 `1~30`일 범위만 허용한다.

## API 연동 계약

### 1. 멤버 목록 조회

- endpoint: `GET /tenants/{tenantId}/members`
- 권한: membership 필요
- 사용 시점:
  - 멤버 관리 화면 첫 진입
  - invite 수락 후 관리자 화면 재조회

- 성공 응답 예시:

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

### 2. invite 생성

- endpoint: `POST /tenants/{tenantId}/invites`
- 권한: `OWNER`, `ADMIN`

- 요청 예시:

```json
{
  "email": "member@acme.com",
  "role": "MEMBER",
  "expiresInDays": 7
}
```

- 성공 응답 예시:

```json
{
  "inviteId": "8a6d5f93-4f89-4170-93ca-90c1edeb6b36",
  "inviteToken": "eJx8P5Y9P2WQ6rX8W0TnC9j0Y7P4cN3f",
  "expiresAt": "2026-03-17T00:00:00Z"
}
```

- 제품 처리:
  - 응답의 `inviteToken`으로 제품 측 landing URL을 만든다.
  - 예시: `{product-base-url}/tenant-invites/{inviteToken}`
  - `expiresAt`을 관리자 화면에 표시한다.
  - 메일 발송이 없으면 운영 절차 또는 제품 자체 수단으로 링크를 전달한다.
  - `expiresInDays`의 의미는 초대 링크 유효 기간이다. 멤버십 만료일이 아니다.
  - 별도 정책이 없으면 제품은 관리자 입력 UI 없이 기본값 `7일`로 고정하는 방식을 권장한다.

### 3. invite 수락

- endpoint: `POST /tenant-invites/{token}/accept`
- 권한: 인증 사용자 + invite email과 현재 사용자 email 일치
- 성공 응답: `200 OK`, body 없음

- 제품 처리:
  - 성공 후 `GET /platform/me` 재조회
  - 필요 시 현재 tenant 기준으로 멤버 목록 재조회
  - `404` 또는 `409`는 명확한 실패 상태로 사용자에게 보여준다

### 4. 상태 재조회

- endpoint: `GET /platform/me`
- 사용 목적:
  - invite 수락 후 새 membership 반영 확인
  - `currentTenantId` 기준 후속 라우팅 판단

## 권장 제품 플로우

### 관리자 플로우

1. `GET /tenants/{tenantId}/members` 호출
2. 이메일, role과 함께 `POST /tenants/{tenantId}/invites` 호출
3. 응답의 `inviteToken`으로 제품 링크 생성
4. 제품 또는 운영 절차가 링크 전달
5. 필요 시 `expiresAt`과 invite 완료 안내를 화면에 표시

### 초대 수신자 플로우

1. 제품 링크 `/tenant-invites/{token}` 진입
2. 비로그인 상태면 로그인 화면으로 이동하되 token과 원래 진입 경로를 보존
3. 로그인 성공 후 invite 수락 화면으로 복귀
4. `POST /tenant-invites/{token}/accept` 호출
5. 성공 시 `GET /platform/me` 재조회
6. `currentTenantId`가 있으면 해당 tenant로 이동하고, 없으면 tenant selector로 이동

## 오류 처리 가이드

- `401 Unauthorized`
  - 잘못된 access token
  - `aud`/`iss`/서명 불일치
  - 응답 body가 비어 있을 수 있다.
- `403 Forbidden`
  - invite 생성 권한 부족
  - tenant membership 없음
- `404 Not Found`
  - 잘못된 invite token
  - 없는 tenant 또는 대상 리소스
- `409 Conflict`
  - invite email 불일치
  - invite 만료
  - 이미 수락된 invite
  - 이미 멤버인 사용자

## 핵심 메시지

- 지금 바로 붙일 수 있는 범위는 invite 생성과 수락이다.
- invite 링크 생성과 전달 UX는 현재 제품/BFF 책임이다.
- 수락 성공 후에는 반드시 `GET /platform/me`를 다시 호출해 상태를 갱신한다.
