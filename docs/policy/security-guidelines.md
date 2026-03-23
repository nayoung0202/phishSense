# 보안 가이드라인

## 1. HTML/XSS 방어

- 사용자 입력 HTML은 서버에서 정제한 뒤 저장하거나 렌더링합니다.
- 공용 정제 규칙은 `shared/sanitizeConfig.ts`를 기준으로 유지합니다.
- `dangerouslySetInnerHTML`은 서버에서 정제된 콘텐츠에만 사용합니다.

## 2. 인증 정보 보호

- access token, refresh token, SMTP 비밀번호는 평문 저장을 금지합니다.
- 인증 토큰은 `auth_sessions`에 암호화하여 저장합니다.
- SMTP 비밀번호는 `smtp_accounts.password_enc`에 암호화하여 저장합니다.
- 비밀값은 `.env` 로컬 파일 또는 배포 환경 변수로만 주입합니다.

## 3. 플랫폼 callback 보호

- `POST /webhooks/platform/entitlements`는 HMAC 서명 검증을 통과해야 합니다.
- `X-Platform-Timestamp` 허용 오차는 `PLATFORM_CALLBACK_TOLERANCE_SEC`로 제어합니다.
- `eventId` 기준 멱등 처리를 유지해 재전송과 중복 수신에 안전해야 합니다.

## 4. 외부 API 호출 원칙

- `platform-api` 호출에는 브라우저가 직접 access token을 다루지 않도록 BFF를 우선 사용합니다.
- `/platform/me`에는 `id_token`이 아니라 사용자 `access_token`만 사용합니다.
- tenant 생성 또한 제품 서버에서 중계합니다.

## 5. 외부 입력과 네트워크 제한

- 발송 설정의 `allowed_domains_json`은 프로젝트 발신 이메일과 SMTP 테스트 발신 이메일의 허용 발신 도메인 정책으로 사용하며, 등록 도메인의 하위 도메인도 함께 허용합니다.
- 테스트 수신 이메일 도메인은 운영 허용 목록(`SMTP_TEST_ALLOWED_DOMAINS`) 안에서만 사용합니다.
- SSRF 방어 설정(`SSRF_BLOCK_METADATA`)을 유지합니다.
- 외부 URL을 다루는 로직은 안전한 URL 검사 유틸리티를 거칩니다.

## 6. 운영 점검

- 배포 전 최소 `npm run check`, `npm run test -- --run`, `npm run build` 검증을 권장합니다.
- 인증, callback, 템플릿 HTML 변경이 있으면 관련 테스트와 문서를 함께 갱신합니다.
