import { describe, expect, it } from "vitest";
import type { InsertProject, Project } from "../../../shared/schema";
import {
  buildTestEmailHtml,
  collectDepartmentTagsFromTargets,
  shouldCompleteProject,
  shouldStartScheduledProject,
  splitDepartmentEntries,
  validateProjectPayload,
} from "./projectsShared";

const baseProject: Project = {
  id: "project-1",
  name: "테스트 프로젝트",
  description: null,
  department: null,
  departmentTags: [],
  templateId: null,
  trainingPageId: null,
  trainingLinkToken: "token-1",
  smtpAccountId: null,
  fromName: null,
  fromEmail: null,
  timezone: "Asia/Seoul",
  notificationEmails: [],
  startDate: new Date("2025-01-01T00:00:00Z"),
  endDate: new Date("2025-01-02T00:00:00Z"),
  status: "예약",
  targetCount: 0,
  openCount: 0,
  clickCount: 0,
  submitCount: 0,
  sendValidationError: null,
  fiscalYear: null,
  fiscalQuarter: null,
  weekOfYear: [],
  createdAt: new Date("2024-12-31T00:00:00Z"),
};

const buildProject = (overrides: Partial<Project> = {}): Project => ({
  ...baseProject,
  ...overrides,
});

describe("shouldStartScheduledProject", () => {
  it("예약 상태이고 시작 시간이 지났으면 true를 반환한다", () => {
    const now = new Date("2025-01-02T09:00:00Z");
    const project = buildProject({
      status: "예약",
      startDate: new Date("2025-01-02T08:00:00Z"),
    });

    expect(shouldStartScheduledProject(project, now)).toBe(true);
  });

  it("예약 상태지만 시작 시간이 미래면 false를 반환한다", () => {
    const now = new Date("2025-01-02T09:00:00Z");
    const project = buildProject({
      status: "예약",
      startDate: new Date("2025-01-02T10:00:00Z"),
    });

    expect(shouldStartScheduledProject(project, now)).toBe(false);
  });

  it("예약 상태가 아니면 false를 반환한다", () => {
    const now = new Date("2025-01-02T09:00:00Z");
    const project = buildProject({
      status: "진행중",
      startDate: new Date("2025-01-02T08:00:00Z"),
    });

    expect(shouldStartScheduledProject(project, now)).toBe(false);
  });
});

describe("shouldCompleteProject", () => {
  it("종료 시간이 지났고 완료 상태가 아니면 true를 반환한다", () => {
    const now = new Date("2025-01-03T09:00:00Z");
    const project = buildProject({
      status: "진행중",
      endDate: new Date("2025-01-03T08:00:00Z"),
    });

    expect(shouldCompleteProject(project, now)).toBe(true);
  });

  it("임시 상태면 false를 반환한다", () => {
    const now = new Date("2025-01-03T09:00:00Z");
    const project = buildProject({
      status: "임시",
      endDate: new Date("2025-01-03T08:00:00Z"),
    });

    expect(shouldCompleteProject(project, now)).toBe(false);
  });
});

describe("splitDepartmentEntries", () => {
  it("콤마로 구분된 부서를 배열로 분리한다", () => {
    expect(splitDepartmentEntries("영업본부, 개발본부 1팀, 인사팀")).toEqual([
      "영업본부",
      "개발본부 1팀",
      "인사팀",
    ]);
  });

  it("문자열이 아니면 빈 배열을 반환한다", () => {
    expect(splitDepartmentEntries(null)).toEqual([]);
    expect(splitDepartmentEntries(undefined)).toEqual([]);
  });
});

describe("collectDepartmentTagsFromTargets", () => {
  it("대상 목록에서 부서 태그를 중복 제거하여 정렬한다", () => {
    const tags = collectDepartmentTagsFromTargets([
      { department: "영업본부, 플랫폼팀" },
      { department: "플랫폼팀" },
      { department: "인사팀" },
    ]);

    expect(tags).toEqual(["영업본부", "인사팀", "플랫폼팀"]);
  });

  it("임시 상태 프로젝트는 이름과 일정만 있으면 통과한다", () => {
    const draftPayload = {
      name: "임시 프로젝트",
      templateId: "",
      trainingPageId: "",
      smtpAccountId: "",
      fromName: "",
      fromEmail: "",
      startDate: new Date("2026-03-06T00:00:00.000Z"),
      endDate: new Date("2026-03-06T00:00:00.000Z"),
      status: "임시",
      targetCount: 0,
    } as unknown as InsertProject;

    const issues = validateProjectPayload(draftPayload, {
      allowTemporaryDraft: true,
    });

    expect(issues).toEqual([]);
  });

  it("임시 상태 프로젝트는 종료일이 시작일보다 빠르면 실패한다", () => {
    const draftPayload = {
      name: "임시 프로젝트",
      templateId: "",
      trainingPageId: "",
      smtpAccountId: "",
      fromName: "",
      fromEmail: "",
      startDate: new Date("2026-03-09T00:00:00.000Z"),
      endDate: new Date("2026-03-08T00:00:00.000Z"),
      status: "임시",
      targetCount: 0,
    } as unknown as InsertProject;

    const issues = validateProjectPayload(draftPayload, {
      allowTemporaryDraft: true,
    });

    expect(issues).toEqual([
      {
        field: "endDate",
        code: "invalid_range",
        message: "종료일은 시작일보다 늦어야 합니다.",
      },
    ]);
  });
});

describe("buildTestEmailHtml", () => {
  it("메일 래퍼에 깨진 문자열 없이 정상 한국어 문구를 포함한다", () => {
    const html = buildTestEmailHtml("<p>본문</p>", "na9173@naver.com");

    expect(html).toContain("이 메일은 사전 점검을 위한 테스트 발송입니다.");
    expect(html).toContain("수신자: na9173@naver.com");
    expect(html).toContain("실사용자에게 자동 전송되지 않습니다.");
    expect(html).not.toMatch(/[筌獄袁癒꺜沃]/);
  });
});

describe("validateProjectPayload", () => {
  const invalidPayload = {
    name: "",
    templateId: "",
    trainingPageId: "",
    smtpAccountId: "",
    fromName: "",
    fromEmail: "invalid-email",
    startDate: null,
    endDate: null,
    targetCount: -1,
  } as unknown as InsertProject;

  it("깨진 문자열 대신 정상 한국어 검증 메시지를 반환한다", () => {
    const issues = validateProjectPayload(invalidPayload);
    const messages = issues.map((issue) => issue.message);

    expect(messages).toContain("프로젝트명을 입력하세요.");
    expect(messages).toContain("템플릿을 선택하세요.");
    expect(messages).toContain("훈련 안내 페이지를 선택하세요.");
    expect(messages).toContain("발송 설정을 선택하세요.");
    expect(messages).toContain("발신자 이름을 입력하세요.");
    expect(messages).toContain("올바른 이메일 형식이 아닙니다.");
    expect(messages).toContain("시작일을 입력하세요.");
    expect(messages).toContain("대상자 수는 0 이상이어야 합니다.");
    expect(messages.join(" ")).not.toMatch(/[筌獄袁癒꺜沃]/);
  });
});
