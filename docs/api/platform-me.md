# Platform Me API

## 목적

- 로그인 사용자의 tenant 및 product entitlement 컨텍스트를 한 번에 조회한다.
- 제품/BFF가 첫 진입 시 onboarding 분기와 제품 접근 여부를 판단하는 기준 응답이다.

## 먼저 읽을 문서

- `docs/api/entitlement-policy.md`

## Endpoint

- `GET /platform/me`

## 인증

- `Authorization: Bearer {access_token}` 필수
- `auth`가 발급한 사용자 Access Token 기준
- `iss`, `exp`, `aud contains expectedAudience` 검증 통과 필요
- 검증 후 사용하는 식별 claim: `sub`, `email`

## Tenant Context 규칙

- `X-Platform-Tenant-Id` 헤더는 선택 사항이다.
- membership가 1개면 해당 tenant를 `currentTenantId`로 자동 선택한다.
- membership가 2개 이상이고 헤더가 없으면 `currentTenantId`는 `null`이다.
- 헤더가 있으면 membership 검증 후 `currentTenantId`로 반영한다.

## 응답 예시

```json
{
  "userId": "auth-sub",
  "email": "owner@acme.com",
  "hasTenant": true,
  "currentTenantId": "6d53c5f6-cc95-4f9b-b728-3aa4ebaf7f4a",
  "tenants": [
    {
      "tenantId": "6d53c5f6-cc95-4f9b-b728-3aa4ebaf7f4a",
      "name": "Acme",
      "role": "OWNER"
    }
  ],
  "products": [
    {
      "tenantId": "6d53c5f6-cc95-4f9b-b728-3aa4ebaf7f4a",
      "productId": "PHISHSENSE",
      "status": "ACTIVE",
      "plan": "BUSINESS",
      "seatLimit": 25,
      "expiresAt": "2026-04-09T00:00:00Z"
    }
  ]
}
```

## 오류 규칙

- membership 없는 tenant를 헤더로 보낸 경우 `403 Forbidden`
- 인증 실패 시 `401 Unauthorized`

## 응답 해석 규칙

- `products[].plan`은 `docs/api/entitlement-policy.md`의 canonical `planCode`를 사용한다.
- `seatLimit`은 custom/manual `ENTERPRISE` 계약의 경우 `null`일 수 있다.
