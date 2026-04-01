/**
 * scripts/seed-history.ts
 * 2024 Q1 ~ 2026 Q1 피싱 훈련 이력 전체 생성
 * 실행: npx tsx scripts/seed-history.ts
 */

import "dotenv/config";
import { db } from "../src/server/db";
import { targets, templates, projects, projectTargets, sendJobs } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

const TENANT_ID = "b234c9cc-4218-4754-91ad-e66400b4da00";

// 기존 훈련 페이지 ID (DB에 존재)
const TP_ID = "c8a8621a-ca61-4495-80ff-effcaf5f3cbf";

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

let _seq = 0;
function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${++_seq}-${Math.random().toString(36).slice(2, 6)}`;
}
function d(y: number, m: number, day: number, h = 9) {
  return new Date(y, m - 1, day, h, 0, 0);
}
function addMin(base: Date, min: number) {
  return new Date(base.getTime() + min * 60_000);
}
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── 1. 추가 템플릿 삽입 ──────────────────────────────────────────────────────

// 기존 배송 템플릿 ID
const TMPL_DELIVERY = "87396378-ae80-4e7c-af30-c9fe8291ec82";

const EXTRA_TEMPLATES = [
  {
    id: uid("tmpl"),
    tenantId: TENANT_ID,
    name: "[IT] Microsoft 365 계정 보안 경고",
    subject: "[긴급] Microsoft 365 계정에 비정상 로그인이 감지되었습니다",
    body: `<p>안녕하세요 <strong>{{이름}}</strong>님,</p>
<p>귀하의 Microsoft 365 계정에서 해외 IP(45.33.xxx.xxx)를 통한 비정상적인 로그인 시도가 감지되었습니다. 계정이 일시적으로 잠겼습니다.</p>
<p>아래 버튼을 클릭하여 본인 확인 후 계정을 복구하십시오. 24시간 내 조치하지 않으면 계정이 영구 잠금됩니다.</p>
<p>Microsoft 보안팀</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif;padding:20px;border:1px solid #ddd">
<img src="https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/200px-Microsoft_logo.svg.png" width="120" style="margin-bottom:16px"/>
<h2 style="font-size:18px;margin-bottom:16px">Microsoft 365 계정 복구</h2>
<input type="email" placeholder="이메일 주소" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<input type="password" placeholder="현재 비밀번호" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<button style="width:100%;padding:10px;background:#0078d4;color:#fff;border:none;cursor:pointer;margin-top:8px">계정 복구하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "계정 복구하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: uid("tmpl"),
    tenantId: TENANT_ID,
    name: "[인사] 복리후생 신청 마감 안내",
    subject: "[인사팀] 2024년 복리후생 신청 마감 D-1 — 미신청 시 자동 소멸",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>2024년 상반기 복리후생(건강검진·자기계발비·통신비 지원) 신청이 <strong>내일 18:00</strong>로 마감됩니다.</p>
<p>미신청 시 해당 복리후생은 자동 소멸되며 이월되지 않습니다. 아래 버튼을 클릭하여 신청을 완료하세요.</p>
<p>인사팀 드림</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif;padding:20px;border:1px solid #ddd">
<h2 style="font-size:18px;margin-bottom:16px">복리후생 신청 포털</h2>
<input type="email" placeholder="회사 이메일" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<input type="password" placeholder="인트라넷 비밀번호" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<button style="width:100%;padding:10px;background:#1a7f37;color:#fff;border:none;cursor:pointer;margin-top:8px">신청하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "신청하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: uid("tmpl"),
    tenantId: TENANT_ID,
    name: "[국세청] 세금 환급 안내",
    subject: "[국세청] 2023년 귀속 종합소득세 환급금 ₩312,000 처리 완료",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>2023년 귀속 종합소득세 환급금 <strong>312,000원</strong>이 처리되었습니다.</p>
