# ADR-0006: Temporary Product-Managed BYOK Storage

## 상태

대체됨

## 대체 문서

- `docs/adr/adr-0007-credit-only-ai-policy.md`

## 배경

- 기존 문서는 제품이 tenant별 BYOK를 임시 저장하는 방향을 승인했다.
- 이후 1차 크레딧 정책에서 BYOK를 현재 범위에서 제거하고, 모든 AI 생성을 크레딧 차감 기준으로 단순화하기로 결정했다.

## 정리

- 이 ADR의 제품 관리형 BYOK 결정은 더 이상 현재 범위에 적용하지 않는다.
- 현재 범위의 AI 생성은 플랫폼 credits flow와 서버 관리형 실행 키를 기준으로 동작한다.
