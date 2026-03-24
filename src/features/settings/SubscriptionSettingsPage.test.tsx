import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/lib/queryClient";

const searchParamsMock = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

const featureFlagsMock = vi.hoisted(() => ({
  useFeatureFlags: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  useToast: vi.fn(),
}));

const settingsTenantMock = vi.hoisted(() => ({
  useSettingsTenant: vi.fn(),
}));

const platformApiMock = vi.hoisted(() => ({
  fetchBillingCatalog: vi.fn(),
  fetchBillingSubscription: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.value,
}));

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    locale: "ko",
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/FeatureFlagProvider", () => ({
  useFeatureFlags: featureFlagsMock.useFeatureFlags,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: toastMock.useToast,
}));

vi.mock("@/features/settings/useSettingsTenant", () => ({
  useSettingsTenant: settingsTenantMock.useSettingsTenant,
}));

vi.mock("@/lib/platformApi", () => ({
  fetchBillingCatalog: platformApiMock.fetchBillingCatalog,
  fetchBillingSubscription: platformApiMock.fetchBillingSubscription,
  createCheckoutSession: platformApiMock.createCheckoutSession,
  createPortalSession: platformApiMock.createPortalSession,
}));

import SubscriptionSettingsPage from "./SubscriptionSettingsPage";

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe("SubscriptionSettingsPage", () => {
  let refetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    refetchSpy = vi.fn().mockResolvedValue({
      data: {
        authenticated: true,
        status: "ready",
        hasAccess: true,
        onboardingRequired: false,
        tenantId: "tenant-1",
        currentTenantId: "tenant-1",
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
        products: [
          {
            tenantId: "tenant-1",
            productId: "PHISHSENSE",
            status: "ACTIVE",
            plan: "BUSINESS",
            seatLimit: 25,
          },
        ],
        platformProduct: {
          tenantId: "tenant-1",
          productId: "PHISHSENSE",
          status: "ACTIVE",
          plan: "BUSINESS",
          seatLimit: 25,
        },
        localEntitlement: null,
      },
    });
    searchParamsMock.value = new URLSearchParams("billing=checkout-success");
    featureFlagsMock.useFeatureFlags.mockReturnValue({
      settingsV2Enabled: true,
      billingUiEnabled: true,
      creditsEnforcementEnabled: false,
      byokUiEnabled: true,
    });
    toastMock.useToast.mockReturnValue({
      toast: vi.fn(),
    });
    settingsTenantMock.useSettingsTenant.mockReturnValue({
      context: {
        authenticated: true,
        status: "entitlement_pending",
        hasAccess: false,
        onboardingRequired: true,
        tenantId: "tenant-1",
        currentTenantId: "tenant-1",
        tenants: [{ tenantId: "tenant-1", name: "Acme", role: "OWNER" }],
        products: [],
        platformProduct: null,
        localEntitlement: null,
      },
      tenantId: "tenant-1",
      membership: { tenantId: "tenant-1", role: "OWNER", name: "Acme" },
      isLoading: false,
      refetch: refetchSpy,
    });
    platformApiMock.fetchBillingCatalog.mockResolvedValue({
      productId: "PHISHSENSE",
      currency: "KRW",
      vatExcluded: true,
      plans: [
        {
          planCode: "FREE",
          name: "Free",
          shortDescription: "free",
          priceLabel: "₩0",
          features: [],
          ctaType: "experience",
          ctaLabel: "start",
          tierTable: [],
        },
        {
          planCode: "BUSINESS",
          name: "Business",
          shortDescription: "business",
          priceLabel: "구간별",
          features: [],
          ctaType: "checkout",
          ctaLabel: "subscribe",
          minSeats: 6,
          maxSeats: 1000,
          tierTable: [
            {
              minSeats: 6,
              maxSeats: 100,
              annualUnitPrice: 17000,
              monthlyEquivalentPrice: 8500,
              includedCredits: 10,
            },
          ],
        },
      ],
    });
    platformApiMock.fetchBillingSubscription.mockResolvedValue(null);
    platformApiMock.createCheckoutSession.mockReset();
    platformApiMock.createPortalSession.mockReset();
  });

  it("Stripe 복귀 후 platform context를 재조회한다", async () => {
    renderWithClient(<SubscriptionSettingsPage />);

    await waitFor(() => {
      expect(refetchSpy).toHaveBeenCalled();
    });
    expect(
      await screen.findByText("settings.subscription.checkoutConfirmed"),
    ).toBeInTheDocument();
  });
});
