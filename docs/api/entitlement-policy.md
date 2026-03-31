# Entitlement Policy

## 목적

- `platform-api`와 제품이 동일한 entitlement plan code와 seat 정책을 해석하도록 canonical 값을 정의한다.

## Product ID

- `PHISHSENSE`

## Canonical Plan Code

- `FREE`
- `BUSINESS`
- `ENTERPRISE`

## 기본 해석 규칙

- `products[].plan`과 product local entitlement `planCode`는 위 canonical code를 사용한다.
- `status=ACTIVE`인 entitlement만 제품 접근 판단의 후보가 된다.
- 제품 접근 최종 허용 여부는 로컬 entitlement projection이 결정한다.
- 초기 포함 크레딧은 tenant 생성 후 entitlement plan이 확정되면 플랫폼이 자동 부여한다.

## PhishSense v1 기본 정책

### FREE

- tenant 생성 직후 bootstrap entitlement
- 기본 `seatLimit=5`
- 기본 포함 크래딧 `3`
- source type은 bootstrap일 수 있다

### BUSINESS

- 좌석 기반 유료 플랜
- `seatLimit`은 구매 좌석 기준으로 설정한다
- 기본 포함 크래딧 `10`

### ENTERPRISE

- 수동 계약 또는 맞춤 배포 대상
- `seatLimit`은 `null` 또는 별도 계약값일 수 있다
- 가격과 포함 크래딧은 catalog 또는 수동 계약을 따른다

## 제품 구현 시 주의

- 가격표와 포함 크래딧을 클라이언트 상수로 고정하지 않는다.
- UI는 billing catalog와 credits summary 응답을 우선 사용하고, 개발 환경 fallback은 임시 seed로만 사용한다.
