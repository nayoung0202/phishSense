# 운영 런북

## 로컬 개발 시작

### 준비물

- Node.js 20+
- PostgreSQL 접근 정보 또는 로컬 Docker 환경
- `.env.example` 기반 `.env`

### 기본 절차

1. `.env.example`를 복사해 `.env`를 만듭니다.
2. `DATABASE_URL`, 인증/플랫폼 관련 비밀값을 채웁니다.
3. 스키마를 반영합니다.

```bash
npm run db:push
```

4. 웹 앱을 실행합니다.

```bash
npm run dev
```

5. 실제 발송 테스트가 필요하면 별도 터미널에서 워커를 실행합니다.

```bash
npm run worker:send
```

## 주요 명령어

- `npm run dev`: 개발 서버 실행
- `npm run build`: 프로덕션 빌드
- `npm run start`: 프로덕션 서버 실행
- `npm run check`: TypeScript 타입 검사
- `npm run test -- --run`: 테스트 일괄 실행
- `npm run db:push`: Drizzle 스키마 반영

## 필수 환경 변수 묶음

### 애플리케이션 기본값

- `APP_BASE_URL`
- `DATABASE_URL`

### 인증

- `OIDC_CLIENT_SECRET`
- `AUTH_SESSION_SECRET`
- `AUTH_TOKEN_ENC_KEY`

### 플랫폼 연동

- `PLATFORM_API_BASE_URL`
- `platform-api` access token audience
- `PHISHSENSE_CALLBACK_SECRET`
- `PHISHSENSE_CALLBACK_KEY_ID`
- billing app key (`PHISHSENSE`)
- 환경별 billing redirect route key allowlist
  - `CHECKOUT_SUCCESS`
  - `CHECKOUT_CANCEL`
  - `PORTAL_RETURN`
  - `PORTAL_DONE`

### SMTP/발송

- `SMTP_SECRET`
- `MAIL_FROM_NAME`
- `MAIL_FROM_EMAIL`
- tenant SMTP 활성 계정이 없을 때만 워커 실행용 `.env` SMTP 접속 정보를 사용합니다.
- tenant는 여러 SMTP 계정을 저장할 수 있고, `smtp_accounts.is_active=true`인 계정 1개가 실발송 기준이 됩니다.
- tenant SMTP 활성 계정이 있으면 `smtp_accounts`의 host/port/security/username 정보가 실발송 transport 기준이 됩니다.
- `smtp_accounts.allowed_domains_json`은 프로젝트 발신 이메일과 SMTP 테스트 발신 이메일의 허용 발신 도메인 정책으로 사용하며, 등록 도메인의 하위 도메인도 함께 허용합니다.
- 실제 프로젝트 발신자 이름/이메일은 프로젝트 설정값을 우선 사용하고, 없을 때만 `MAIL_FROM_NAME`, `MAIL_FROM_EMAIL`을 fallback 합니다.
- 관리자 SMTP 테스트 발송은 테스트 시점에 발신 이메일과 수신 이메일을 직접 입력하며, 발신 이메일은 선택한 발송 설정의 허용 발신 도메인 또는 그 하위 도메인과 일치해야 합니다.

## 배포 체크리스트

- 프로덕션 환경 변수 누락 여부 확인
- `npm run check`
- `npm run test -- --run`
- `npm run build`
- 웹 앱과 발송 워커가 각각 기동되는지 확인
- callback URL과 OIDC redirect URI가 운영 도메인과 일치하는지 확인

## 장애 대응 기본 원칙

- 로그인 불가: OIDC/세션 환경 변수와 `APP_BASE_URL` 우선 확인
- 플랫폼 접근 불가: `/api/auth/platform-context` 상태와 `PLATFORM_API_BASE_URL` 확인
- callback 반영 실패: 서명 키, timestamp 오차, `platform_entitlement_events` 중복 여부 확인
- 메일 발송 실패: tenant SMTP 활성 상태, 발신 주소 send-as/alias 권한, `send_jobs`, 워커 실행 여부 확인
