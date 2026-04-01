/**
 * scripts/seed-2026-feb-multidept.ts
 * 2026년 2월 전 부서 대상 프로젝트 1개 삽입
 * - 부서별 반응률을 의도적으로 다르게 설정 → 부서별 분포 파이차트 다양화
 * - 전체 발송→오픈→클릭→제출 깔때기 데이터 → 훈련 진행 추세 차트 표현
 * 실행: npx tsx scripts/seed-2026-feb-multidept.ts
 */

import "dotenv/config";
import { db } from "../src/server/db";
import { targets, projects, projectTargets, sendJobs } from "../src/server/db/schema";
import { eq } from "drizzle-orm";

const TENANT_ID = "b234c9cc-4218-4754-91ad-e66400b4da00";
const TP_ID     = "c8a8621a-ca61-4495-80ff-effcaf5f3cbf";
const TMPL_EXPENSE = "tmpl-1775013652218-4-v1ee"; // [재무] 경비 정산 긴급 승인

let _seq = 0;
function uid(p: string) {
  return `${p}-${Date.now()}-${++_seq}-${Math.random().toString(36).slice(2, 6)}`;
}
function addMin(base: Date, min: number) {
  return new Date(base.getTime() + min * 60_000);
}
function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── 부서별 반응률 (의도적으로 큰 편차) ───────────────────────────────────────
// 파이차트: 부서별 클릭/제출 건수 분포 시각화
// 진행 추세: 전체 발송→오픈→클릭→제출 깔때기 바 차트
const DEPT_RATES: Record<string, { open: number; click: number; submit: number }> = {
  "영업팀":     { open: 74, click: 52, submit: 34 }, // 최고 위험 — 외부 접촉 많음
  "고객지원팀": { open: 70, click: 46, submit: 29 }, // 고위험 — 민감 정보 취급
  "인사팀":     { open: 65, click: 40, submit: 24 }, // 고위험 — 인사 발령 이메일 익숙
  "재무팀":     { open: 62, click: 38, submit: 22 }, // 고위험 — BEC 타깃
  "마케팅팀":   { open: 58, click: 32, submit: 17 }, // 중간 — 외부 뉴스레터 다수 수신
  "운영팀":     { open: 52, click: 26, submit: 13 }, // 중간
  "기획팀":     { open: 48, click: 21, submit: 10 }, // 중간 — 일부 보안 인식 있음
  "디자인팀":   { open: 43, click: 17, submit:  7 }, // 중하 — 시각적 단서 인식 양호
  "임원":       { open: 57, click: 29, submit: 14 }, // 중간 (임원 특화 스피어는 별도)
  "개발팀":     { open: 33, click: 11, submit:  4 }, // 저위험 — 기술 인식 높음
  "법무팀":     { open: 28, click:  8, submit:  2 }, // 최저 — 이메일 검토 철저
};

