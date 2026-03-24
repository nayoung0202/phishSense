# ADR-0006: Temporary Product-Managed BYOK Storage

## 상태

승인

## 배경

- 기존 ADR-0005는 BYOK를 플랫폼 중앙관리 대상으로 정의했다.
- 그러나 현재 플랫폼 BYOK 계약과 실행 경로를 기다리면 제품의 Claude/OpenAI/Gemini BYOK 기능을 일정 내 제공하기 어렵다.
- 제품은 이미 tenant-scoped ready access, PostgreSQL, 암호화 유틸리티를 보유하고 있어 임시 로컬 저장 구현이 가능하다.

## 결정

- 현 단계에서는 제품이 tenant별 BYOK API 키를 직접 관리한다.
- API 키 원문은 PostgreSQL에 AES-256-GCM으로 암호화해 저장한다.
- UI와 API 응답에는 마스킹 값과 메타데이터만 노출하고 raw 키는 재노출하지 않는다.
- 제품 route는 `/api/platform/tenants/:tenantId/ai-keys` 형태를 유지해 추후 중앙관리 구현으로 교체 가능한 경계를 보존한다.
- AI 실행 시 scope에 맞는 활성 tenant BYOK 키를 우선 사용하고, 없을 때만 서버 환경변수 키로 fallback 한다.

## 결과

### 장점

- Claude를 포함한 BYOK를 제품 일정 안에 바로 연결할 수 있다.
- tenant 단위 활성 키와 scope 선택을 제품에서 즉시 반영할 수 있다.
- 향후 플랫폼 중앙관리로 전환할 때 프론트엔드 계약을 유지하기 쉽다.

### 비용

- 제품이 암호화 저장 책임을 임시로 가진다.
- 크레딧/플랫폼과 BYOK source-of-truth가 일시적으로 분리된다.
- `AI_KEY_SECRET` 운영 관리가 추가된다.

## 후속 과제

- 플랫폼 BYOK CRUD와 provider execution 계약이 준비되면 로컬 저장소를 대체한다.
- credits summary와 audit를 플랫폼 기준으로 재통합한다.
- 로컬 BYOK를 플랫폼으로 이전하는 마이그레이션 경로를 정의한다.