<p>환급 계좌를 확인하고 <strong>7영업일 내</strong> 수령 신청을 완료하지 않으면 국고로 귀속됩니다.</p>
<p>국세청 전자세금 서비스</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif;padding:20px;border:1px solid #ddd">
<h2 style="font-size:18px;margin-bottom:16px">국세청 전자 환급 서비스</h2>
<input type="text" placeholder="주민등록번호 앞 6자리" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<input type="text" placeholder="수령 계좌번호" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<button style="width:100%;padding:10px;background:#c0392b;color:#fff;border:none;cursor:pointer;margin-top:8px">환급 신청하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "환급 신청하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: uid("tmpl"),
    tenantId: TENANT_ID,
    name: "[재무] 경비 정산 긴급 승인 요청",
    subject: "[재무팀] 경비 정산 건 승인 기한 초과 임박 — 즉시 확인 필요",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>귀하 명의 경비 정산 신청 건(청구번호: EXP-2024-{{이름}}-001, 금액 248,000원)이 승인 기한(오늘 18:00)을 앞두고 있습니다.</p>
<p>기한 내 미승인 시 정산이 자동 취소되며 재신청이 불가합니다.</p>
<p>재무팀</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif;padding:20px;border:1px solid #ddd">
<h2 style="font-size:18px;margin-bottom:16px">경비 정산 시스템</h2>
<input type="text" placeholder="사번" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<input type="password" placeholder="비밀번호" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<button style="width:100%;padding:10px;background:#e67e22;color:#fff;border:none;cursor:pointer;margin-top:8px">승인하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "승인하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: uid("tmpl"),
    tenantId: TENANT_ID,
    name: "[IT] Zoom 회의 초대",
    subject: "긴급 화상회의 초대 — 오늘 오후 3시 전략회의 참여 요청",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>오늘 오후 3시 긴급 전략 회의가 예정되어 있습니다. 아래 Zoom 링크를 클릭하여 참여해 주세요.</p>
<p>회의 ID: 842 xxx xxxx / 비밀번호: 확인 필요</p>
<p>IT 운영팀</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif;padding:20px;border:1px solid #ddd">
<h2 style="font-size:18px;margin-bottom:16px">Zoom 회의 참여</h2>
<p style="color:#666;font-size:13px">회의에 참여하려면 Zoom 계정으로 로그인하세요.</p>
<input type="email" placeholder="이메일 주소" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<input type="password" placeholder="비밀번호" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<button style="width:100%;padding:10px;background:#2d8cff;color:#fff;border:none;cursor:pointer;margin-top:8px">로그인 후 참여</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "회의 참여하기",
    autoInsertLandingKind: "link" as const,
    autoInsertLandingNewTab: true,
  },
  {
    id: uid("tmpl"),
    tenantId: TENANT_ID,
    name: "[보안] VPN 인증서 갱신 안내",
    subject: "[IT 보안] 사내 VPN 인증서 만료 D-1 — 갱신하지 않으면 접속 차단",
    body: `<p><strong>{{이름}}</strong> 님,</p>
<p>귀하의 사내 VPN 접속 인증서가 <strong>내일 만료</strong>됩니다. 갱신하지 않으면 재택·외부 근무 시 사내 시스템에 접근할 수 없습니다.</p>
<p>아래 링크에서 본인 인증 후 인증서를 갱신하세요.</p>
<p>IT 보안팀</p>`,
    maliciousPageContent: `<div style="max-width:400px;margin:80px auto;font-family:sans-serif;padding:20px;border:1px solid #ddd">
<h2 style="font-size:18px;margin-bottom:16px">VPN 인증서 갱신</h2>
<input type="text" placeholder="사번" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<input type="password" placeholder="도메인 비밀번호" style="width:100%;padding:8px;margin:6px 0;box-sizing:border-box;border:1px solid #ccc"/>
<button style="width:100%;padding:10px;background:#6c3483;color:#fff;border:none;cursor:pointer;margin-top:8px">인증서 갱신하기</button>
</div>`,
    autoInsertLandingEnabled: true,
    autoInsertLandingLabel: "인증서 갱신하기",
    autoInsertLandingKind: "button" as const,
    autoInsertLandingNewTab: true,
  },
];

// ─── 2. 타겟 ID 조회 ──────────────────────────────────────────────────────────

