/**
 * scripts/seed-targets-250.ts
 * test001 테넌트에 훈련 대상자 250명 삽입
 * 실행: npx tsx scripts/seed-targets-250.ts
 */

import "dotenv/config";
import { db } from "../src/server/db";
import { targets } from "../src/server/db/schema";

const TENANT_ID = "b234c9cc-4218-4754-91ad-e66400b4da00";

// ─── 이름 풀 ───────────────────────────────────────────────────────────────────

const SURNAMES = [
  "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
  "한", "오", "서", "신", "권", "황", "안", "송", "류", "전",
  "홍", "고", "문", "손", "양", "배", "백", "허", "남", "심",
  "노", "하", "주", "구", "유", "나", "진", "엄", "차", "성",
];

const GIVEN_MALE = [
  "민준", "서준", "도윤", "예준", "시우", "주원", "하준", "지후", "준서", "준우",
  "현우", "태양", "지훈", "건우", "우진", "성민", "재원", "동현", "지원", "현준",
  "태준", "승우", "재준", "민재", "준혁", "성현", "진우", "재현", "동우", "현석",
  "승현", "민혁", "재영", "태민", "도현", "정우", "민성", "준영", "성훈", "재민",
];

const GIVEN_FEMALE = [
  "서연", "서윤", "지아", "서현", "민서", "하은", "윤서", "지유", "채원", "수아",
  "지원", "예은", "나은", "다은", "지민", "수민", "아린", "예린", "하린", "소율",
  "지현", "수현", "유진", "세연", "혜원", "미래", "은지", "수정", "지혜", "혜진",
  "소연", "민지", "예진", "나연", "소희", "유나", "채은", "하영", "수진", "지은",
];

// 이름 → 영문 이니셜 변환 (이메일용)
const ROMANIZE: Record<string, string> = {
  김: "kim", 이: "lee", 박: "park", 최: "choi", 정: "jung", 강: "kang",
  조: "jo", 윤: "yoon", 장: "jang", 임: "lim", 한: "han", 오: "oh",
  서: "seo", 신: "shin", 권: "kwon", 황: "hwang", 안: "ahn", 송: "song",
  류: "ryu", 전: "jeon", 홍: "hong", 고: "ko", 문: "moon", 손: "son",
  양: "yang", 배: "bae", 백: "baek", 허: "heo", 남: "nam", 심: "sim",
  노: "noh", 하: "ha", 주: "joo", 구: "koo", 유: "yoo", 나: "na",
  진: "jin", 엄: "uhm", 차: "cha", 성: "sung",
  민준: "minjun", 서준: "seojun", 도윤: "doyun", 예준: "yejun", 시우: "siwoo",
  주원: "juwon", 하준: "hajun", 지후: "jihoo", 준서: "junseo", 준우: "junwoo",
  현우: "hyunwoo", 태양: "taeyang", 지훈: "jihoon", 건우: "gunwoo", 우진: "woojin",
  성민: "sungmin", 재원: "jaewon", 동현: "donghyun", 지원: "jiwon", 현준: "hyunjun",
  태준: "taejun", 승우: "seungwoo", 재준: "jaejun", 민재: "minjae", 준혁: "junhyuk",
  성현: "sunghyun", 진우: "jinwoo", 재현: "jaehyun", 동우: "dongwoo", 현석: "hyunsuk",
  승현: "seunghyun", 민혁: "minhyuk", 재영: "jaeyoung", 태민: "taemin", 도현: "dohyun",
  정우: "jungwoo", 민성: "minsung", 준영: "junyoung", 성훈: "sunghoon", 재민: "jaemin",
  서연: "seoyeon", 서윤: "seoyoon", 지아: "jia", 서현: "seohyun", 민서: "minseo",
  하은: "haeun", 윤서: "yunseo", 지유: "jiyu", 채원: "chaewon", 수아: "sua",
  예은: "yeeun", 나은: "naeun", 다은: "daeun", 지민: "jimin", 수민: "sumin",
  아린: "arin", 예린: "yerin", 하린: "harin", 소율: "soyul",
  지현: "jihyun", 수현: "suhyun", 유진: "yujin", 세연: "seyeon", 혜원: "hyewon",
  미래: "mirae", 은지: "eunji", 수정: "sujeong", 지혜: "jihye", 혜진: "hyejin",
  소연: "soyeon", 민지: "minji", 예진: "yejin", 나연: "nayeon", 소희: "sohee",
  유나: "yuna", 채은: "chaeeun", 하영: "hayoung", 수진: "sujin", 지은: "jieun",
};

