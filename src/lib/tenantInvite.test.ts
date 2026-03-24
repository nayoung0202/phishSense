import { describe, expect, it } from "vitest";
import {
  buildTenantInviteAcceptApiPath,
  buildTenantInvitePagePath,
  buildTenantInvitePageUrl,
  normalizeTenantInviteToken,
} from "./tenantInvite";

describe("tenant invite helpers", () => {
  it("invite landing path를 query param 기반으로 인코딩한다", () => {
    expect(buildTenantInvitePagePath("a+/=b")).toBe(
      "/tenant-invites?token=a%2B%2F%3Db",
    );
  });

  it("invite landing absolute url을 생성한다", () => {
    expect(buildTenantInvitePageUrl("https://app.phishsense.cloud", "a+/=b")).toBe(
      "https://app.phishsense.cloud/tenant-invites?token=a%2B%2F%3Db",
    );
  });

  it("invite accept API path를 안전하게 인코딩한다", () => {
    expect(buildTenantInviteAcceptApiPath("a+/=b")).toBe(
      "/api/platform/tenant-invites/a%2B%2F%3Db/accept",
    );
  });

  it("search param token을 정규화한다", () => {
    expect(normalizeTenantInviteToken(" token-1 ")).toBe("token-1");
    expect(normalizeTenantInviteToken("   ")).toBeNull();
    expect(normalizeTenantInviteToken(["token-1"])).toBeNull();
  });
});
