import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrainingPageAiRequest } from "@shared/trainingPageAi";
import {
  generateTrainingPageAiCandidates,
  TrainingPageAiServiceError,
} from "./trainingPageAi";

const baseRequest: TrainingPageAiRequest = {
  tone: "informational",
  prompt: "",
  generateCount: 4,
  preservedCandidates: [],
};

const buildGeminiUnavailableResponse = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 503,
        message:
          "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
        status: "UNAVAILABLE",
      },
    }),
    {
      status: 503,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

const buildGeminiSuccessResponse = (
  candidateCount: number,
  content = "<div><p>학습 안내를 확인해 주세요.</p></div>",
) =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  candidates: Array.from({ length: candidateCount }, (_, index) => ({
                    name: `훈련 후보 ${index + 1}`,
                    description: `설명 ${index + 1}`,
                    content,
                    summary: `요약 ${index + 1}`,
                  })),
                }),
              },
            ],
          },
        },
      ],
      usageMetadata: {
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 300,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

describe("generateTrainingPageAiCandidates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("CLAUDE_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("Gemini 503 오류를 재시도 가능한 서비스 오류로 변환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiUnavailableResponse());

    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = generateTrainingPageAiCandidates(baseRequest).catch((caught) => caught);

    await vi.runAllTimersAsync();

    const error = await resultPromise;

    expect(error).toBeInstanceOf(TrainingPageAiServiceError);
    expect(error).toMatchObject({
      status: 503,
      code: "gemini_service_unavailable",
      retryable: true,
      message: "AI 훈련안내페이지 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("정상 응답이면 SUBMIT_URL 없이도 후보를 반환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiSuccessResponse(4));

    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = generateTrainingPageAiCandidates(baseRequest);

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          name: "훈련 후보 1",
          content: "<div><p>학습 안내를 확인해 주세요.</p></div>",
        }),
      ]),
      usage: expect.objectContaining({
        promptTokenCount: 100,
        candidatesTokenCount: 200,
        totalTokenCount: 300,
        model: "gemini-2.5-flash-lite",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ANTHROPIC_API_KEY가 있으면 Claude messages 엔드포인트를 사용한다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-key");
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                candidates: [
                  {
                    name: "훈련 후보 1",
                    description: "설명 1",
                    content: "<div><p>학습 안내를 확인해 주세요.</p></div>",
                    summary: "요약 1",
                  },
                ],
              }),
            },
          ],
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 111,
            output_tokens: 222,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          name: "훈련 후보 1",
        }),
      ]),
      usage: expect.objectContaining({
        promptTokenCount: 111,
        candidatesTokenCount: 222,
        totalTokenCount: 333,
        model: "claude-sonnet-4-20250514",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-api-key": "anthropic-key",
        }),
      }),
    );
  });

  it("providerApiKeys가 전달되면 env보다 tenant BYOK를 우선 사용한다", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                candidates: [
                  {
                    name: "훈련 후보 1",
                    description: "설명 1",
                    content: "<div><p>학습 안내를 확인해 주세요.</p></div>",
                    summary: "요약 1",
                  },
                ],
              }),
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates(
        {
          ...baseRequest,
          generateCount: 1,
        },
        {
          providerApiKeys: {
            anthropicApiKey: "tenant-anthropic-key",
          },
        },
      ),
    ).resolves.toMatchObject({
      usage: expect.objectContaining({
        model: "claude-sonnet-4-20250514",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-api-key": "tenant-anthropic-key",
        }),
      }),
    );
  });

  it("단순 안내형 HTML도 안전 규칙만 통과하면 후보로 반환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(1, "<section><p>학습 안내를 다시 확인해 주세요.</p></section>"),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          content: "<section><p>학습 안내를 다시 확인해 주세요.</p></section>",
        }),
      ]),
    });
  });

  it("응답에 링크나 버튼이 포함돼도 후보 저장 전 제거한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(
          1,
          '<section><a href="https://example.com">자세히 보기</a><button type="button">확인</button></section>',
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          content: "<section>자세히 보기확인</section>",
        }),
      ]),
    });
  });

  it("첨부 재현 결과에 form과 input이 있어도 비상호작용 구조로 자동 보정한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(
          1,
          '<section><form action="/submit"><input type="text" placeholder="사번" /><input type="submit" value="확인" /></form></section>',
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          content: "<section><span>사번</span>확인</section>",
        }),
      ]),
    });
  });

  it("링크와 버튼이 섞인 첨부 재현 결과도 기존 문구를 최대한 유지한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(
          1,
          '<main><a href="/notice"><strong>보안 공지 확인</strong></a><button type="button">다음</button></main>',
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          content: "<main><strong>보안 공지 확인</strong>다음</main>",
        }),
      ]),
    });
  });

  it("응답이 json 코드블록으로 감싸져 있어도 후보를 파싱한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: [
                      "```json",
                      JSON.stringify({
                        candidates: [
                          {
                            name: "훈련 후보 1",
                            description: "설명 1",
                            content:
                              '<section><form><input type="submit" value="확인" /></form></section>',
                            summary: "요약 1",
                          },
                        ],
                      }),
                      "```",
                    ].join("\n"),
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 200,
            totalTokenCount: 300,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTrainingPageAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          content: "<section>확인</section>",
        }),
      ]),
    });
  });

  it("요청한 수보다 적은 후보가 와도 유효 후보가 있으면 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(buildGeminiSuccessResponse(1));

    vi.stubGlobal("fetch", fetchMock);

    await expect(generateTrainingPageAiCandidates(baseRequest)).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          name: "훈련 후보 1",
        }),
      ]),
    });
  });

  it("외부 리소스와 스크립트가 포함된 첨부 재현 결과도 안전한 안내 HTML로 보정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildGeminiSuccessResponse(
        1,
        `
          <html>
            <head>
              <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR" />
            </head>
            <body>
              <img src="https://example.com/logo.png" alt="logo" />
              <form>
                <input type="text" placeholder="사번" onkeypress="alert(1)" />
                <button onclick="submit()">확인</button>
              </form>
              <script>alert("x")</script>
            </body>
          </html>
        `,
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.content).toContain("<span>사번</span>");
    expect(result.candidates[0]?.content).toContain("확인");
    expect(result.candidates[0]?.content).not.toContain("<script");
    expect(result.candidates[0]?.content).not.toContain("<link");
    expect(result.candidates[0]?.content).not.toContain("onkeypress=");
    expect(result.candidates[0]?.content).not.toContain("https://example.com/logo.png");
  });

  it("이미지 첨부가 있으면 훈련안내페이지 결과 HTML에 업로드 원본 이미지를 직접 재사용한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiSuccessResponse(1, "<section><p>학습 안내를 확인해 주세요.</p></section>"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
      referenceAttachment: {
        name: "training-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "dHJhaW5pbmctaW1hZ2U=",
      },
    });

    expect(result.candidates[0]?.content).toContain('data-training-page-reference-root="true"');
    expect(result.candidates[0]?.content).toContain(
      "data:image/png;base64,dHJhaW5pbmctaW1hZ2U=",
    );
    expect(result.candidates[0]?.content).not.toContain("학습 안내를 확인해 주세요.");
  });

  it("OPENAI_API_KEY가 있으면 OpenAI chat completions 엔드포인트를 사용한다", async () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("GEMINI_API_KEY", "");

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  candidates: [
                    {
                      name: "훈련 후보 1",
                      description: "설명 1",
                      content: "<section><p>학습 안내를 확인해 주세요.</p></section>",
                      summary: "요약 1",
                    },
                  ],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 240,
            total_tokens: 360,
          },
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.openai.com/v1/chat/completions");
    expect(result.usage).toMatchObject({
      promptTokenCount: 120,
      candidatesTokenCount: 240,
      totalTokenCount: 360,
      model: "gpt-4.1-mini",
    });
    expect(result.candidates[0]?.name).toBe("훈련 후보 1");
  });

  it("HTML 첨부가 있으면 AI가 조금 다르게 써도 업로드 원본 HTML을 우선 사용한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(1, "<section><p>AI가 다시 쓴 안내 문구</p></section>"),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
      referenceAttachment: {
        name: "training-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent:
          '<section><a href="https://example.com">업로드 안내 원본</a><button>확인</button></section>',
      },
    });

    expect(result.candidates[0]?.content).toContain("업로드 안내 원본");
    expect(result.candidates[0]?.content).not.toContain("AI가 다시 쓴 안내 문구");
    expect(result.candidates[0]?.content).toBe(
      '<div data-training-page-reference-root="true"><section><a href="#">업로드 안내 원본</a><button>확인</button></section></div>',
    );
  });

  it("HTML 첨부의 body 배경과 style 태그를 최대한 유지한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(1, "<section><p>AI가 다시 쓴 안내 문구</p></section>"),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
      referenceAttachment: {
        name: "training-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent: `
          <html>
            <head>
              <style>
                .notice-card { border: 2px solid #ff4d3d; }
              </style>
            </head>
            <body style="background:#fdf0f0;padding:48px;">
              <section class="notice-card">원본 안내 문구</section>
            </body>
          </html>
        `,
      },
    });

    expect(result.candidates[0]?.content).toContain(".notice-card");
    expect(result.candidates[0]?.content).toContain('style="background:#fdf0f0;padding:48px;"');
    expect(result.candidates[0]?.content).toContain("원본 안내 문구");
    expect(result.candidates[0]?.content).not.toContain("AI가 다시 쓴 안내 문구");
  });

  it("HTML 첨부의 body/html selector 스타일을 reference root 기준으로 보존한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        buildGeminiSuccessResponse(1, "<section><p>AI가 다시 쓴 안내 문구</p></section>"),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
      referenceAttachment: {
        name: "training-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent: `
          <html>
            <head>
              <style>
                body { background: #fdf0f0; padding: 48px; }
                html, body { min-height: 100%; }
              </style>
            </head>
            <body>
              <section>원본 안내 문구</section>
            </body>
          </html>
        `,
      },
    });

    expect(result.candidates[0]?.content).toContain('[data-training-page-reference-root="true"]');
    expect(result.candidates[0]?.content).toContain("background: #fdf0f0");
    expect(result.candidates[0]?.content).toContain("min-height: 100%");
    expect(result.candidates[0]?.content).toContain("원본 안내 문구");
  });

  it("이미지 참고 첨부가 있으면 Gemini 요청 parts에 inlineData를 포함한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(buildGeminiSuccessResponse(1));

    vi.stubGlobal("fetch", fetchMock);

    await generateTrainingPageAiCandidates({
      ...baseRequest,
      generateCount: 1,
      referenceAttachment: {
        name: "training-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "ZmFrZS1pbWFnZQ==",
      },
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      contents: Array<{
        parts: Array<{
          text?: string;
          inlineData?: {
            mimeType: string;
            data: string;
          };
        }>;
      }>;
    };

    expect(requestBody.contents[0]?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("training-reference.png"),
        }),
        expect.objectContaining({
          inlineData: {
            mimeType: "image/png",
            data: "ZmFrZS1pbWFnZQ==",
          },
        }),
      ]),
    );
  });
});
