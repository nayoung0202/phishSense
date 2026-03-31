import { describe, expect, it, vi } from "vitest";
import {
  estimateTemplateAiCredits,
  findUnsafeTemplateHtmlIssues,
  resolveTemplateAiReferenceAttachmentKind,
  templateAiCandidateSchema,
  templateAiRequestSchema,
  validateTemplateAiReferenceAttachmentMeta,
} from "@shared/templateAi";
import { buildTemplateAiPrompt } from "./templateAi";

describe("templateAi helpers", () => {
  it("AI 템플릿 생성 예상 크레딧은 고정 2크레딧이다", () => {
    const low = estimateTemplateAiCredits({
      topic: "shipping",
      tone: "formal",
      difficulty: "easy",
      prompt: "",
      candidateCount: 1,
    });
    const high = estimateTemplateAiCredits({
      topic: "account-security",
      tone: "urgent-request",
      difficulty: "hard",
      prompt: "로그인 재확인과 보안 경고 문구를 더 구체적으로 반영해 주세요.",
      candidateCount: 4,
    });

    expect(low).toBe(2);
    expect(high).toBe(2);
  });

  it("외부 리소스와 스크립트 사용을 차단한다", () => {
    const issues = findUnsafeTemplateHtmlIssues(`
      <script>alert(1)</script>
      <img src="https://example.com/a.png" />
      <a href="javascript:alert(1)">click</a>
    `);

    expect(issues).toContain("script 태그는 사용할 수 없습니다.");
    expect(issues).toContain("외부 리소스 URL은 사용할 수 없습니다.");
    expect(issues).toContain("javascript: URL은 사용할 수 없습니다.");
  });

  it("style 태그가 포함된 후보 스키마를 name 없이 파싱한다", () => {
    const candidate = templateAiCandidateSchema.parse({
      id: "candidate-1",
      subject: "급여 명세 확인 안내",
      body: '<style>body{font-family:sans-serif;}</style><a href="{{LANDING_URL}}">확인</a>',
      maliciousPageContent:
        '<style>form{display:grid;gap:12px;}</style><form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
      summary: "급여 공지 위장 후보",
    });

    expect(candidate.subject).toBe("급여 명세 확인 안내");
    expect(candidate).not.toHaveProperty("name");
  });

  it("preservedCandidates는 subject만 있어도 통과한다", () => {
    const payload = templateAiRequestSchema.parse({
      topic: "shipping",
      customTopic: "",
      tone: "formal",
      difficulty: "medium",
      prompt: "",
      generateCount: 3,
      preservedCandidates: [{ id: "keep-1", subject: "배송 일정 재확인 요청" }],
    });

    expect(payload.preservedCandidates).toEqual([
      { id: "keep-1", subject: "배송 일정 재확인 요청" },
    ]);
  });

  it("참고 첨부파일 메타를 검증한다", () => {
    expect(
      validateTemplateAiReferenceAttachmentMeta({
        name: "mail-reference.html",
        mimeType: "text/html",
        size: 1024,
      }),
    ).toBeNull();
    expect(
      validateTemplateAiReferenceAttachmentMeta({
        name: "landing-reference.png",
        mimeType: "image/png",
        size: 2048,
      }),
    ).toBeNull();
    expect(
      validateTemplateAiReferenceAttachmentMeta({
        name: "landing-reference.pdf",
        mimeType: "application/pdf",
        size: 2048,
      }),
    ).toBeTruthy();
    expect(
      resolveTemplateAiReferenceAttachmentKind({
        name: "mail-reference.html",
        mimeType: "text/html",
      }),
    ).toBe("html");
    expect(
      resolveTemplateAiReferenceAttachmentKind({
        name: "landing-reference.png",
        mimeType: "image/png",
      }),
    ).toBe("image");
  });

  it("기타 주제를 선택하면 customTopic을 필수로 검증한다", () => {
    expect(() =>
      templateAiRequestSchema.parse({
        topic: "other",
        customTopic: "",
        tone: "informational",
        difficulty: "medium",
        prompt: "",
        generateCount: 4,
        preservedCandidates: [],
      }),
    ).toThrow("기타를 선택한 경우 주제를 직접 입력해 주세요.");
  });

  it("기타 주제 입력값을 프롬프트에 반영한다", () => {
    const prompt = buildTemplateAiPrompt({
      topic: "other",
      customTopic: "사내 행사 안내",
      tone: "informational",
      difficulty: "medium",
      prompt: "행사 참석 요청 문구를 포함해 주세요.",
      generateCount: 2,
      preservedCandidates: [],
    });

    expect(prompt).toContain("- topic: 사내 행사 안내");
    expect(prompt).toContain("- tone: 안내형");
    expect(prompt).toContain("- difficulty: 보통");
  });

  it("악성본문 프롬프트는 별도 훈련 링크 대신 제출 CTA를 기준으로 요구한다", () => {
    const prompt = buildTemplateAiPrompt({
      topic: "shipping",
      customTopic: "",
      tone: "formal",
      difficulty: "medium",
      prompt: "배송 실패 안내처럼 보이게 해 주세요.",
      generateCount: 2,
      preservedCandidates: [],
      mailBodyReferenceAttachment: {
        name: "mail-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent: "<div>메일 참고 레이아웃</div>",
      },
      maliciousPageReferenceAttachment: {
        name: "landing-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "ZmFrZS1pbWFnZQ==",
      },
    });

    expect(prompt).toContain(
      "The main submit CTA in the malicious page must route to {{TRAINING_URL}} via form action or submit formaction.",
    );
    expect(prompt).toContain(
      "Do not add a separate standalone training guide link unless the user explicitly asks for it.",
    );
    expect(prompt).not.toContain('href="{{TRAINING_URL}}" target="_blank" rel="noopener noreferrer"');
    expect(prompt).not.toContain("visible anchor link that points to {{TRAINING_URL}}");
    expect(prompt).not.toContain("secondary training link below the form");
    expect(prompt).toContain("Global generation mode:");
    expect(prompt).toContain("attachment-assisted generation with attachment-locked reproduction");
    expect(prompt).toContain("Reference attachments:");
    expect(prompt).toContain("mail-reference.html");
    expect(prompt).toContain("<div>메일 참고 레이아웃</div>");
    expect(prompt).toContain("landing-reference.png");
    expect(prompt).toContain("attachment-locked reproduction");
    expect(prompt).toContain("Recreate this mail body as closely as possible");
    expect(prompt).toContain("Recreate the uploaded file as closely as possible");
    expect(prompt).toContain("You are the world's best frontend engineer.");
    expect(prompt).toContain("100% pixel-perfect");
    expect(prompt).toContain("Tailwind-style utility composition");
    expect(prompt).toContain("real HTML structure rather than returning the raw image itself");
    expect(prompt).toContain("If no attachment is provided for a section, build that section from the internal reference baseline while adapting it to the user's requested topic, tone, difficulty, and extra requirements.");
    expect(prompt).toContain("If an attachment is provided for a section, reproduce that section as closely as possible");
    expect(prompt).toContain("Make the result feel plausible and realistic enough");
  });

  it("첨부가 없으면 내부 레퍼런스 기준 생성 모드를 사용한다", () => {
    const prompt = buildTemplateAiPrompt({
      topic: "shipping",
      customTopic: "",
      tone: "informational",
      difficulty: "easy",
      prompt: "사내 공지처럼 보이게 해 주세요.",
      generateCount: 2,
      preservedCandidates: [],
    });

    expect(prompt).toContain(
      "internal-reference-guided generation without uploaded section references",
    );
    expect(prompt).toContain(
      "mail body generation mode: internal reference-guided generation",
    );
    expect(prompt).toContain(
      "malicious page generation mode: internal reference-guided generation",
    );
    expect(prompt).toContain("Reference mail-body HTML shape:");
    expect(prompt).toContain("Reference malicious-page HTML shape:");
  });

  it("프롬프트에 현재 날짜 기준을 넣어 과거 연도 생성을 억제한다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-19T09:00:00Z"));

    try {
      const prompt = buildTemplateAiPrompt({
        topic: "shipping",
        customTopic: "",
        tone: "urgent-request",
        difficulty: "medium",
        prompt: "",
        generateCount: 2,
        preservedCandidates: [],
      });

      expect(prompt).toContain("Current date context:");
      expect(prompt).toContain("- today: 2026-03-19");
      expect(prompt).toContain("- current year: 2026");
      expect(prompt).toContain("Do not mention past years such as 2023");
    } finally {
      vi.useRealTimers();
    }
  });
});
