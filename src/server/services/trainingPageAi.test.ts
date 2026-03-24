import { describe, expect, it } from "vitest";
import { trainingPageAiRequestSchema } from "@shared/trainingPageAi";
import { buildTrainingPageAiPrompt } from "./trainingPageAi";

describe("trainingPageAi helpers", () => {
  it("문체를 필수 입력으로 검증한다", () => {
    expect(() =>
      trainingPageAiRequestSchema.parse({
        prompt: "",
        generateCount: 4,
        preservedCandidates: [],
      }),
    ).toThrow();
  });

  it("첨부가 있으면 첨부 우선 재현 규칙과 기본 안전 안내를 포함한다", () => {
    const prompt = buildTrainingPageAiPrompt({
      tone: "formal",
      prompt: "계정 잠금 해제보다 주소 확인 안내를 더 강조해 주세요.",
      generateCount: 2,
      preservedCandidates: [],
      referenceAttachment: {
        name: "training-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "ZmFrZS1pbWFnZQ==",
      },
    });

    expect(prompt).toContain("Global generation mode:");
    expect(prompt).toContain("attachment-assisted generation with attachment-locked reproduction");
    expect(prompt).toContain("attachment-locked reproduction");
    expect(prompt).toContain("reproduce the uploaded file as closely as possible");
    expect(prompt).toContain("Do not include links, anchor tags, buttons");
    expect(prompt).toContain("- tone: 공식형");
    expect(prompt).toContain("scenario label: 피싱 대응 기본 수칙");
    expect(prompt).toContain("공식 사이트, 공식 앱, 사내 포털 등 신뢰 가능한 경로로 직접 접속해 확인하라고 안내합니다.");
    expect(prompt).toContain("extra requirements: 계정 잠금 해제보다 주소 확인 안내를 더 강조해 주세요.");
    expect(prompt).toContain("{{SUBMIT_URL}} is not required for training-page output.");
    expect(prompt).toContain("training-reference.png");
    expect(prompt).toContain("You are the world's best frontend engineer.");
    expect(prompt).toContain("100% pixel-perfect");
    expect(prompt).toContain("Tailwind-style utility composition");
    expect(prompt).toContain("real HTML structure rather than returning the raw image itself");
  });

  it("첨부가 없으면 내부 레퍼런스 기준 생성 모드를 사용한다", () => {
    const prompt = buildTrainingPageAiPrompt({
      tone: "informational",
      prompt: "보안팀 공지처럼 자연스럽게 보여 주세요.",
      generateCount: 2,
      preservedCandidates: [],
    });

    expect(prompt).toContain(
      "internal-reference-guided generation without uploaded reference attachment",
    );
    expect(prompt).toContain(
      "training page generation mode: internal reference-guided generation",
    );
    expect(prompt).toContain(
      "If no attachment is provided, build the output from the internal reference baseline while adapting it to the user's requested tone and extra requirements.",
    );
    expect(prompt).toContain("Reference training-page HTML shape:");
  });
});