async function main() {
  console.log("🌱 2026년 2월 전 부서 프로젝트 생성...\n");

  // 타겟 로드
  const rows = await db
    .select({ id: targets.id, department: targets.department })
    .from(targets)
    .where(eq(targets.tenantId, TENANT_ID));

  const byDept: Record<string, string[]> = {};
  for (const r of rows) {
    const d = r.department ?? "기타";
    (byDept[d] ??= []).push(r.id);
  }

  const allTargetIds = Object.values(byDept).flat();
  console.log(`  타겟 ${allTargetIds.length}명 (${Object.keys(byDept).length}개 부서)\n`);

  const projId    = uid("proj");
  const startDate = new Date(2026, 1, 10, 9, 0, 0); // 2월 10일
  const endDate   = new Date(2026, 1, 24, 18, 0, 0);

  // ─── 부서별 반응률 적용해서 project_targets 생성 ────────────────────────────
  const ptRows = [];
  let offset = 20;

  // 부서 정렬 — 발송 순서도 부서별로 묶어서 현실적으로
  const deptOrder = [
    "개발팀","영업팀","마케팅팀","기획팀",
    "인사팀","재무팀","운영팀","고객지원팀",
    "디자인팀","법무팀","임원",
  ];

  for (const dept of deptOrder) {
    const ids = byDept[dept] ?? [];
    const rate = DEPT_RATES[dept] ?? { open: 45, click: 20, submit: 8 };

    for (const tid of ids) {
      const r = Math.random() * 100;
      const sentAt = addMin(startDate, offset);
      offset += rnd(1, 6);

      let status: string;
      let openedAt:    Date | null = null;
      let clickedAt:   Date | null = null;
      let submittedAt: Date | null = null;

      if (r < rate.submit) {
        status      = "submitted";
        openedAt    = addMin(sentAt,   rnd(10, 150));
        clickedAt   = addMin(openedAt, rnd(3,  50));
        submittedAt = addMin(clickedAt,rnd(1,  15));
      } else if (r < rate.click) {
        status    = "clicked";
        openedAt  = addMin(sentAt,   rnd(10, 200));
        clickedAt = addMin(openedAt, rnd(3,  80));
      } else if (r < rate.open) {
        status   = "opened";
        openedAt = addMin(sentAt, rnd(10, 360));
      } else {
        status = "no_response";
      }

      ptRows.push({
        id: uid("pt"), tenantId: TENANT_ID,
        projectId: projId, targetId: tid,
        trackingToken: uid("tok"),
        status, sendStatus: "sent",
        sentAt, openedAt, clickedAt, submittedAt,
      });
    }
  }

  // 집계
  const targetCount  = ptRows.length;
  const openCount    = ptRows.filter(p => p.openedAt).length;
  const clickCount   = ptRows.filter(p => p.clickedAt).length;
  const submitCount  = ptRows.filter(p => p.submittedAt).length;

  // 프로젝트 삽입
  await db.insert(projects).values({
    id: projId, tenantId: TENANT_ID,
    name: "2026 전 부서 경비 정산 사칭 훈련",
    description:
      "경비 정산 승인 기한 압박 시나리오. 전 부서 대상으로 부서별 보안 인식 수준 측정 및 취약 부서 식별 목적.",
    department: "전사", departmentTags: [
      "개발팀","영업팀","마케팅팀","기획팀",
      "인사팀","재무팀","운영팀","고객지원팀",
      "디자인팀","법무팀","임원",
    ],
    templateId: TMPL_EXPENSE, trainingPageId: TP_ID,
    fromName: "재무팀", fromEmail: "finance@company.co.kr",
    startDate, endDate,
    status: "완료",
    fiscalYear: 2026, fiscalQuarter: 1, weekOfYear: [7],
    targetCount, openCount, clickCount, submitCount,
  });

  // project_targets 청크 삽입
  const CHUNK = 100;
  for (let i = 0; i < ptRows.length; i += CHUNK) {
    await db.insert(projectTargets).values(ptRows.slice(i, i + CHUNK));
  }

  // sendJob
  await db.insert(sendJobs).values({
    id: uid("job"), tenantId: TENANT_ID, projectId: projId,
    status: "done",
    startedAt:  addMin(startDate, 5),
    finishedAt: addMin(startDate, Math.ceil(targetCount * 0.35) + 10),
    attempts: 1, totalCount: targetCount, successCount: targetCount, failCount: 0,
  });

  // 결과 출력
  console.log("  프로젝트: 2026 전 부서 경비 정산 사칭 훈련");
  console.log(`  기간: 2026-02-10 ~ 2026-02-24  |  fiscalYear 2026 Q1\n`);
  console.log("  부서별 결과:");

  let deptOffset = 0;
  for (const dept of deptOrder) {
    const ids  = byDept[dept] ?? [];
    const dPts = ptRows.slice(deptOffset, deptOffset + ids.length);
    deptOffset += ids.length;
    const dOpen   = dPts.filter(p => p.openedAt).length;
    const dClick  = dPts.filter(p => p.clickedAt).length;
    const dSubmit = dPts.filter(p => p.submittedAt).length;
    const n = dPts.length;
    console.log(
      `    ${dept.padEnd(8)} ${String(n).padStart(3)}명` +
      `  오픈 ${((dOpen   / n) * 100).toFixed(0).padStart(2)}%` +
      `  클릭 ${((dClick  / n) * 100).toFixed(0).padStart(2)}%` +
      `  제출 ${((dSubmit / n) * 100).toFixed(0).padStart(2)}%`,
    );
  }

  console.log(`\n  합계: 발송 ${targetCount}명 / 오픈 ${openCount} / 클릭 ${clickCount} / 제출 ${submitCount}`);
  console.log(`  오픈율 ${((openCount/targetCount)*100).toFixed(1)}%  클릭율 ${((clickCount/targetCount)*100).toFixed(1)}%  제출율 ${((submitCount/targetCount)*100).toFixed(1)}%`);
  console.log("\n✅ 완료!");
  process.exit(0);
}

main().catch(err => { console.error("❌ 에러:", err); process.exit(1); });
