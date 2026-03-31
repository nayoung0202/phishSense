# Tenant Domain Management PRD

## 목적

- tenant마다 공개 훈련 링크에 사용할 발급 도메인 1개를 제품에서 관리한다.
- `설정 > 도메인` 메뉴에서 slug 기반 도메인 발급과 운영 가이드를 제공한다.
- 피싱 랜딩, 훈련 안내, 오픈 픽셀 링크가 tenant 발급 도메인을 우선 사용하도록 한다.

## 범위

### 포함

- `TENANT_DOMAIN_BASE` 기준 `tenant-slug.phishsense.cloud` 형태의 발급 도메인 관리
- tenant당 활성 도메인 1개 저장
- `설정 > 도메인` 라우트와 발급 UI
- slug 검증과 중복 방지
- 공개 링크 생성 시 tenant 발급 도메인 우선 사용
- CNAME 등록 안내 UI

### 제외

- 고객사 커스텀 도메인 자동 검증
- 고객사 커스텀 도메인용 SSL 인증서 자동 발급
- 발급 이력/다중 도메인 운영
- 공개 라우트의 host 강제 검증

## 기본 가정

- v1의 공식 공개 도메인 전략은 `*.phishsense.cloud` 와일드카드만 사용한다.
- 인증이 필요한 제품 웹앱 진입점은 기존 `APP_BASE_URL`을 유지한다.
- 발급 도메인은 공개 토큰 링크(`/p/:token`, `/t/:token`, `/o/:token`)에만 적용한다.
- customer DNS의 CNAME은 추후 커스텀 도메인 확장 전까지 참고 가이드로만 제공한다.

## 사용자 시나리오

1. OWNER 또는 ADMIN이 `설정 > 도메인`으로 이동한다.
2. 현재 tenant의 발급 도메인 상태를 본다.
3. slug를 입력하면 제품이 `slug.TENANT_DOMAIN_BASE` 미리보기를 보여준다.
4. OWNER가 저장하면 제품은 tenant 도메인을 upsert 한다.
5. 이후 새로 생성되는 테스트 메일/실발송 메일 링크는 해당 tenant 발급 도메인을 사용한다.
6. 사용자는 같은 화면에서 CNAME 등록 예시와 제한 사항을 확인한다.

## 권한

- 조회: `OWNER`, `ADMIN`
- 발급/변경: `OWNER`
- `MEMBER`는 메뉴와 페이지를 보지 않는다.

## 도메인 규칙

- 형식: `^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$`
- one-label slug만 허용한다. 점(`.`)은 허용하지 않는다.
- slug는 tenant 전체에서 유일해야 한다.
- tenant에는 활성 도메인 1개만 저장한다.
- 기본 예시: `acme.phishsense.cloud`

## 제품 동작

### 설정 화면

- 새 메뉴: `/settings/domain`
- 현재 발급 도메인, slug, 공개 링크 예시, 가이드 노출
- OWNER가 저장 버튼으로 발급/변경 수행
- 변경 후 새 메일 링크부터 반영됨을 안내

### 공개 링크

- `send-worker`와 테스트 메일 발송 API는 tenant 발급 도메인이 있으면 이를 사용한다.
- 공개 라우트는 현재 request origin을 기준으로 내부 이동 링크를 재구성한다.
- tenant 발급 도메인이 없으면 기존 `APP_BASE_URL`을 사용한다.

## API

- `GET /api/settings/domain`
  - 현재 tenant 발급 도메인과 기본 가이드를 반환
- `POST /api/settings/domain`
  - OWNER만 허용
  - body: `{ "slug": "acme" }`
  - 현재 tenant 도메인을 upsert

## 데이터 모델

### `tenant_domains`

- `tenant_id` unique
- `slug` unique
- `fqdn` unique
- `created_at`
- `updated_at`

## 운영 메모

- DNS는 이미 `*.phishsense.cloud -> 40.89.214.12` A 레코드가 선행되어야 한다.
- NGINX는 `*.phishsense.cloud` 서버 블록과 와일드카드 SSL 인증서를 사용한다.
- 고객사 커스텀 서브도메인을 실사용하려면 별도 도메인 검증과 SSL 전략이 추가로 필요하다.

## 검증 기준

- OWNER는 `설정 > 도메인`에서 slug를 저장할 수 있다.
- ADMIN은 현재 발급 도메인과 가이드를 조회할 수 있다.
- MEMBER는 `도메인` 메뉴를 보지 않는다.
- tenant 도메인이 저장된 뒤 새 공개 링크는 해당 host를 사용한다.
- tenant 도메인이 없으면 기존 `APP_BASE_URL` 링크가 유지된다.
- invalid slug, duplicate slug, 권한 없는 변경은 API에서 차단된다.
