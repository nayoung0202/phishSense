# ADR-0005: Billing and Credits are Platform-Owned

## 상태

대체됨

`ADR-0008`에서 제품 내부 credit account / ledger 기준으로 변경됨.

## 배경

- PhishSense 제품은 tenant, entitlement, 멤버 초대를 이미 `platform-api`에 의존한다.
- 결제와 크레딧도 tenant 권한과 product entitlement와 강하게 연결된다.
- 제품이 직접 가격표, 초기 제공 크레딧, 차감 정책, Stripe 비밀키를 관리하면 제품별 중복과 보안 리스크가 커진다.

## 결정

- 결제와 크레딧 정책의 source-of-truth는 플랫폼이다.
- 제품은 UI와 BFF를 제공하고, 플랫폼 계약을 프록시한다.
- Stripe Checkout / Customer Portal 세션 URL은 플랫폼이 만든다.
- tenant 생성 후 entitlement plan이 확정되면 플랫폼이 초기 포함 크레딧을 자동 부여한다.
- v1 기본 포함 크레딧은 `FREE=3`, `BUSINESS=10`이며, `ENTERPRISE`는 별도 계약을 따른다.
- 추가 크레딧 충전용 직접 결제 세션도 플랫폼이 만든다.
- AI 생성 차감은 platform credit authorization / settle / release 흐름으로 제어한다.
- 현재 범위에서는 BYOK를 제공하지 않는다.

## 결과

### 장점

- 가격/크레딧 정책을 제품 배포 없이 변경할 수 있다.
- Stripe 비밀키가 제품 저장소와 브라우저 번들에 남지 않는다.
- 멀티 제품 확장 시 결제/크레딧 정책을 재사용할 수 있다.

### 비용

- 제품은 플랫폼 API 가용성에 더 의존한다.
- 플랫폼 billing/credits 계약이 준비되기 전까지 개발 환경 fallback이 필요하다.
- 크레딧 충전용 직접 결제 계약을 플랫폼과 함께 정식화해야 한다.

## 후속 과제

- 플랫폼 billing catalog, subscription, credit APIs 정식화
- 플랫폼 credit recharge API 또는 세션 계약 정식화