function romanize(s: string): string {
  return ROMANIZE[s] ?? s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── 부서 정의 ─────────────────────────────────────────────────────────────────

interface DeptConfig {
  name: string;
  tags: string[];
  count: number;
}

const DEPARTMENTS: DeptConfig[] = [
  { name: "개발팀",     tags: ["개발팀"],           count: 45 },
  { name: "영업팀",     tags: ["영업팀"],           count: 40 },
  { name: "마케팅팀",   tags: ["마케팅팀"],         count: 30 },
  { name: "기획팀",     tags: ["기획팀"],           count: 25 },
  { name: "인사팀",     tags: ["인사팀"],           count: 20 },
  { name: "재무팀",     tags: ["재무팀"],           count: 20 },
  { name: "운영팀",     tags: ["운영팀"],           count: 20 },
  { name: "고객지원팀", tags: ["고객지원팀"],       count: 18 },
  { name: "디자인팀",   tags: ["디자인팀"],         count: 15 },
  { name: "법무팀",     tags: ["법무팀"],           count: 10 },
  { name: "임원",       tags: ["임원", "C-Level"],  count: 7  },
];
// 합계: 250명

// ─── 대상자 생성 ───────────────────────────────────────────────────────────────

interface TargetRow {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  department: string;
  tags: string[];
  status: string;
}

function uid() {
  return `tgt-${Math.random().toString(36).slice(2, 10)}`;
}

function pickRandom<T>(arr: T[], used: Set<number>): { val: T; idx: number } | null {
  const available = arr.map((_, i) => i).filter((i) => !used.has(i));
  if (available.length === 0) return null;
  const idx = available[Math.floor(Math.random() * available.length)];
  used.add(idx);
  return { val: arr[idx], idx };
}

const rows: TargetRow[] = [];
const usedEmails = new Set<string>();
let seq = 1;

const usedSurname = new Set<number>();
const usedMale = new Set<number>();
const usedFemale = new Set<number>();

for (const dept of DEPARTMENTS) {
  for (let i = 0; i < dept.count; i++) {
    // 성씨 풀이 고갈되면 재사용
    if (usedSurname.size >= SURNAMES.length) usedSurname.clear();
    const surname = pickRandom(SURNAMES, usedSurname)!;

    const isMale = seq % 2 === 1;
    const givenPool = isMale ? GIVEN_MALE : GIVEN_FEMALE;
    const usedGiven = isMale ? usedMale : usedFemale;
    if (usedGiven.size >= givenPool.length) usedGiven.clear();
    const given = pickRandom(givenPool, usedGiven)!;

    const fullName = surname.val + given.val;

    // 이메일: 성_이름_seq@company.co.kr
    const base = `${romanize(surname.val)}.${romanize(given.val)}`;
    let email = `${base}@company.co.kr`;
    if (usedEmails.has(email)) {
      email = `${base}${seq}@company.co.kr`;
    }
    usedEmails.add(email);

    rows.push({
      id: uid(),
      tenantId: TENANT_ID,
      name: fullName,
      email,
      department: dept.name,
      tags: dept.tags,
      status: "active",
    });
    seq++;
  }
}

// ─── 삽입 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🌱 훈련 대상자 ${rows.length}명 삽입 시작...\n`);

  // 부서별 요약
  for (const dept of DEPARTMENTS) {
    const cnt = rows.filter((r) => r.department === dept.name).length;
    console.log(`  ${dept.name.padEnd(8)}: ${cnt}명`);
  }
  console.log(`  ${"합계".padEnd(8)}: ${rows.length}명\n`);

  // 청크 단위로 삽입
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(targets).values(rows.slice(i, i + CHUNK));
    process.stdout.write(`  삽입 중... ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }

  console.log("\n✅ 완료!");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 에러:", err);
  process.exit(1);
});
