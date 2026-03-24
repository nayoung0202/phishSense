import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateAiRequest } from "@shared/templateAi";
import {
  generateTemplateAiCandidates,
  TemplateAiServiceError,
} from "./templateAi";

const baseRequest: TemplateAiRequest = {
  topic: "other",
  customTopic: "수신 파일 재다운로드",
  tone: "informational",
  difficulty: "medium",
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
  maliciousPageContent = '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
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
                    subject: `후보 ${index + 1}`,
                    body: '<div><a href="{{LANDING_URL}}">확인</a></div>',
                    maliciousPageContent,
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

const buildGeminiMalformedJsonResponse = () =>
  new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: '{"candidates":[{"subject":"후보 1","body":"<div>열림","maliciousPageContent":"<form action=\\"{{TRAINING_URL}}\\"><button type=\\"submit\\">제출</button></form>","summary":"요약 1"}]',
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

describe("generateTemplateAiCandidates", () => {
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

    const resultPromise = generateTemplateAiCandidates(baseRequest).catch((caught) => caught);

    await vi.runAllTimersAsync();

    const error = await resultPromise;

    expect(error).toBeInstanceOf(TemplateAiServiceError);
    expect(error).toMatchObject({
      status: 503,
      code: "gemini_service_unavailable",
      retryable: true,
      message: "AI 템플릿 생성 요청이 일시적으로 많습니다. 잠시 후 다시 시도하세요.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("재시도 중 정상 응답이 오면 후보를 반환한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiUnavailableResponse())
      .mockResolvedValueOnce(buildGeminiSuccessResponse(4));

    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = generateTemplateAiCandidates(baseRequest);

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          subject: "후보 1",
          maliciousPageContent: expect.stringContaining('action="{{TRAINING_URL}}"'),
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
                    subject: "후보 1",
                    body: '<div><a href="{{LANDING_URL}}">확인</a></div>',
                    maliciousPageContent:
                      '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
                    summary: "요약 1",
                  },
                ],
              }),
            },
          ],
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 123,
            output_tokens: 456,
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
      generateTemplateAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          subject: "후보 1",
        }),
      ]),
      usage: expect.objectContaining({
        promptTokenCount: 123,
        candidatesTokenCount: 456,
        totalTokenCount: 579,
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
                    subject: "후보 1",
                    body: '<div><a href="{{LANDING_URL}}">확인</a></div>',
                    maliciousPageContent:
                      '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
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
      generateTemplateAiCandidates(
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

  it("Gemini가 잘린 JSON을 반환해도 fallback 모델에서 복구한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiMalformedJsonResponse())
      .mockResolvedValueOnce(buildGeminiMalformedJsonResponse())
      .mockResolvedValueOnce(buildGeminiMalformedJsonResponse())
      .mockResolvedValueOnce(buildGeminiSuccessResponse(1));

    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          subject: "후보 1",
        }),
      ]),
      usage: expect.objectContaining({
        model: "gemini-2.5-flash",
      }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("폼 action이 이미 있으면 별도 훈련 안내 링크를 자동 추가하지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(buildGeminiSuccessResponse(1));

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.maliciousPageContent).toContain('action="{{TRAINING_URL}}"');
    expect(result.candidates[0]?.maliciousPageContent).not.toContain('href="{{TRAINING_URL}}"');
  });

  it("메일본문에 LANDING_URL이 없으면 첫 링크에 자동 보정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      candidates: [
                        {
                          subject: "후보 1",
                          body: '<div><a href="https://example.com/file">확인</a></div>',
                          maliciousPageContent:
                            '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
                          summary: "요약 1",
                        },
                      ],
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
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.body).toContain('href="{{LANDING_URL}}"');
  });

  it("오타난 TRAINING_URL 토큰을 제출 동선 기준으로 정규화한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildGeminiSuccessResponse(
        1,
        '<form action="{{tranning_url}}}"><input name="email" /><button type="submit">제출</button></form>',
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.maliciousPageContent).toContain('action="{{TRAINING_URL}}"');
    expect(result.candidates[0]?.maliciousPageContent).not.toContain("tranning_url");
    expect(result.candidates[0]?.maliciousPageContent).not.toContain('href="{{TRAINING_URL}}"');
  });

  it("제출 동선에 TRAINING_URL이 없으면 첫 form action으로 자동 보정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildGeminiSuccessResponse(
        1,
        '<form><input name="email" /><button type="submit">제출</button></form><a href="{{TRAINING_URL}}">훈련 안내</a>',
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.maliciousPageContent).toContain('form action="{{TRAINING_URL}}"');
  });

  it("폼은 있지만 submit 버튼이 없으면 제출 버튼을 자동 추가한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildGeminiSuccessResponse(
        1,
        '<form action="{{TRAINING_URL}}"><input name="email" /></form>',
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.maliciousPageContent).toContain('action="{{TRAINING_URL}}"');
    expect(result.candidates[0]?.maliciousPageContent).toContain('type="submit"');
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
                            subject: "후보 1",
                            body: '<div><a href="https://example.com/file">확인</a></div>',
                            maliciousPageContent:
                              '<form><input name="email" /><button type="submit">제출</button></form>',
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
      generateTemplateAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          body: expect.stringContaining('href="{{LANDING_URL}}"'),
          maliciousPageContent: expect.stringContaining('action="{{TRAINING_URL}}"'),
        }),
      ]),
    });
  });

  it("유효 후보가 부족하면 추가 생성으로 남은 수를 보강한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(buildGeminiSuccessResponse(1))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        candidates: [
                          {
                            subject: "후보 2",
                            body: '<div><a href="{{LANDING_URL}}">확인 2</a></div>',
                            maliciousPageContent:
                              '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
                            summary: "요약 2",
                          },
                          {
                            subject: "후보 3",
                            body: '<div><a href="{{LANDING_URL}}">확인 3</a></div>',
                            maliciousPageContent:
                              '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
                            summary: "요약 3",
                          },
                          {
                            subject: "후보 4",
                            body: '<div><a href="{{LANDING_URL}}">확인 4</a></div>',
                            maliciousPageContent:
                              '<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>',
                            summary: "요약 4",
                          },
                        ],
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
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates(baseRequest);

    expect(result.candidates).toHaveLength(4);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: "후보 1",
        }),
      ]),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("외부 리소스와 스크립트가 포함된 첨부 재현 결과도 저장 전 안전하게 보정한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      candidates: [
                        {
                          subject: "후보 1",
                          body: `
                            <div>
                              <img src="https://example.com/logo.png" alt="logo" />
                              <a href="https://malimail.evriz.co.kr?id=1">수정 보안 오류</a>
                            </div>
                          `,
                          maliciousPageContent: `
                            <html>
                              <head>
                                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR" />
                              </head>
                              <body>
                                <div class="logo"><img src="https://sslvpn.aceengineering.com/logo.png" /></div>
                                <input type="text" onkeypress="alert(1)" placeholder="로그인 ID" />
                                <button onclick="submitLogin()">로그인</button>
                                <script>alert('x')</script>
                              </body>
                            </html>
                          `,
                          summary: "요약 1",
                        },
                      ],
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
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.body).toContain('href="{{LANDING_URL}}"');
    expect(result.candidates[0]?.body).not.toContain("https://malimail.evriz.co.kr");
    expect(result.candidates[0]?.maliciousPageContent).toContain('action="{{TRAINING_URL}}"');
    expect(result.candidates[0]?.maliciousPageContent).toContain('type="submit"');
    expect(result.candidates[0]?.maliciousPageContent).not.toContain("<script");
    expect(result.candidates[0]?.maliciousPageContent).not.toContain("<link");
    expect(result.candidates[0]?.maliciousPageContent).not.toContain("onclick=");
    expect(result.candidates[0]?.maliciousPageContent).not.toContain("https://sslvpn.aceengineering.com");
  });

  it("이미지 첨부가 있으면 결과 HTML에 업로드 원본 이미지를 직접 재사용한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildGeminiSuccessResponse(1, '<form action="{{TRAINING_URL}}"><button type="submit">로그인</button></form>'),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
      mailBodyReferenceAttachment: {
        name: "mail-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "bWFpbC1pbWFnZQ==",
      },
      maliciousPageReferenceAttachment: {
        name: "landing-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "bGFuZGluZy1pbWFnZQ==",
      },
    });

    expect(result.candidates[0]?.body).toContain("data:image/png;base64,bWFpbC1pbWFnZQ==");
    expect(result.candidates[0]?.maliciousPageContent).toContain(
      "data:image/png;base64,bGFuZGluZy1pbWFnZQ==",
    );
  });

  it("HTML 첨부가 있으면 AI가 조금 다르게 써도 업로드 원본 HTML을 우선 사용한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      candidates: [
                        {
                          subject: "후보 1",
                          body: '<div><a href="{{LANDING_URL}}">AI가 다시 쓴 메일</a></div>',
                          maliciousPageContent:
                            '<form action="{{TRAINING_URL}}"><button type="submit">AI가 다시 쓴 페이지</button></form>',
                          summary: "요약 1",
                        },
                      ],
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
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
      mailBodyReferenceAttachment: {
        name: "mail-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent: '<div><a href="https://example.com/original">업로드 메일 원본</a></div>',
      },
      maliciousPageReferenceAttachment: {
        name: "landing-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent: '<div class="login-box"><input name="email" /></div>',
      },
    });

    expect(result.candidates[0]?.body).toContain("업로드 메일 원본");
    expect(result.candidates[0]?.body).not.toContain("AI가 다시 쓴 메일");
    expect(result.candidates[0]?.body).toContain('href="{{LANDING_URL}}"');
    expect(result.candidates[0]?.maliciousPageContent).toContain('class="login-box"');
    expect(result.candidates[0]?.maliciousPageContent).not.toContain("AI가 다시 쓴 페이지");
    expect(result.candidates[0]?.maliciousPageContent).toContain('action="{{TRAINING_URL}}"');
  });

  it("후보가 전부 무효여도 기본 fallback 후보를 반환한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      candidates: [
                        {
                          subject: "",
                          body: "",
                          maliciousPageContent: "",
                          summary: "",
                        },
                      ],
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
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      generateTemplateAiCandidates({
        ...baseRequest,
        generateCount: 1,
      }),
    ).resolves.toMatchObject({
      candidates: expect.arrayContaining([
        expect.objectContaining({
          subject: expect.stringContaining("확인 안내"),
          body: expect.stringContaining('href="{{LANDING_URL}}"'),
          maliciousPageContent: expect.stringContaining('action="{{TRAINING_URL}}"'),
        }),
      ]),
    });
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
                      subject: "후보 1",
                      body: '<div><a href="{{LANDING_URL}}">확인</a></div>',
                      maliciousPageContent:
                        '<form action="{{TRAINING_URL}}"><button type="submit">제출</button></form>',
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

    const result = await generateTemplateAiCandidates({
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
    expect(result.candidates[0]?.subject).toBe("후보 1");
  });

  it("폼이 전혀 없으면 fallback submit form을 자동 추가한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      buildGeminiSuccessResponse(
        1,
        '<section><div>스크린샷 기반 재현 화면</div></section>',
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
    });

    expect(result.candidates[0]?.maliciousPageContent).toContain('<form action="{{TRAINING_URL}}"');
    expect(result.candidates[0]?.maliciousPageContent).toContain('type="submit"');
  });

  it("이미지 참고 첨부가 있으면 Gemini 요청 parts에 inlineData를 포함한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(buildGeminiSuccessResponse(1));

    vi.stubGlobal("fetch", fetchMock);

    await generateTemplateAiCandidates({
      ...baseRequest,
      generateCount: 1,
      mailBodyReferenceAttachment: {
        name: "mail-reference.png",
        mimeType: "image/png",
        kind: "image",
        base64Data: "ZmFrZS1pbWFnZQ==",
      },
      maliciousPageReferenceAttachment: {
        name: "landing-reference.html",
        mimeType: "text/html",
        kind: "html",
        textContent: "<div>악성본문 참고</div>",
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
          text: expect.stringContaining("mail-reference.png"),
        }),
        expect.objectContaining({
          inlineData: {
            mimeType: "image/png",
            data: "ZmFrZS1pbWFnZQ==",
          },
        }),
      ]),
    );
    expect(requestBody.contents[0]?.parts[0]?.text).toContain("<div>악성본문 참고</div>");
  });
});
