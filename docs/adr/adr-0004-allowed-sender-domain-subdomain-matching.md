# ADR-0004: 허용 발신 도메인은 하위 도메인까지 함께 허용한다

- 상태: 승인
- 날짜: 2026-03-24

## 배경

발송 설정의 허용 발신 도메인은 프로젝트 발신 이메일과 SMTP 테스트 발신 이메일 검증에 사용됩니다. 기존 exact match 방식은 `example.com`을 등록해도 `auth.example.com` 같은 실제 발신 서브도메인을 차단해 사용자 기대와 어긋났습니다.

SMTP 호스트와 발신 이메일 도메인은 별개이며, 실제 운영에서는 발신 이메일에 서브도메인이 쓰이는 경우가 흔합니다. 따라서 루트 도메인을 등록했을 때 하위 도메인까지 함께 허용하는 정책이 더 실무적입니다.

## 결정

- 허용 발신 도메인 검증은 등록 도메인 자체와 그 하위 도메인을 모두 허용합니다.
- 매칭 규칙은 `emailDomain === registeredDomain` 또는 `emailDomain.endsWith("." + registeredDomain)`입니다.
- UI chip은 사용자가 입력한 원래 도메인을 그대로 표시하고, 와일드카드 표기(`*.`)로 변환하지 않습니다.

## 결과

- `evriz.co.kr` 등록 시 `user@evriz.co.kr`, `user@auth.evriz.co.kr`, `user@notice.auth.evriz.co.kr`를 모두 허용합니다.
- `contact.phishsense.cloud` 등록 시 해당 도메인과 그 하위 도메인만 허용하고, 상위 도메인인 `phishsense.cloud`는 허용하지 않습니다.
- 프로젝트 생성, 테스트 발송, 런타임 발송 검증 모두 동일한 규칙을 재사용합니다.
