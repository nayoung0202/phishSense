import { normalizeReturnTo } from "@/lib/returnTo";
export { normalizeReturnTo };

export const getAppOrigin = () => {
  const raw = process.env.APP_BASE_URL;
  if (!raw) {
    throw new Error("[auth] APP_BASE_URL이 필요합니다.");
  }

  return new URL(raw).origin;
};

export const buildReturnUrl = (candidate: string | null | undefined) => {
  const normalized = normalizeReturnTo(candidate) || "/";
  return new URL(normalized, getAppOrigin()).toString();
};
