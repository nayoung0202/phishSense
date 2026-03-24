# ADR-0005: Billing, Credits, and BYOK are Platform-Owned

## 상태

승인

## 배경

- PhishSense 제품은 tenant, entitlement, 멤버 초대를 이미 `platform-api`에 의존한다.
- 결제, 크래딧, BYOK도 tenant 권한과 product entitlement와 강하게 연결된다.
- 제품이 직접 가격표, 크래딧 차감 정책, Stripe 비밀키, 고객 API 키 원문을 관리하면 제품별 중복과 보안 리스크가 커진다.

## 결정

- 결제, 크래딧, BYOK 정책의 source-of-truth는 플랫폼이다.
- 제품은 UI와 BFF를 제공하고, 플랫폼 계약을 프록시한다.
- Stripe Checkout / Customer Portal 세션 URL은 플랫폼이 만든다.
- 제품은 raw API 키를 저장하지 않고 플랫폼이 반환한 마스킹 메타데이터만 노출한다.
- AI 생성 차감은 platform credit authorization / settle / release 흐름으로 제어한다.

## 결과

### 장점

- 가격/크래딧 정책을 제품 배포 없이 변경할 수 있다.
- Stripe 비밀키와 고객 API 키 원문이 제품 저장소와 브라우저 번들에 남지 않는다.
- 멀티 제품 확장 시 결제/크래딧 정책을 재사용할 수 있다.

### 비용

- 제품은 플랫폼 API 가용성에 더 의존한다.
- 플랫폼 billing/credits/BYOK 계약이 준비되기 전까지 개발 환경 fallback이 필요하다.
- 실제 AI provider 호출까지 BYOK를 연결하려면 후속 플랫폼 실행 계약 또는 proxy가 필요하다.

## 후속 과제

- 플랫폼 billing catalog, subscription, credit APIs 정식화
- 플랫폼 AI key CRUD 정식화
- 플랫폼 기반 provider execution 또는 ephemeral credential 계약 추가
