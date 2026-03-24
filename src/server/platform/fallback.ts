import type {
  PlatformBillingCatalogResponse,
  PlatformCreditsResponse,
  PlatformTenantSubscriptionResponse,
} from "./types";
import { PLATFORM_PRODUCT_ID } from "./types";

const defaultBillingCatalog: PlatformBillingCatalogResponse = {
  productId: PLATFORM_PRODUCT_ID,
  currency: "KRW",
  vatExcluded: true,
  plans: [
    {
      planCode: "FREE",
      name: "Free",
      shortDescription: "소규모 팀을 위한 무료 플랜",
      priceLabel: "₩0",
      features: [
        "최대 5명까지 무료",
        "기본 피싱 템플릿",
        "기본 보고서",
        "AI 크레딧 2개 포함",
      ],
      ctaType: "experience",
      ctaLabel: "무료 체험 시작",
      includedCredits: 2,
      highlighted: false,
      tierTable: [],
    },
    {
      planCode: "BUSINESS",
      name: "Business",
      shortDescription: "연간 구독 · 사용자당 (VAT 별도)",
      priceLabel: "구간별",
      features: [
        "좌석 기반 연간 구독",
        "Stripe Hosted Checkout 지원",
        "플랜별 포함 AI 크레딧",
      ],
      ctaType: "checkout",
      ctaLabel: "구독하기",
      includedCredits: 10,
      highlighted: true,
      minSeats: 6,
      maxSeats: 10_000,
      overageCreditPrice: 5000,
      tierTable: [
        {
          minSeats: 6,
          maxSeats: 100,
          annualUnitPrice: 17000,
          monthlyEquivalentPrice: 8500,
          includedCredits: 10,
          note: "AI 크레딧 10개 포함",
        },
        {
          minSeats: 101,
          maxSeats: 500,
          annualUnitPrice: 14000,
          monthlyEquivalentPrice: 7000,
          includedCredits: 20,
          note: "AI 크레딧 20개 포함",
        },
        {
          minSeats: 501,
          maxSeats: 2000,
          annualUnitPrice: 11000,
          monthlyEquivalentPrice: 5500,
          includedCredits: 50,
          note: "AI 크레딧 50개 포함",
        },
        {
          minSeats: 2001,
          maxSeats: 5000,
          annualUnitPrice: 8000,
          monthlyEquivalentPrice: 4000,
          includedCredits: 100,
          note: "AI 크레딧 100개 포함",
        },
        {
          minSeats: 5001,
          maxSeats: 10000,
          annualUnitPrice: 5000,
          monthlyEquivalentPrice: 2500,
          includedCredits: 150,
          note: "AI 크레딧 150개 포함",
        },
      ],
    },
    {
      planCode: "ENTERPRISE",
      name: "Enterprise",
      shortDescription: "맞춤 연동 가능",
      priceLabel: "협의",
      features: ["LMS 연동", "전담 지원", "맞춤 배포", "도입 상담 문의"],
      ctaType: "contact",
      ctaLabel: "문의하기",
      contactUrl: "mailto:sales@evriz.co.kr",
      highlighted: false,
      tierTable: [],
    },
  ],
};

const defaultCreditPolicies = [
  {
    featureKey: "template_ai_standard",
    label: "AI 템플릿 생성",
    cost: 2,
    usageContexts: ["standard"],
  },
  {
    featureKey: "template_ai_experience",
    label: "체험하기 AI 템플릿 생성",
    cost: 0,
    usageContexts: ["experience"],
  },
  {
    featureKey: "training_page_ai_standard",
    label: "AI 훈련 안내 페이지 생성",
    cost: 1,
    usageContexts: ["standard"],
  },
];

export const getFallbackBillingCatalog = () => defaultBillingCatalog;

export const getFallbackTenantSubscription = (args: {
  tenantId: string;
  planCode?: string | null;
  seatLimit?: number | null;
  status?: string | null;
}): PlatformTenantSubscriptionResponse => ({
  tenantId: args.tenantId,
  productId: PLATFORM_PRODUCT_ID,
  status: args.status ?? "ACTIVE",
  planCode: args.planCode ?? "FREE",
  seatCount: null,
  seatLimit: args.seatLimit ?? 5,
  billingInterval: args.planCode === "BUSINESS" ? "annual" : null,
  currentPeriodEnd: null,
  includedCredits:
    args.planCode === "BUSINESS"
      ? 10
      : args.planCode === "FREE"
        ? 2
        : null,
});

export const getFallbackCreditsSummary = (tenantId: string): PlatformCreditsResponse => ({
  tenantId,
  productId: PLATFORM_PRODUCT_ID,
  balance: null,
  included: null,
  pending: 0,
  byokAvailable: false,
  activeAiKeys: 0,
  rechargeUrl: "mailto:sales@evriz.co.kr?subject=PhishSense%20Credit%20Recharge",
  policies: defaultCreditPolicies,
  recentEvents: [],
});
