# 애플리케이션 API 개요

공식 구현 위치는 `src/app/api/**/route.ts`입니다. 이 문서는 제품 내부 API의 책임과 접근 수준을 빠르게 파악하기 위한 요약입니다.

## 접근 수준

| 수준 | 설명 | 예시 |
| --- | --- | --- |
| `public` | 세션 없이 접근 가능 | `GET /api/auth/oidc/login` |
| `session` | 로그인 세션만 필요 | `GET /api/auth/session`, `POST /api/platform/tenants` |
| `ready` | 세션과 플랫폼 준비 상태 모두 필요 | 대부분의 일반 `/api/**` |

## 인증/세션

| 엔드포인트 그룹 | 역할 |
| --- | --- |
| `GET /api/auth/oidc/login` | OIDC authorize 시작 |
| `GET /api/auth/session` | 현재 세션 조회 |
| `POST /api/auth/logout` | 로컬 세션 폐기 |
| `GET /api/auth/platform-context` | 로컬 entitlement + `/platform/me` 기반 접근 상태 확인 |
| `POST /api/platform/tenants` | 제품 BFF를 통한 tenant 생성 |
| `PATCH /api/auth/session/tenant` | 선택 tenant 갱신 |

## 훈련 리소스

| 리소스 | 주요 경로 |
| --- | --- |
| 프로젝트 | `/api/projects`, `/api/projects/[id]`, `/api/projects/copy`, `/api/projects/calendar`, `/api/projects/quarter-stats` |
| 프로젝트 부가 기능 | `/api/projects/[id]/status`, `/api/projects/[id]/send`, `/api/projects/test-send`, `/api/projects/[id]/targets` |
| 프로젝트 이력/산출물 | `/api/projects/[id]/action-logs`, `/api/projects/[id]/action-logs/export`, `/api/projects/[id]/preview`, `/api/projects/[id]/report-captures` |
| 대상자 | `/api/targets`, `/api/targets/[id]` |
| 템플릿 | `/api/templates`, `/api/templates/[id]`, `/api/templates/ai-generate` |
| 교육 페이지 | `/api/training-pages`, `/api/training-pages/[id]` |

## 보고서

| 리소스 | 주요 경로 |
| --- | --- |
| 보고서 설정 | `/api/reports/settings`, `/api/reports/settings/[id]`, `/api/reports/settings/[id]/default` |
| 보고서 템플릿 | `/api/reports/templates` |
| 보고서 생성/다운로드 | `/api/reports/generate`, `/api/reports/[id]/download` |
| 발송 작업 상태 | `/api/send-jobs/[jobId]` |

## 관리자 기능

| 리소스 | 주요 경로 |
| --- | --- |
| 발송 설정 | `/api/admin/smtp-configs`, `/api/admin/smtp-configs/[smtpAccountId]`, `/api/admin/smtp-configs/[smtpAccountId]/test`, `/api/admin/tenants/[tenantId]/smtp-config`, `/api/admin/tenants/[tenantId]/smtp-config/test` |
| 대상자 일괄 업로드 | `/api/admin/training-targets/import`, `/api/admin/training-targets/template.xlsx` |

- `POST /api/targets`와 `POST /api/admin/training-targets/import`는 tenant의 활성 entitlement `seatLimit`을 초과하는 대상자 추가를 허용하지 않습니다.

## 문서화 원칙

- 상세 request/response 스펙이 장기 운영상 중요해지면 이 디렉터리에 개별 문서를 추가합니다.
- 새로운 리소스 그룹이 생기면 최소한 이 문서의 경로 요약은 즉시 갱신합니다.