async function loadTargetsByDept(): Promise<Record<string, string[]>> {
  const rows = await db
    .select({ id: targets.id, department: targets.department })
    .from(targets)
    .where(eq(targets.tenantId, TENANT_ID));

  const map: Record<string, string[]> = {};
  for (const r of rows) {
    const dept = r.department ?? "기타";
    if (!map[dept]) map[dept] = [];
    map[dept].push(r.id);
  }
  return map;
}

// ─── 3. project_targets 생성 헬퍼 ─────────────────────────────────────────────

interface Rate { open: number; click: number; submit: number }

function buildProjectTargets(
  projectId: string,
  targetIds: string[],
  startDate: Date,
  rate: Rate,
) {
  const rows = [];
  let offset = 20;

  for (const tid of targetIds) {
    const r = Math.random() * 100;
    let status: string;
    let openedAt: Date | null = null;
    let clickedAt: Date | null = null;
    let submittedAt: Date | null = null;

    const sentAt = addMin(startDate, offset);
    offset += rnd(1, 8);

    if (r < rate.submit) {
      status = "submitted";
      openedAt = addMin(sentAt, rnd(15, 180));
      clickedAt = addMin(openedAt, rnd(5, 60));
      submittedAt = addMin(clickedAt, rnd(1, 20));
    } else if (r < rate.click) {
      status = "clicked";
      openedAt = addMin(sentAt, rnd(10, 240));
      clickedAt = addMin(openedAt, rnd(5, 90));
    } else if (r < rate.open) {
      status = "opened";
      openedAt = addMin(sentAt, rnd(10, 480));
    } else {
      status = "no_response";
    }

    rows.push({
      id: uid("pt"),
      tenantId: TENANT_ID,
      projectId,
      targetId: tid,
      trackingToken: uid("tok"),
      status,
      sendStatus: "sent",
      sentAt,
      openedAt,
      clickedAt,
      submittedAt,
    });
  }
  return rows;
}

function countStats(pts: ReturnType<typeof buildProjectTargets>) {
  return {
    targetCount: pts.length,
    openCount: pts.filter((p) => p.openedAt).length,
    clickCount: pts.filter((p) => p.clickedAt).length,
    submitCount: pts.filter((p) => p.submittedAt).length,
  };
}

// ─── 4. 프로젝트 정의 ─────────────────────────────────────────────────────────

interface ProjectDef {
  name: string;
  description: string;
  department: string;
  departmentTags: string[];
  templateKey: string;
  startDate: Date;
  endDate: Date;
  fiscalYear: number;
  fiscalQuarter: number;
  weekOfYear: number[];
  targetDepts: string[] | "all";
  rate: Rate;
  fromName: string;
  fromEmail: string;
}

// 시나리오별 클릭/제출률 (초기 높음 → 점차 개선)
// 전사: 연도가 지날수록 submit/click 감소 (훈련 효과)
const RATES: Record<string, Rate> = {
  // 2024
  "2024q1_all":    { open: 64, click: 40, submit: 23 },
  "2024q1_dept":   { open: 68, click: 44, submit: 26 },
  "2024q2_all":    { open: 61, click: 37, submit: 20 },
  "2024q2_dept":   { open: 65, click: 41, submit: 24 },
  "2024q3_all":    { open: 58, click: 33, submit: 17 },
  "2024q3_dept":   { open: 62, click: 37, submit: 21 },
  "2024q4_all":    { open: 55, click: 30, submit: 15 },
  "2024q4_dept":   { open: 59, click: 34, submit: 18 },
  // 2025
  "2025q1_all":    { open: 52, click: 27, submit: 13 },
  "2025q1_dept":   { open: 56, click: 31, submit: 16 },
  "2025q2_all":    { open: 50, click: 25, submit: 11 },
  "2025q2_dept":   { open: 54, click: 29, submit: 14 },
  "2025q3_all":    { open: 47, click: 22, submit: 9  },
  "2025q3_dept":   { open: 51, click: 26, submit: 12 },
  "2025q4_all":    { open: 44, click: 19, submit: 8  },
  "2025q4_dept":   { open: 48, click: 23, submit: 11 },
  // 2026
  "2026q1_all":    { open: 42, click: 17, submit: 7  },
  "2026q1_dept":   { open: 46, click: 21, submit: 10 },
  // 임원은 항상 조금 높게
  "exec":          { open: 72, click: 48, submit: 29 },
};

