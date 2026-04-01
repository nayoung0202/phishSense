/**
 * scripts/seed-2026q1-extra.ts
 * 2026 Q1에 프로젝트 5개 추가 (다양한 발송 규모 및 반응률)
 * 실행: npx tsx scripts/seed-2026q1-extra.ts
 */

import "dotenv/config";
import { db } from "../src/server/db";
import { targets, projects, projectTargets, sendJobs } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

const TENANT_ID = "b234c9cc-4218-4754-91ad-e66400b4da00";
const TP_ID = "c8a8621a-ca61-4495-80ff-effcaf5f3cbf";

const TMPL = {
  m365:     "tmpl-1775013652218-1-xboe",
  hr:       "tmpl-1775013652218-2-25x0",
  tax:      "tmpl-1775013652218-3-w7i5",
  expense:  "tmpl-1775013652218-4-v1ee",
  zoom:     "tmpl-1775013652218-5-le5t",
  vpn:      "tmpl-1775013652218-6-xnau",
  delivery: "87396378-ae80-4e7c-af30-c9fe8291ec82",
};

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

async function loadTargetsByDept(): Promise<Record<string, string[]>> {
  const rows = await db.select({ id: targets.id, department: targets.department }).from(targets).where(eq(targets.tenantId, TENANT_ID));
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    const dept = r.department ?? "기타";
    if (!map[dept]) map[dept] = [];
    map[dept].push(r.id);
  }
  return map;
}

interface Rate { open: number; click: number; submit: number }

function buildPTs(projectId: string, targetIds: string[], startDate: Date, rate: Rate) {
  const rows = [];
  let offset = 20;
  for (const tid of targetIds) {
    const r = Math.random() * 100;
    const sentAt = addMin(startDate, offset);
    offset += rnd(1, 8);
    let status: string, openedAt = null as Date | null, clickedAt = null as Date | null, submittedAt = null as Date | null;
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
    rows.push({ id: uid("pt"), tenantId: TENANT_ID, projectId, targetId: tid, trackingToken: uid("tok"), status, sendStatus: "sent", sentAt, openedAt, clickedAt, submittedAt });
  }
  return rows;
}

function stats(pts: ReturnType<typeof buildPTs>) {
  return {
    targetCount: pts.length,
    openCount: pts.filter(p => p.openedAt).length,
    clickCount: pts.filter(p => p.clickedAt).length,
    submitCount: pts.filter(p => p.submittedAt).length,
  };
}

// ─── 추가 프로젝트 5개 정의 ────────────────────────────────────────────────────
// 발송 규모와 반응률을 의도적으로 다양하게 설정

