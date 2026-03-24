import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCheckoutSession,
  createPortalSession,
  fetchBillingSubscription,
} from "./platformApi";

describe("platformApi billing helpers", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("checkout session 요청에 Idempotency-Key와 seatCount만 담아 보낸다", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "cs_test_123",
          url: "https://checkout.stripe.com/c/pay/cs_test_123",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await createCheckoutSession({
      tenantId: "tenant-1",
      seatCount: 25,
      idempotencyKey: "idem-checkout-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/tenants/tenant-1/billing/checkout-sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-checkout-1",
        }),
        body: JSON.stringify({
          seatCount: 25,
        }),
      }),
    );
  });

  it("portal session 요청에 flowType과 Idempotency-Key를 담아 보낸다", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "bps_123",
          url: "https://billing.stripe.com/p/session/test_123",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await createPortalSession({
      tenantId: "tenant-1",
      flowType: "subscription_cancel",
      idempotencyKey: "idem-portal-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/platform/tenants/tenant-1/billing/portal-sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "Idempotency-Key": "idem-portal-1",
        }),
        body: JSON.stringify({
          flowType: "subscription_cancel",
        }),
      }),
    );
  });

  it("billing subscription 404는 null로 처리한다", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "not-found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const result = await fetchBillingSubscription("tenant-1");

    expect(result).toBeNull();
  });
});
