"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useI18n } from "@/components/I18nProvider";

const OIDC_LOGIN_URL = "/api/auth/oidc/login";

function LoginContent() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const returnTo = searchParams.get("returnTo");

  const moveToOidc = (prompt?: "create") => {
    const url = new URL(OIDC_LOGIN_URL, window.location.origin);
    url.searchParams.set("returnTo", returnTo || "/");
    if (prompt) {
      url.searchParams.set("prompt", prompt);
    }
    window.location.href = url.toString();
  };

  const handleLogin = () => moveToOidc();
  const handleSignup = () => moveToOidc("create");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-auto w-full max-w-md px-6">
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg">
          {/* 로고 */}
          <div className="mb-6 flex justify-center">
            <div className="flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-8 w-8 text-primary"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-2xl font-bold">
                <span style={{ color: "#FDF6E3" }}>Phish</span>
                <span style={{ color: "#4EC3E0" }}>Sense</span>
              </span>
            </div>
          </div>

          {/* 서비스 설명 */}
          <p className="mb-8 text-center text-sm text-muted-foreground">
            {t("악성메일 모의훈련 서비스")}
          </p>

          {/* 로그아웃 메시지 */}
          {reason === "logout" && (
            <div className="mb-6 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-center text-sm text-green-400">
              <span className="mr-1">✓</span>
              {t("로그아웃되었습니다")}
            </div>
          )}

          {/* 로그인 버튼 */}
          <button
            type="button"
            onClick={handleLogin}
            className="mb-6 w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("EVRIZ 계정으로 로그인")}
          </button>

          {/* 구분선 */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">{t("또는")}</span>
            </div>
          </div>

          {/* 회원가입 안내 */}
          <div className="text-center">
            <p className="mb-2 text-sm text-muted-foreground">{t("처음 이용하시나요?")}</p>
            <button
              type="button"
              onClick={handleSignup}
              className="inline-flex items-center text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              {t("무료로 시작하기")}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-1 h-4 w-4"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { t } = useI18n();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <div className="text-muted-foreground">{t("common.loading")}</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