const EXTRA: Array<{
  name: string; description: string; department: string; departmentTags: string[];
  templateKey: keyof typeof TMPL; startDate: Date; endDate: Date; weekOfYear: number[];
  depts: string[]; rate: Rate; fromName: string; fromEmail: string;
}> = [
  {
    // 소규모 / 높은 클릭·제출률 (영업팀 집중 — 취약 그룹)
    name: "2026 영업팀 택배 사칭 집중 훈련",
    description: "외부 접촉이 많은 영업팀 대상 택배 추적 링크 위장 고위험 시나리오.",
    department: "영업팀", departmentTags: ["영업팀"],
    templateKey: "delivery",
    startDate: d(2026, 1, 26), endDate: d(2026, 2, 9), weekOfYear: [5],
    depts: ["영업팀"],
    rate: { open: 71, click: 48, submit: 28 },   // 높은 클릭·제출
    fromName: "CJ대한통운", fromEmail: "noreply@cj-tracking-notice.co.kr",
  },
  {
    // 중규모 / 중간 반응률 (마케팅·기획 — 보통 수준)
    name: "2026 마케팅팀·기획팀 복리후생 사칭 훈련",
    description: "마케팅·기획 직군 대상 인사팀 복리후생 신청 마감 위장 시나리오.",
    department: "마케팅팀·기획팀", departmentTags: ["마케팅팀", "기획팀"],
    templateKey: "hr",
    startDate: d(2026, 2, 3), endDate: d(2026, 2, 17), weekOfYear: [6],
    depts: ["마케팅팀", "기획팀"],
    rate: { open: 54, click: 29, submit: 13 },   // 중간
    fromName: "인사팀", fromEmail: "hr@company.co.kr",
  },
  {
    // 대규모 / 낮은 제출률 (전사 세금 환급 — 훈련 효과 반영)
    name: "2026 전사 국세청 환급 사칭 훈련",
    description: "연말 정산 이후 세금 환급 시즌을 활용한 국세청 사칭 전사 훈련.",
    department: "전사", departmentTags: ["전사"],
    templateKey: "tax",
    startDate: d(2026, 2, 24), endDate: d(2026, 3, 10), weekOfYear: [9],
    depts: ["개발팀","영업팀","마케팅팀","기획팀","인사팀","재무팀","운영팀","고객지원팀","디자인팀","법무팀","임원"],
    rate: { open: 38, click: 16, submit: 6 },    // 낮음 (훈련 효과)
    fromName: "국세청", fromEmail: "nts-refund@korea-etax.go.kr",
  },
  {
    // 소규모 / 매우 높은 반응률 (고객지원팀 — 미훈련 그룹)
    name: "2026 고객지원팀 Zoom 사칭 집중 훈련",
    description: "화상회의 링크 클릭이 잦은 고객지원팀 대상 Zoom 계정 탈취 시나리오.",
    department: "고객지원팀", departmentTags: ["고객지원팀"],
    templateKey: "zoom",
    startDate: d(2026, 3, 3), endDate: d(2026, 3, 17), weekOfYear: [10],
    depts: ["고객지원팀"],
    rate: { open: 78, click: 56, submit: 33 },   // 매우 높음
    fromName: "IT 운영팀", fromEmail: "it-ops@company.co.kr",
  },
  {
    // 중규모 / 낮은 오픈율 (디자인·운영팀 — 보안 인식 양호)
    name: "2026 디자인팀·운영팀 VPN 인증서 훈련",
    description: "디자인·운영 직군 대상 VPN 인증서 만료 알림 위장 시나리오.",
    department: "디자인팀·운영팀", departmentTags: ["디자인팀", "운영팀"],
    templateKey: "vpn",
    startDate: d(2026, 3, 16), endDate: d(2026, 3, 30), weekOfYear: [12],
    depts: ["디자인팀", "운영팀"],
    rate: { open: 31, click: 12, submit: 4 },    // 낮음 (보안 인식 양호)
    fromName: "IT 보안팀", fromEmail: "it-security@company.co.kr",
  },
];

async function main() {
  console.log("🌱 2026 Q1 추가 프로젝트 5개 삽입...\n");

  const byDept = await loadTargetsByDept();

  for (const def of EXTRA) {
    const projId = uid("proj");
    const targetIds = def.depts.flatMap(d => byDept[d] ?? []);

    const pts = buildPTs(projId, targetIds, def.startDate, def.rate);
    const s = stats(pts);

    await db.insert(projects).values({
      id: projId, tenantId: TENANT_ID,
      name: def.name, description: def.description,
      department: def.department, departmentTags: def.departmentTags,
      templateId: TMPL[def.templateKey], trainingPageId: TP_ID,
      fromName: def.fromName, fromEmail: def.fromEmail,
      startDate: def.startDate, endDate: def.endDate,
      status: "완료",
      fiscalYear: 2026, fiscalQuarter: 1, weekOfYear: def.weekOfYear,
      targetCount: s.targetCount, openCount: s.openCount,
      clickCount: s.clickCount, submitCount: s.submitCount,
    });

    const CHUNK = 100;
    for (let i = 0; i < pts.length; i += CHUNK) {
      await db.insert(projectTargets).values(pts.slice(i, i + CHUNK));
    }

    await db.insert(sendJobs).values({
      id: uid("job"), tenantId: TENANT_ID, projectId: projId,
      status: "done",
      startedAt: addMin(def.startDate, 5),
      finishedAt: addMin(def.startDate, Math.ceil(targetIds.length * 0.4) + 10),
      attempts: 1, totalCount: s.targetCount, successCount: s.targetCount, failCount: 0,
    });

    const openRate  = ((s.openCount   / s.targetCount) * 100).toFixed(0);
    const clickRate = ((s.clickCount  / s.targetCount) * 100).toFixed(0);
    const subRate   = ((s.submitCount / s.targetCount) * 100).toFixed(0);
    console.log(
      `  ✓ ${def.name.padEnd(36)}  발송 ${String(s.targetCount).padStart(3)}명` +
      `  오픈 ${openRate.padStart(2)}%  클릭 ${clickRate.padStart(2)}%  제출 ${subRate.padStart(2)}%`,
    );
  }

  console.log("\n✅ 완료!");
  process.exit(0);
}

main().catch(err => { console.error("❌ 에러:", err); process.exit(1); });
