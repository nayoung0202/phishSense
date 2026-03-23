# 데이터 모델 개요

공식 스키마 소스는 `shared/schema.ts`와 `src/server/db/schema.ts`입니다. 이 문서는 테이블의 역할과 운영상 중요한 필드를 요약합니다.

## 모델링 원칙

- 대부분의 주 식별자는 UUID 기반 문자열입니다.
- 공용 도메인 테이블은 `shared/schema.ts`에, 서버 전용 운영 테이블은 `src/server/db/schema.ts`에 둡니다.
- 관계 컬럼은 존재하지만 DB 레벨 외래키 제약보다 애플리케이션 계층 검증을 우선합니다.

## 도메인별 테이블

### 훈련 운영

| 테이블 | 역할 | 핵심 필드 |
| --- | --- | --- |
| `projects` | 훈련 프로젝트 본체 | `template_id`, `training_page_id`, `training_link_token`, `status`, 집계 카운트 |
| `templates` | 메일 템플릿 | `subject`, `body`, `malicious_page_content`, 자동 랜딩 삽입 설정 |
| `targets` | 훈련 대상자 | `email`, `department`, `tags`, `status` |
| `training_pages` | 교육 페이지 | `content`, `status` |
| `project_targets` | 프로젝트-대상자 매핑 | `tracking_token`, `status`, `send_status`, 이벤트 시각 |
| `send_jobs` | 메일 발송 큐 | `status`, `attempts`, `success_count`, `fail_count` |

### 보고서

| 테이블 | 역할 | 핵심 필드 |
| --- | --- | --- |
| `report_templates` | 보고서 템플릿 파일 메타데이터 | `version`, `file_key`, `is_active` |
| `report_settings` | 보고서 발행 설정 | `company_name`, `company_logo_file_key`, `approver_name`, `is_default` |
| `report_instances` | 생성된 보고서 이력 | `project_id`, `template_id`, `status`, `file_key` |

### 인증과 플랫폼 연동

| 테이블 | 역할 | 핵심 필드 |
| --- | --- | --- |
| `auth_sessions` | OIDC 세션 저장 | `tenant_id`, `access_token_enc`, `refresh_token_enc`, 만료 시각 |
| `platform_entitlements` | 제품 접근 기준이 되는 로컬 entitlement 상태 | `tenant_id`, `product_id`, `status`, `plan_code`, `last_event_id` |
| `platform_entitlement_events` | callback 멱등 처리용 이벤트 로그 | `event_id`, `event_type`, `tenant_id`, `key_id` |

### 운영 설정

| 테이블 | 역할 | 핵심 필드 |
| --- | --- | --- |
| `smtp_accounts` | 테넌트별 다건 발송 설정 | `tenant_id`, `name`, `host`, `security_mode`, `username`, `password_enc`, `allowed_domains_json`, `is_active` |

### 예비/레거시

| 테이블 | 역할 |
| --- | --- |
| `users` | 과거 또는 개발용 계정 모델. 현재 주 인증 경로의 중심은 아님 |

## 운영상 중요한 컬럼

### 프로젝트와 발송

- `projects.training_link_token`: 프로젝트 단위 교육 링크 식별자
- `projects.send_validation_error`: 발송 전 템플릿 검증 실패 메시지
- `project_targets.tracking_token`: 오픈/클릭/제출 추적 키
- `project_targets.send_status`: 실제 메일 전송 성공 여부

### 인증

- `auth_sessions.tenant_id`: 현재 선택된 tenant
- `auth_sessions.access_token_enc`: `/platform/me` 재조회용 암호화 access token
- `auth_sessions.refresh_token_enc`: access token 갱신용 refresh token

### 플랫폼

- `platform_entitlements.status`: 제품 접근 허용 여부 판단의 최종 기준
- `platform_entitlement_events.event_id`: callback 중복 수신 방지 키

### 발송 설정

- `smtp_accounts.tenant_id`: 발송 설정 소유 tenant 식별자
- `smtp_accounts.name`: 프로젝트 생성 화면과 관리자 목록에 표시하는 발송 설정 별칭
- `smtp_accounts.username`: SMTP 인증용 계정 아이디
- `smtp_accounts.password_enc`: AES-256-GCM 기반 암호문
- `smtp_accounts.allowed_domains_json`: 프로젝트 발신 이메일과 SMTP 테스트 발신 이메일에 적용하는 허용 발신 도메인 목록
- `smtp_accounts.is_active`: 테넌트의 현재 발송 기준 SMTP 계정 여부

## 상태값 요약

- `projects.status`: 임시, 예약, 진행중, 완료
- `project_targets.status`: `sent`, `opened`, `clicked`, `submitted`, `no_response`
- `project_targets.send_status`: `pending`, `sent`, `failed`
- `send_jobs.status`: `queued`, `running`, `done`, `failed`
- `report_instances.status`: `pending`, `completed`, `failed`

## 참고

- 스키마 변경 시 이 문서와 함께 관련 API, 정책, 운영 문서도 같이 갱신합니다.
- 세부 컬럼 정의가 필요하면 항상 Drizzle 스키마 파일을 최종 기준으로 확인합니다.
