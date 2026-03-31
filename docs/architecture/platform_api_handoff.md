# Platform API Handoff

## 목적

- 제품/BFF가 `platform-api`와 연동할 때 필요한 공통 전제와 책임 분리를 정리한다.

## 제품이 받아야 하는 기본 값

- `platform-api` base URL
- `auth` issuer 또는 discovery URL
- `platform-api` expected audience
- 제품 웹앱 base URL
- 제품 로그인 URL
- platform callback secret / key id

## 인증 원칙

- 모든 platform 호출은 사용자 `access_token`을 사용한다.
- `id_token`은 platform API 인증 토큰으로 사용하지 않는다.
- `platform-api`는 `iss`, `exp`, `aud contains expectedAudience`를 검증한다.

## tenant 컨텍스트 원칙

- 제품은 먼저 `GET /platform/me`로 tenant와 entitlement 컨텍스트를 판단한다.
- tenant-scoped 요청은 ready tenant와 membership 검증을 통과한 뒤에만 호출한다.
- 다중 tenant 사용자는 필요 시 `X-Platform-Tenant-Id`로 `GET /platform/me`를 재조회한다.

## 책임 분리

### platform-api

- tenant / membership / entitlement canonical contract 제공
- billing catalog / subscription contract 제공
- invite token hash 저장과 membership 반영
- Stripe Checkout / Portal 세션 생성

### 제품/BFF

- 사용자 화면, 라우팅, 토스트, 로컬 권한 표시
- invite 링크 조합과 로그인 후 복귀
- platform contract를 감싸는 BFF와 에러 메시지 매핑
- product local entitlement projection과 UI 분기
- tenant별 credit account / ledger 관리
- entitlement plan 기준 초기 포함 크레딧 지급과 최근 변동 조회
- 부족 크레딧 차단과 recharge URL 안내

## 보안 원칙

- Stripe secret, webhook secret은 플랫폼 서버에서만 사용한다.
- 제품은 구독 결제 비밀값을 직접 관리하지 않는다.
- 제품은 tenant credit account / ledger를 직접 관리하되, 외부 결제 비밀값은 저장하지 않는다.
- 브라우저 번들에는 공개 가능 값만 전달한다.