// templateKey 목록 (나중에 실제 id로 치환)
let TMPL: Record<string, string> = {
  delivery: TMPL_DELIVERY,
  m365: "",
  hr: "",
  tax: "",
  expense: "",
  zoom: "",
  vpn: "",
};

const PROJECT_DEFS: ProjectDef[] = [
  // ══════════════════════ 2024 Q1 ══════════════════════
  {
    name: "2024 1분기 전사 피싱 모의훈련",
    description: "2024년 연간 보안 훈련 계획 1회차. 전 임직원 대상 계정 탈취 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "m365",
    startDate: d(2024, 1, 22), endDate: d(2024, 2, 5),
    fiscalYear: 2024, fiscalQuarter: 1, weekOfYear: [4],
    targetDepts: "all", rate: RATES["2024q1_all"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
  {
    name: "2024 개발팀 기술 계정 집중 훈련",
    description: "GitHub/IDE 계정 탈취 시나리오. 개발팀 특화 스피어 피싱.",
    department: "개발팀", departmentTags: ["개발팀"],
    templateKey: "vpn",
    startDate: d(2024, 2, 19), endDate: d(2024, 3, 4),
    fiscalYear: 2024, fiscalQuarter: 1, weekOfYear: [8],
    targetDepts: ["개발팀"], rate: RATES["2024q1_dept"],
    fromName: "GitHub Security", fromEmail: "security@github-notice.co.kr",
  },
  {
    name: "2024 1분기 재무·인사팀 집중 훈련",
    description: "고위험 부서(재무/인사) 대상 BEC 및 급여 계좌 변경 시나리오.",
    department: "재무팀·인사팀", departmentTags: ["재무팀", "인사팀"],
    templateKey: "expense",
    startDate: d(2024, 3, 11), endDate: d(2024, 3, 25),
    fiscalYear: 2024, fiscalQuarter: 1, weekOfYear: [11],
    targetDepts: ["재무팀", "인사팀"], rate: RATES["2024q1_dept"],
    fromName: "CFO Office", fromEmail: "cfo-office@company-hq.co.kr",
  },

  // ══════════════════════ 2024 Q2 ══════════════════════
  {
    name: "2024 2분기 전사 피싱 모의훈련",
    description: "복리후생 신청 시즌 사회공학 시나리오 적용.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "hr",
    startDate: d(2024, 4, 15), endDate: d(2024, 4, 29),
    fiscalYear: 2024, fiscalQuarter: 2, weekOfYear: [16],
    targetDepts: "all", rate: RATES["2024q2_all"],
    fromName: "인사팀", fromEmail: "hr@company.co.kr",
  },
  {
    name: "2024 영업팀·고객지원팀 집중 훈련",
    description: "외부 접촉이 많은 영업·CS 직군 대상 택배 사칭 시나리오.",
    department: "영업팀·고객지원팀", departmentTags: ["영업팀", "고객지원팀"],
    templateKey: "delivery",
    startDate: d(2024, 5, 13), endDate: d(2024, 5, 27),
    fiscalYear: 2024, fiscalQuarter: 2, weekOfYear: [20],
    targetDepts: ["영업팀", "고객지원팀"], rate: RATES["2024q2_dept"],
    fromName: "CJ대한통운", fromEmail: "noreply@cj-delivery-notice.co.kr",
  },
  {
    name: "2024 임원 스피어 피싱 훈련",
    description: "임원 대상 표적형 BEC(비즈니스 이메일 사기) 시나리오.",
    department: "임원", departmentTags: ["임원"],
    templateKey: "expense",
    startDate: d(2024, 6, 10), endDate: d(2024, 6, 24),
    fiscalYear: 2024, fiscalQuarter: 2, weekOfYear: [24],
    targetDepts: ["임원"], rate: RATES["exec"],
    fromName: "비서실", fromEmail: "secretary@company-exec.co.kr",
  },

  // ══════════════════════ 2024 Q3 ══════════════════════
  {
    name: "2024 3분기 전사 피싱 모의훈련",
    description: "세금 환급 시즌 공공기관 사칭 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "tax",
    startDate: d(2024, 7, 15), endDate: d(2024, 7, 29),
    fiscalYear: 2024, fiscalQuarter: 3, weekOfYear: [29],
    targetDepts: "all", rate: RATES["2024q3_all"],
    fromName: "국세청", fromEmail: "nts-etax@korea-refund.go.kr",
  },
  {
    name: "2024 마케팅팀·기획팀 집중 훈련",
    description: "광고/미디어 관련 피싱 링크 클릭 시나리오.",
    department: "마케팅팀·기획팀", departmentTags: ["마케팅팀", "기획팀"],
    templateKey: "zoom",
    startDate: d(2024, 8, 12), endDate: d(2024, 8, 26),
    fiscalYear: 2024, fiscalQuarter: 3, weekOfYear: [33],
    targetDepts: ["마케팅팀", "기획팀"], rate: RATES["2024q3_dept"],
    fromName: "Google Ads", fromEmail: "ads-notice@google-business-kr.com",
  },
  {
    name: "2024 운영팀·법무팀 집중 훈련",
    description: "계약·운영 관련 문서 위장 시나리오.",
    department: "운영팀·법무팀", departmentTags: ["운영팀", "법무팀"],
    templateKey: "expense",
    startDate: d(2024, 9, 9), endDate: d(2024, 9, 23),
    fiscalYear: 2024, fiscalQuarter: 3, weekOfYear: [37],
    targetDepts: ["운영팀", "법무팀"], rate: RATES["2024q3_dept"],
    fromName: "법무법인 한결", fromEmail: "notice@hankyul-law.co.kr",
  },

  // ══════════════════════ 2024 Q4 ══════════════════════
  {
    name: "2024 4분기 전사 피싱 모의훈련",
    description: "연말 정산 시즌 국세청 환급 이메일 사칭 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "tax",
    startDate: d(2024, 10, 14), endDate: d(2024, 10, 28),
    fiscalYear: 2024, fiscalQuarter: 4, weekOfYear: [42],
    targetDepts: "all", rate: RATES["2024q4_all"],
    fromName: "국세청", fromEmail: "nts-yearend@korea-tax-return.go.kr",
  },
  {
    name: "2024 고위험군 재훈련",
    description: "이전 훈련에서 자격증명을 입력한 직원 대상 심화 재훈련.",
    department: "전사(재훈련)", departmentTags: ["전사", "재훈련"],
    templateKey: "vpn",
    startDate: d(2024, 11, 11), endDate: d(2024, 11, 25),
    fiscalYear: 2024, fiscalQuarter: 4, weekOfYear: [46],
    targetDepts: ["개발팀", "영업팀", "마케팅팀"], rate: RATES["2024q4_dept"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
  {
    name: "2024 4분기 디자인팀·마케팅팀 집중 훈련",
    description: "SNS/디자인 툴 계정 탈취 시나리오.",
    department: "디자인팀·마케팅팀", departmentTags: ["디자인팀", "마케팅팀"],
    templateKey: "zoom",
    startDate: d(2024, 12, 2), endDate: d(2024, 12, 16),
    fiscalYear: 2024, fiscalQuarter: 4, weekOfYear: [49],
    targetDepts: ["디자인팀", "마케팅팀"], rate: RATES["2024q4_dept"],
    fromName: "Adobe Creative Cloud", fromEmail: "notice@adobe-creative-kr.com",
  },

  // ══════════════════════ 2025 Q1 ══════════════════════
  {
    name: "2025 1분기 전사 피싱 모의훈련",
    description: "2025년 연간 훈련 1회차. 연초 계정 점검 시즌 M365 사칭.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "m365",
    startDate: d(2025, 1, 20), endDate: d(2025, 2, 3),
    fiscalYear: 2025, fiscalQuarter: 1, weekOfYear: [4],
    targetDepts: "all", rate: RATES["2025q1_all"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
  {
    name: "2025 개발팀 GitHub 계정 탈취 훈련",
    description: "개발 도구(GitHub Actions) 관련 보안 알림 위장 시나리오.",
    department: "개발팀", departmentTags: ["개발팀"],
    templateKey: "vpn",
    startDate: d(2025, 2, 17), endDate: d(2025, 3, 3),
    fiscalYear: 2025, fiscalQuarter: 1, weekOfYear: [8],
    targetDepts: ["개발팀"], rate: RATES["2025q1_dept"],
    fromName: "GitHub Security", fromEmail: "security@github-alert.co.kr",
  },
  {
    name: "2025 1분기 임원 스피어 피싱 훈련",
    description: "임원 대상 분기별 정기 스피어 피싱 1회차.",
    department: "임원", departmentTags: ["임원"],
    templateKey: "expense",
    startDate: d(2025, 3, 10), endDate: d(2025, 3, 24),
    fiscalYear: 2025, fiscalQuarter: 1, weekOfYear: [11],
    targetDepts: ["임원"], rate: RATES["exec"],
    fromName: "회장실", fromEmail: "chairman-office@company-group.co.kr",
  },

  // ══════════════════════ 2025 Q2 ══════════════════════
  {
    name: "2025 2분기 전사 피싱 모의훈련",
    description: "복리후생 신청 마감 시즌 인사팀 사칭 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "hr",
    startDate: d(2025, 4, 14), endDate: d(2025, 4, 28),
    fiscalYear: 2025, fiscalQuarter: 2, weekOfYear: [16],
    targetDepts: "all", rate: RATES["2025q2_all"],
    fromName: "인사팀", fromEmail: "hr@company.co.kr",
  },
  {
    name: "2025 영업팀·기획팀 집중 훈련",
    description: "외부 파트너사 사칭 스피어 피싱 시나리오.",
    department: "영업팀·기획팀", departmentTags: ["영업팀", "기획팀"],
    templateKey: "zoom",
    startDate: d(2025, 5, 12), endDate: d(2025, 5, 26),
    fiscalYear: 2025, fiscalQuarter: 2, weekOfYear: [20],
    targetDepts: ["영업팀", "기획팀"], rate: RATES["2025q2_dept"],
    fromName: "파트너 관리팀", fromEmail: "partner@bizconnect-kr.com",
  },
  {
    name: "2025 2분기 재무팀 BEC 집중 훈련",
    description: "거래처 계좌 변경 요청 위장 BEC(비즈니스 이메일 사기) 시나리오.",
    department: "재무팀", departmentTags: ["재무팀"],
    templateKey: "expense",
    startDate: d(2025, 6, 9), endDate: d(2025, 6, 23),
    fiscalYear: 2025, fiscalQuarter: 2, weekOfYear: [24],
    targetDepts: ["재무팀"], rate: RATES["2025q2_dept"],
    fromName: "거래처 경리팀", fromEmail: "billing@partner-finance.co.kr",
  },

  // ══════════════════════ 2025 Q3 ══════════════════════
  {
    name: "2025 3분기 전사 피싱 모의훈련",
    description: "휴가 시즌 Zoom 초대 링크 사칭 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "zoom",
    startDate: d(2025, 7, 14), endDate: d(2025, 7, 28),
    fiscalYear: 2025, fiscalQuarter: 3, weekOfYear: [29],
    targetDepts: "all", rate: RATES["2025q3_all"],
    fromName: "IT 운영팀", fromEmail: "it-ops@company.co.kr",
  },
  {
    name: "2025 신규 입사자 보안 인식 훈련",
    description: "2025년 상반기 신규 입사자(고객지원·운영팀 포함) 대상 첫 피싱 훈련.",
    department: "고객지원팀·운영팀", departmentTags: ["고객지원팀", "운영팀"],
    templateKey: "delivery",
    startDate: d(2025, 8, 11), endDate: d(2025, 8, 25),
    fiscalYear: 2025, fiscalQuarter: 3, weekOfYear: [33],
    targetDepts: ["고객지원팀", "운영팀"], rate: RATES["2025q3_dept"],
    fromName: "쿠팡 고객센터", fromEmail: "cs@coupang-notice-kr.com",
  },
  {
    name: "2025 3분기 임원 스피어 피싱 훈련",
    description: "임원 대상 투자/IR 문서 사칭 고급 시나리오.",
    department: "임원", departmentTags: ["임원"],
    templateKey: "expense",
    startDate: d(2025, 9, 8), endDate: d(2025, 9, 22),
    fiscalYear: 2025, fiscalQuarter: 3, weekOfYear: [37],
    targetDepts: ["임원"], rate: RATES["exec"],
    fromName: "IR 담당자", fromEmail: "ir@company-invest.co.kr",
  },

  // ══════════════════════ 2025 Q4 ══════════════════════
  {
    name: "2025 4분기 전사 피싱 모의훈련",
    description: "연말 정산·VPN 인증서 갱신 시즌 복합 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "vpn",
    startDate: d(2025, 10, 13), endDate: d(2025, 10, 27),
    fiscalYear: 2025, fiscalQuarter: 4, weekOfYear: [42],
    targetDepts: "all", rate: RATES["2025q4_all"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
  {
    name: "2025 4분기 법무팀·디자인팀 집중 훈련",
    description: "계약 문서 및 저작권 관련 이메일 위장 시나리오.",
    department: "법무팀·디자인팀", departmentTags: ["법무팀", "디자인팀"],
    templateKey: "delivery",
    startDate: d(2025, 11, 10), endDate: d(2025, 11, 24),
    fiscalYear: 2025, fiscalQuarter: 4, weekOfYear: [46],
    targetDepts: ["법무팀", "디자인팀"], rate: RATES["2025q4_dept"],
    fromName: "한국저작권위원회", fromEmail: "notice@copyright-kr-official.or.kr",
  },
  {
    name: "2025 연말 고위험군 재훈련",
    description: "연간 훈련에서 반복적으로 클릭/제출한 직원 대상 심화 재훈련.",
    department: "전사(재훈련)", departmentTags: ["전사", "재훈련"],
    templateKey: "m365",
    startDate: d(2025, 12, 8), endDate: d(2025, 12, 22),
    fiscalYear: 2025, fiscalQuarter: 4, weekOfYear: [50],
    targetDepts: ["인사팀", "마케팅팀", "영업팀"], rate: RATES["2025q4_dept"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },

  // ══════════════════════ 2026 Q1 ══════════════════════
  {
    name: "2026 1분기 전사 피싱 모의훈련",
    description: "2026년 연간 훈련 1회차. 연초 계정 점검 M365 사칭 시나리오.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "m365",
    startDate: d(2026, 1, 19), endDate: d(2026, 2, 2),
    fiscalYear: 2026, fiscalQuarter: 1, weekOfYear: [4],
    targetDepts: "all", rate: RATES["2026q1_all"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
  {
    name: "2026 임원 스피어 피싱 훈련",
    description: "임원 대상 분기별 정기 훈련. 공급망 사기 시나리오.",
    department: "임원", departmentTags: ["임원"],
    templateKey: "expense",
    startDate: d(2026, 2, 9), endDate: d(2026, 2, 23),
    fiscalYear: 2026, fiscalQuarter: 1, weekOfYear: [7],
    targetDepts: ["임원"], rate: RATES["exec"],
    fromName: "공급업체 담당자", fromEmail: "vendor@supply-chain-notice.co.kr",
  },
  {
    name: "2026 개발팀·재무팀·인사팀 집중 훈련",
    description: "핵심 부서 대상 연초 자격증명 탈취 집중 훈련.",
    department: "개발팀·재무팀·인사팀", departmentTags: ["개발팀", "재무팀", "인사팀"],
    templateKey: "vpn",
    startDate: d(2026, 3, 10), endDate: d(2026, 3, 24),
    fiscalYear: 2026, fiscalQuarter: 1, weekOfYear: [11],
    targetDepts: ["개발팀", "재무팀", "인사팀"], rate: RATES["2026q1_dept"],
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
];

// ─── 5. 메인 ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 훈련 이력 시드 시작...\n");

  // 추가 템플릿 삽입
  console.log("📧 추가 템플릿 삽입...");
  await db.insert(templates).values(EXTRA_TEMPLATES);
  TMPL = {
    delivery: TMPL_DELIVERY,
    m365:     EXTRA_TEMPLATES[0].id,
    hr:       EXTRA_TEMPLATES[1].id,
    tax:      EXTRA_TEMPLATES[2].id,
    expense:  EXTRA_TEMPLATES[3].id,
    zoom:     EXTRA_TEMPLATES[4].id,
    vpn:      EXTRA_TEMPLATES[5].id,
  };
  console.log(`  ✓ ${EXTRA_TEMPLATES.length}개`);

  // 타겟 로드
  console.log("👥 타겟 로드...");
  const byDept = await loadTargetsByDept();
  const allIds = Object.values(byDept).flat();
  console.log(`  ✓ 총 ${allIds.length}명 (${Object.keys(byDept).length}개 부서)\n`);

  // 프로젝트 삽입
  console.log("🎯 프로젝트 삽입...");
  let totalPT = 0;

  for (const def of PROJECT_DEFS) {
    const projId = uid("proj");
    const tmplId = TMPL[def.templateKey];

    // 대상 타겟 ID 목록
    const targetIds: string[] = def.targetDepts === "all"
      ? allIds
      : def.targetDepts.flatMap((d) => byDept[d] ?? []);

    if (targetIds.length === 0) {
      console.warn(`  ⚠️  타겟 없음: ${def.name}`);
      continue;
    }

    // project_targets 생성
    const pts = buildProjectTargets(projId, targetIds, def.startDate, def.rate);
    const stats = countStats(pts);

    // 프로젝트 삽입
    await db.insert(projects).values({
      id: projId,
      tenantId: TENANT_ID,
      name: def.name,
      description: def.description,
      department: def.department,
      departmentTags: def.departmentTags,
      templateId: tmplId,
      trainingPageId: TP_ID,
      fromName: def.fromName,
      fromEmail: def.fromEmail,
      startDate: def.startDate,
      endDate: def.endDate,
      status: "완료",
      fiscalYear: def.fiscalYear,
      fiscalQuarter: def.fiscalQuarter,
      weekOfYear: def.weekOfYear,
      targetCount: stats.targetCount,
      openCount: stats.openCount,
      clickCount: stats.clickCount,
      submitCount: stats.submitCount,
    });

    // project_targets 청크 삽입
    const CHUNK = 100;
    for (let i = 0; i < pts.length; i += CHUNK) {
      await db.insert(projectTargets).values(pts.slice(i, i + CHUNK));
    }

    // sendJob
    await db.insert(sendJobs).values({
      id: uid("job"),
      tenantId: TENANT_ID,
      projectId: projId,
      status: "done",
      startedAt: addMin(def.startDate, 5),
      finishedAt: addMin(def.startDate, Math.ceil(targetIds.length * 0.4) + 10),
      attempts: 1,
      totalCount: stats.targetCount,
      successCount: stats.targetCount,
      failCount: 0,
    });

    totalPT += pts.length;

    const openRate = ((stats.openCount / stats.targetCount) * 100).toFixed(0);
    const clickRate = ((stats.clickCount / stats.targetCount) * 100).toFixed(0);
    const submitRate = ((stats.submitCount / stats.targetCount) * 100).toFixed(0);
    console.log(
      `  ✓ [${def.fiscalYear} Q${def.fiscalQuarter}] ${def.name.substring(0, 38).padEnd(38)}` +
      `  발송 ${String(stats.targetCount).padStart(3)}명` +
      `  오픈 ${openRate.padStart(2)}%  클릭 ${clickRate.padStart(2)}%  제출 ${submitRate.padStart(2)}%`,
    );
  }

  console.log(`\n✅ 완료! 프로젝트 ${PROJECT_DEFS.length}개 / project_targets ${totalPT}건`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 에러:", err);
  process.exit(1);
});
