/**
 * scripts/seed-demo-data.ts
 * test001 계정(tenantId: b234c9cc-4218-4754-91ad-e66400b4da00)에 캡처용 가데이터를 삽입합니다.
 * 실행: npx tsx scripts/seed-demo-data.ts
 */

import "dotenv/config";
import { db } from "../src/server/db";
import {
  templates,
  trainingPages,
  targets,
  projects,
  projectTargets,
  sendJobs,
} from "../src/server/db/schema";

const TENANT_ID = "b234c9cc-4218-4754-91ad-e66400b4da00";

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function date(y: number, m: number, d: number, h = 9) {
  return new Date(y, m - 1, d, h, 0, 0);
}

function addMinutes(base: Date, min: number) {
  return new Date(base.getTime() + min * 60_000);
}

// ─── 1. 템플릿 ─────────────────────────────────────────────────────────────────

const TEMPLATE_IDS = {
  m365: uid("tmpl"),
  expense: uid("tmpl"),
  hr: uid("tmpl"),
  tax: uid("tmpl"),
};

const TEMPLATES = [
  {
    id: TEMPLATE_IDS.m365,
    tenantId: TENANT_ID,
    name: "[IT] Microsoft 365 계정 보안 경고",
    subject: "[긴급] Microsoft 365 계정이 잠겼습니다 — 즉시 확인 필요",
    body: `<p>안녕하세요 <strong>{{이름}}</strong>님,</p>
<p>귀하의 Microsoft 365 계정에서 비정상적인 로그인 시도가 감지되어 계정이 일시적으로 잠겼습니다.</p>
<p>아래 버튼을 클릭하여 신원을 확인하고 계정을 복구하십시오.</p>
<p>보안팀 드림</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif">
<h2>Microsoft 365 로그인</h2>
<input type="email" placeholder="이메일" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<input type="password" placeholder="비밀번호" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<button style="width:100%;padding:10px;background:#0078d4;color:#fff;border:none;cursor:pointer">로그인</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "계정 복구하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: TEMPLATE_IDS.expense,
    tenantId: TENANT_ID,
    name: "[재무] 경비 정산 승인 요청",
    subject: "경비 정산 요청이 대기 중입니다 — 24시간 내 승인 필요",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>귀하의 경비 정산 신청 건(총 ₩248,000)이 최종 승인 대기 중입니다.</p>
<p>오늘 자정까지 승인하지 않으면 자동 취소됩니다.</p>
<p>재무팀 드림</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif">
<h2>경비 정산 시스템</h2>
<p>사번과 비밀번호를 입력하여 승인을 완료하세요.</p>
<input type="text" placeholder="사번" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<input type="password" placeholder="비밀번호" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<button style="width:100%;padding:10px;background:#1a56db;color:#fff;border:none;cursor:pointer">승인하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "승인하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: TEMPLATE_IDS.hr,
    tenantId: TENANT_ID,
    name: "[인사] 2026년 복리후생 신청 안내",
    subject: "[인사팀 공지] 2026년 상반기 복리후생 신청 마감 D-1",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>2026년 상반기 복리후생 신청이 내일 마감됩니다.</p>
<p>건강검진·자기계발비·통신비 지원을 신청하시려면 아래 링크에서 신청서를 작성해 주세요.</p>
<p>인사팀 드림</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif">
<h2>복리후생 신청 포털</h2>
<input type="email" placeholder="회사 이메일" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<input type="password" placeholder="인트라넷 비밀번호" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<button style="width:100%;padding:10px;background:#22863a;color:#fff;border:none;cursor:pointer">신청서 작성하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "신청서 작성하기",
    autoInsertLandingKind: "link" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: TEMPLATE_IDS.tax,
    tenantId: TENANT_ID,
    name: "[국세청] 세금 환급 안내",
    subject: "[국세청] 귀하의 세금 환급금 ₩312,000 처리 완료 — 계좌 확인 필요",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>귀하의 2025년 종합소득세 환급금 312,000원 처리가 완료되었습니다.</p>
<p>환급 계좌를 확인하고 3영업일 내 수령 신청을 완료해 주세요.</p>
<p>국세청 전자세금 서비스</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif">
<h2>국세청 전자세금 서비스</h2>
<input type="text" placeholder="주민등록번호 앞 6자리" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<input type="text" placeholder="계좌번호" style="width:100%;padding:8px;margin:8px 0;box-sizing:border-box"/>
<button style="width:100%;padding:10px;background:#e3342f;color:#fff;border:none;cursor:pointer">환급 신청하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "환급 신청하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
];

// ─── 2. 훈련 페이지 ────────────────────────────────────────────────────────────

const TP_IDS = { basic: uid("tp"), spear: uid("tp") };

const TRAINING_PAGES = [
  {
    id: TP_IDS.basic,
    tenantId: TENANT_ID,
    name: "피싱 이메일 식별 기본 교육",
    description: "피싱 이메일의 주요 특징과 대응 방법을 안내합니다.",
    content: `<div style="max-width:700px;margin:auto;font-family:sans-serif;padding:40px 20px">
<h1 style="color:#e3342f">⚠️ 이 이메일은 피싱 훈련이었습니다</h1>
<p>방금 수신한 이메일은 실제 피싱 공격이 아닌 <strong>사내 보안 인식 훈련</strong>의 일환이었습니다.</p>
<h2>피싱 이메일의 특징</h2>
<ul>
  <li>긴박감·마감 압박을 조성합니다</li>
  <li>발신자 이메일 도메인이 다릅니다</li>
  <li>링크 URL이 공식 도메인과 다릅니다</li>
  <li>계정 정보·비밀번호 입력을 요구합니다</li>
</ul>
<h2>실제 피싱 발생 시 대응 방법</h2>
<ol>
  <li>이메일을 즉시 닫고 첨부파일·링크를 열지 마세요</li>
  <li>IT 보안팀(security@company.com)에 신고하세요</li>
  <li>계정 정보를 입력했다면 즉시 비밀번호를 변경하세요</li>
</ol>
</div>`,
    status: "active",
  },
  {
    id: TP_IDS.spear,
    tenantId: TENANT_ID,
    name: "스피어 피싱 및 사회공학 공격 대응",
    description: "임원 및 핵심 직원을 대상으로 한 표적형 피싱 공격 대응법을 안내합니다.",
    content: `<div style="max-width:700px;margin:auto;font-family:sans-serif;padding:40px 20px">
<h1 style="color:#e3342f">⚠️ 스피어 피싱 훈련이었습니다</h1>
<p>이 이메일은 실제 공격자가 발송한 것이 아닌 <strong>임원 대상 스피어 피싱 인식 훈련</strong>이었습니다.</p>
<h2>스피어 피싱이란?</h2>
<p>특정 개인·조직을 표적으로 맞춤형 정보를 활용한 고도화된 피싱 공격입니다.</p>
<h2>핵심 대응 원칙</h2>
<ul>
  <li>직함·이름이 맞아도 의심하세요 — 공개 정보로 위장 가능합니다</li>
  <li>긴급 송금·계좌 변경 요청은 반드시 전화로 확인하세요</li>
  <li>임원 계정 정보는 IT팀에도 절대 공유하지 마세요</li>
</ul>
</div>`,
    status: "active",
  },
];

// ─── 3. 훈련 대상자 ────────────────────────────────────────────────────────────

interface TargetDef {
  id: string;
  name: string;
  email: string;
  department: string;
  tags: string[];
}

const DEPT = {
  dev: "개발팀",
  mkt: "마케팅팀",
  hr: "인사팀",
  fin: "재무팀",
  sales: "영업팀",
  plan: "기획팀",
  exec: "임원",
};

function makeTarget(
  seq: number,
  name: string,
  dept: string,
  tags: string[] = [],
): TargetDef {
  const emailBase = name
    .replace(/\s/g, "")
    .replace(/[가-힣]/g, (c) => {
      const map: Record<string, string> = {
        김: "kim", 이: "lee", 박: "park", 최: "choi", 정: "jung",
        강: "kang", 조: "jo", 윤: "yoon", 장: "jang", 임: "lim",
        한: "han", 오: "oh", 서: "seo", 신: "shin", 권: "kwon",
        황: "hwang", 안: "ahn", 송: "song", 류: "ryu", 전: "jeon",
        홍: "hong", 민: "min", 수: "soo", 지: "ji", 현: "hyun",
        영: "young", 성: "sung", 준: "jun", 진: "jin", 형: "hyung",
        우: "woo", 태: "tae", 철: "chul", 세: "se", 연: "yeon",
      };
      return map[c] ?? c;
    })
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return {
    id: uid("tgt"),
    name,
    email: `${emailBase}${seq}@company.co.kr`,
    department: dept,
    tags,
  };
}

const TARGETS: TargetDef[] = [
  // 개발팀 (10명)
  makeTarget(1, "김도현", DEPT.dev, ["개발팀", "백엔드"]),
  makeTarget(2, "이서준", DEPT.dev, ["개발팀", "프론트엔드"]),
  makeTarget(3, "박지민", DEPT.dev, ["개발팀", "백엔드"]),
  makeTarget(4, "최민준", DEPT.dev, ["개발팀", "풀스택"]),
  makeTarget(5, "정수빈", DEPT.dev, ["개발팀", "DevOps"]),
  makeTarget(6, "강하은", DEPT.dev, ["개발팀", "QA"]),
  makeTarget(7, "조재원", DEPT.dev, ["개발팀", "백엔드"]),
  makeTarget(8, "윤예린", DEPT.dev, ["개발팀", "프론트엔드"]),
  makeTarget(9, "장민서", DEPT.dev, ["개발팀", "모바일"]),
  makeTarget(10, "임현준", DEPT.dev, ["개발팀", "보안"]),
  // 마케팅팀 (8명)
  makeTarget(11, "한지수", DEPT.mkt, ["마케팅팀"]),
  makeTarget(12, "오서연", DEPT.mkt, ["마케팅팀", "디지털"]),
  makeTarget(13, "서지영", DEPT.mkt, ["마케팅팀"]),
  makeTarget(14, "신동현", DEPT.mkt, ["마케팅팀", "콘텐츠"]),
  makeTarget(15, "권나윤", DEPT.mkt, ["마케팅팀"]),
  makeTarget(16, "황세은", DEPT.mkt, ["마케팅팀", "SNS"]),
  makeTarget(17, "안지훈", DEPT.mkt, ["마케팅팀"]),
  makeTarget(18, "송민지", DEPT.mkt, ["마케팅팀"]),
  // 인사팀 (6명)
  makeTarget(19, "류지현", DEPT.hr, ["인사팀"]),
  makeTarget(20, "전수아", DEPT.hr, ["인사팀"]),
  makeTarget(21, "홍민지", DEPT.hr, ["인사팀", "채용"]),
  makeTarget(22, "김태영", DEPT.hr, ["인사팀"]),
  makeTarget(23, "이민형", DEPT.hr, ["인사팀", "교육"]),
  makeTarget(24, "박세연", DEPT.hr, ["인사팀"]),
  // 재무팀 (6명)
  makeTarget(25, "최준서", DEPT.fin, ["재무팀"]),
  makeTarget(26, "정연우", DEPT.fin, ["재무팀", "회계"]),
  makeTarget(27, "강태준", DEPT.fin, ["재무팀"]),
  makeTarget(28, "조하은", DEPT.fin, ["재무팀", "세무"]),
  makeTarget(29, "윤서진", DEPT.fin, ["재무팀"]),
  makeTarget(30, "장현석", DEPT.fin, ["재무팀"]),
  // 영업팀 (8명)
  makeTarget(31, "임지원", DEPT.sales, ["영업팀"]),
  makeTarget(32, "한승우", DEPT.sales, ["영업팀", "B2B"]),
  makeTarget(33, "오채린", DEPT.sales, ["영업팀"]),
  makeTarget(34, "서도윤", DEPT.sales, ["영업팀", "B2C"]),
  makeTarget(35, "신예은", DEPT.sales, ["영업팀"]),
  makeTarget(36, "권준혁", DEPT.sales, ["영업팀"]),
  makeTarget(37, "황지연", DEPT.sales, ["영업팀"]),
  makeTarget(38, "안성민", DEPT.sales, ["영업팀"]),
  // 기획팀 (6명)
  makeTarget(39, "송다은", DEPT.plan, ["기획팀"]),
  makeTarget(40, "류현준", DEPT.plan, ["기획팀"]),
  makeTarget(41, "전소희", DEPT.plan, ["기획팀", "서비스기획"]),
  makeTarget(42, "홍재민", DEPT.plan, ["기획팀"]),
  makeTarget(43, "김나래", DEPT.plan, ["기획팀"]),
  makeTarget(44, "이준호", DEPT.plan, ["기획팀"]),
  // 임원 (4명)
  makeTarget(45, "박성준", DEPT.exec, ["임원", "C-Level"]),
  makeTarget(46, "최재현", DEPT.exec, ["임원"]),
  makeTarget(47, "정하영", DEPT.exec, ["임원"]),
  makeTarget(48, "강준영", DEPT.exec, ["임원", "C-Level"]),
];

// ─── 4. 프로젝트 & project_targets ────────────────────────────────────────────

interface ProjectSpec {
  id: string;
  name: string;
  description: string;
  department: string | null;
  departmentTags: string[];
  templateId: string;
  trainingPageId: string;
  fromName: string;
  fromEmail: string;
  startDate: Date;
  endDate: Date;
  status: string;
  fiscalYear: number;
  fiscalQuarter: number;
  weekOfYear: number[];
  targetIds: string[];
  // 각 타겟에 적용할 상태 분포 (targetIds 순서 기준)
  statusDist: Array<{
    status: string;
    sendStatus: string;
    sentAt: Date | null;
    openedAt?: Date | null;
    clickedAt?: Date | null;
    submittedAt?: Date | null;
  }>;
}

// 상태 분포 헬퍼
function dist(
  baseDate: Date,
  targetIds: string[],
  pattern: Array<[string, number]>, // [status, count]
): ProjectSpec["statusDist"] {
  const result: ProjectSpec["statusDist"] = [];
  let offset = 30; // 분 단위

  const allStatuses: string[] = [];
  for (const [st, cnt] of pattern) {
    for (let i = 0; i < cnt; i++) allStatuses.push(st);
  }
  // 남은 타겟은 no_response
  while (allStatuses.length < targetIds.length) allStatuses.push("no_response");

  for (const st of allStatuses.slice(0, targetIds.length)) {
    const sentAt = addMinutes(baseDate, offset);
    offset += Math.floor(Math.random() * 10) + 2;
    const openedAt = ["opened", "clicked", "submitted"].includes(st)
      ? addMinutes(sentAt, Math.floor(Math.random() * 120) + 10)
      : null;
    const clickedAt = ["clicked", "submitted"].includes(st)
      ? addMinutes(openedAt!, Math.floor(Math.random() * 60) + 5)
      : null;
    const submittedAt = st === "submitted"
      ? addMinutes(clickedAt!, Math.floor(Math.random() * 30) + 1)
      : null;
    result.push({
      status: st,
      sendStatus: st === "no_response" ? "sent" : "sent",
      sentAt,
      openedAt,
      clickedAt,
      submittedAt,
    });
  }
  return result;
}

// 타겟 id 슬라이스
const allIds = TARGETS.map((t) => t.id);
const devIds = TARGETS.filter((t) => t.department === DEPT.dev).map((t) => t.id);
const execIds = TARGETS.filter((t) => t.department === DEPT.exec).map((t) => t.id);
const nonDevIds = TARGETS.filter((t) => t.department !== DEPT.dev && t.department !== DEPT.exec).map((t) => t.id);

const PROJECTS: ProjectSpec[] = [
  // ── 2025 Q1 ─────────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2025 1분기 전사 피싱 훈련",
    description: "전 임직원 대상 분기별 정기 피싱 시뮬레이션 훈련 1회차",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.m365,
    trainingPageId: TP_IDS.basic,
    fromName: "IT 보안팀",
    fromEmail: "it-security@company.co.kr",
    startDate: date(2025, 1, 15),
    endDate: date(2025, 1, 29),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 1,
    weekOfYear: [3],
    targetIds: allIds,
    statusDist: dist(date(2025, 1, 15, 9), allIds, [
      ["submitted", 8], ["clicked", 12], ["opened", 14], ["no_response", 14],
    ]),
  },
  {
    id: uid("proj"),
    name: "2025 1분기 개발팀 집중 훈련",
    description: "개발팀 대상 기술 계정 탈취 시나리오 집중 훈련",
    department: DEPT.dev,
    departmentTags: ["개발팀"],
    templateId: TEMPLATE_IDS.m365,
    trainingPageId: TP_IDS.spear,
    fromName: "GitHub Security",
    fromEmail: "security@githubmail.co.kr",
    startDate: date(2025, 2, 10),
    endDate: date(2025, 2, 24),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 1,
    weekOfYear: [7],
    targetIds: devIds,
    statusDist: dist(date(2025, 2, 10, 9), devIds, [
      ["submitted", 2], ["clicked", 3], ["opened", 3], ["no_response", 2],
    ]),
  },
  // ── 2025 Q2 ─────────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2025 2분기 전사 피싱 훈련",
    description: "복리후생 신청 시즌 활용 사회공학 시나리오 적용",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.hr,
    trainingPageId: TP_IDS.basic,
    fromName: "인사팀",
    fromEmail: "hr@company.co.kr",
    startDate: date(2025, 4, 8),
    endDate: date(2025, 4, 22),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 2,
    weekOfYear: [15],
    targetIds: allIds,
    statusDist: dist(date(2025, 4, 8, 9), allIds, [
      ["submitted", 11], ["clicked", 15], ["opened", 10], ["no_response", 12],
    ]),
  },
  {
    id: uid("proj"),
    name: "임원 스피어 피싱 훈련",
    description: "임원진 대상 표적형 사기 이메일(BEC) 시나리오",
    department: DEPT.exec,
    departmentTags: ["임원"],
    templateId: TEMPLATE_IDS.expense,
    trainingPageId: TP_IDS.spear,
    fromName: "CFO Office",
    fromEmail: "cfo-office@company-finance.co.kr",
    startDate: date(2025, 5, 6),
    endDate: date(2025, 5, 20),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 2,
    weekOfYear: [19],
    targetIds: execIds,
    statusDist: dist(date(2025, 5, 6, 9), execIds, [
      ["submitted", 1], ["clicked", 1], ["opened", 1], ["no_response", 1],
    ]),
  },
  // ── 2025 Q3 ─────────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2025 3분기 전사 피싱 훈련",
    description: "세금 환급 시즌 공공기관 사칭 시나리오",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.tax,
    trainingPageId: TP_IDS.basic,
    fromName: "국세청",
    fromEmail: "nts-refund@korea-tax.go.kr.phish.co",
    startDate: date(2025, 7, 14),
    endDate: date(2025, 7, 28),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 3,
    weekOfYear: [29],
    targetIds: allIds,
    statusDist: dist(date(2025, 7, 14, 9), allIds, [
      ["submitted", 6], ["clicked", 9], ["opened", 15], ["no_response", 18],
    ]),
  },
  // ── 2025 Q4 ─────────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2025 4분기 전사 피싱 훈련",
    description: "연말 정산 및 복리후생 마감 시즌 이중 시나리오",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.expense,
    trainingPageId: TP_IDS.basic,
    fromName: "재무팀",
    fromEmail: "finance@company.co.kr",
    startDate: date(2025, 10, 13),
    endDate: date(2025, 10, 27),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 4,
    weekOfYear: [42],
    targetIds: allIds,
    statusDist: dist(date(2025, 10, 13, 9), allIds, [
      ["submitted", 5], ["clicked", 10], ["opened", 13], ["no_response", 20],
    ]),
  },
  {
    id: uid("proj"),
    name: "2025 4분기 비개발직군 집중 훈련",
    description: "마케팅·영업·기획 등 비기술 직군 대상 집중 훈련",
    department: "비개발",
    departmentTags: ["마케팅팀", "영업팀", "기획팀", "인사팀", "재무팀"],
    templateId: TEMPLATE_IDS.hr,
    trainingPageId: TP_IDS.basic,
    fromName: "인사팀",
    fromEmail: "hr@company.co.kr",
    startDate: date(2025, 11, 10),
    endDate: date(2025, 11, 24),
    status: "완료",
    fiscalYear: 2025,
    fiscalQuarter: 4,
    weekOfYear: [46],
    targetIds: nonDevIds,
    statusDist: dist(date(2025, 11, 10, 9), nonDevIds, [
      ["submitted", 7], ["clicked", 10], ["opened", 9], ["no_response", 8],
    ]),
  },
  // ── 2026 Q1 ─────────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2026 1분기 전사 피싱 훈련",
    description: "연초 계정 점검 시즌을 활용한 자격증명 탈취 시나리오",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.m365,
    trainingPageId: TP_IDS.basic,
    fromName: "IT 보안팀",
    fromEmail: "it-security@company.co.kr",
    startDate: date(2026, 1, 12),
    endDate: date(2026, 1, 26),
    status: "완료",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    weekOfYear: [3],
    targetIds: allIds,
    statusDist: dist(date(2026, 1, 12, 9), allIds, [
      ["submitted", 4], ["clicked", 8], ["opened", 16], ["no_response", 20],
    ]),
  },
  // ── 2026 Q1 진행중 ──────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2026 신규 입사자 보안 인식 훈련",
    description: "2026년 상반기 신규 입사자 대상 첫 피싱 인식 훈련",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.hr,
    trainingPageId: TP_IDS.basic,
    fromName: "인사팀",
    fromEmail: "hr@company.co.kr",
    startDate: date(2026, 3, 17),
    endDate: date(2026, 4, 6),
    status: "진행중",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    weekOfYear: [12],
    targetIds: allIds,
    statusDist: dist(date(2026, 3, 17, 9), allIds, [
      ["submitted", 3], ["clicked", 6], ["opened", 11], ["no_response", 28],
    ]),
  },
  // ── 2026 Q2 예약 ────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "2026 2분기 전사 피싱 훈련",
    description: "세금 환급 및 연차 촉진 시즌 복합 시나리오 예정",
    department: "전사",
    departmentTags: ["전사"],
    templateId: TEMPLATE_IDS.tax,
    trainingPageId: TP_IDS.basic,
    fromName: "국세청",
    fromEmail: "nts-refund@korea-tax.go.kr.phish.co",
    startDate: date(2026, 4, 20),
    endDate: date(2026, 5, 4),
    status: "예약",
    fiscalYear: 2026,
    fiscalQuarter: 2,
    weekOfYear: [17],
    targetIds: [],
    statusDist: [],
  },
  // ── 임시 ────────────────────────────────────────────────────────
  {
    id: uid("proj"),
    name: "개발팀 제로데이 취약점 알림 시나리오 (초안)",
    description: "보안 취약점 긴급 패치 알림을 위장한 고급 스피어 피싱 시나리오 기획 중",
    department: DEPT.dev,
    departmentTags: ["개발팀"],
    templateId: TEMPLATE_IDS.m365,
    trainingPageId: TP_IDS.spear,
    fromName: "GitHub Security",
    fromEmail: "security@githubmail.co.kr",
    startDate: date(2026, 5, 12),
    endDate: date(2026, 5, 26),
    status: "임시",
    fiscalYear: 2026,
    fiscalQuarter: 2,
    weekOfYear: [20],
    targetIds: [],
    statusDist: [],
  },
];

// ─── 5. 집계 카운트 계산 ───────────────────────────────────────────────────────

function calcCounts(statusDist: ProjectSpec["statusDist"]) {
  let targetCount = statusDist.length;
  let openCount = 0, clickCount = 0, submitCount = 0;
  for (const s of statusDist) {
    if (s.openedAt) openCount++;
    if (s.clickedAt) clickCount++;
    if (s.submittedAt) submitCount++;
  }
  return { targetCount, openCount, clickCount, submitCount };
}

// ─── 6. DB 삽입 ───────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 시드 데이터 삽입 시작...\n");

  // 템플릿
  console.log("📧 템플릿 삽입...");
  await db.insert(templates).values(TEMPLATES);
  console.log(`  ✓ ${TEMPLATES.length}개 삽입`);

  // 훈련 페이지
  console.log("📄 훈련 페이지 삽입...");
  await db.insert(trainingPages).values(TRAINING_PAGES);
  console.log(`  ✓ ${TRAINING_PAGES.length}개 삽입`);

  // 타겟
  console.log("👥 훈련 대상자 삽입...");
  await db.insert(targets).values(
    TARGETS.map((t) => ({
      id: t.id,
      tenantId: TENANT_ID,
      name: t.name,
      email: t.email,
      department: t.department,
      tags: t.tags,
      status: "active",
    })),
  );
  console.log(`  ✓ ${TARGETS.length}명 삽입`);

  // 프로젝트 & project_targets
  console.log("🎯 프로젝트 삽입...");
  for (const p of PROJECTS) {
    const counts = calcCounts(p.statusDist);

    await db.insert(projects).values({
      id: p.id,
      tenantId: TENANT_ID,
      name: p.name,
      description: p.description,
      department: p.department,
      departmentTags: p.departmentTags,
      templateId: p.templateId,
      trainingPageId: p.trainingPageId,
      fromName: p.fromName,
      fromEmail: p.fromEmail,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      fiscalYear: p.fiscalYear,
      fiscalQuarter: p.fiscalQuarter,
      weekOfYear: p.weekOfYear,
      targetCount: counts.targetCount,
      openCount: counts.openCount,
      clickCount: counts.clickCount,
      submitCount: counts.submitCount,
    });

    if (p.targetIds.length > 0) {
      const rows = p.targetIds.map((tid, idx) => {
        const s = p.statusDist[idx];
        return {
          id: uid("pt"),
          tenantId: TENANT_ID,
          projectId: p.id,
          targetId: tid,
          trackingToken: uid("tok"),
          status: s.status,
          sendStatus: s.sendStatus,
          sentAt: s.sentAt,
          openedAt: s.openedAt ?? null,
          clickedAt: s.clickedAt ?? null,
          submittedAt: s.submittedAt ?? null,
        };
      });
      await db.insert(projectTargets).values(rows);
    }

    // 완료 프로젝트는 sendJob도 done으로
    if (p.status === "완료" && p.targetIds.length > 0) {
      const counts2 = calcCounts(p.statusDist);
      await db.insert(sendJobs).values({
        id: uid("job"),
        tenantId: TENANT_ID,
        projectId: p.id,
        status: "done",
        startedAt: addMinutes(p.startDate, 5),
        finishedAt: addMinutes(p.startDate, counts2.targetCount * 0.5 + 10),
        attempts: 1,
        totalCount: counts2.targetCount,
        successCount: counts2.targetCount,
        failCount: 0,
      });
    }

    // 진행중 프로젝트는 sendJob running
    if (p.status === "진행중" && p.targetIds.length > 0) {
      await db.insert(sendJobs).values({
        id: uid("job"),
        tenantId: TENANT_ID,
        projectId: p.id,
        status: "done",
        startedAt: addMinutes(p.startDate, 5),
        finishedAt: addMinutes(p.startDate, 30),
        attempts: 1,
        totalCount: p.targetIds.length,
        successCount: p.targetIds.length,
        failCount: 0,
      });
    }

    console.log(`  ✓ [${p.status}] ${p.name} (발송 ${counts.targetCount}명, 오픈 ${counts.openCount}, 클릭 ${counts.clickCount}, 제출 ${counts.submitCount})`);
  }

  console.log("\n✅ 완료!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 에러:", err);
  process.exit(1);
});
