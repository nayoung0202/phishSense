import "server-only";
import type { FeatureFlags } from "@/lib/featureFlags";

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

export const getFeatureFlags = (): FeatureFlags => ({
  settingsV2Enabled: parseBoolean(process.env.SETTINGS_V2_ENABLED, true),
  billingUiEnabled: parseBoolean(process.env.BILLING_UI_ENABLED, true),
  creditsEnforcementEnabled: parseBoolean(
    process.env.CREDITS_ENFORCEMENT_ENABLED,
    false,
  ),
  byokUiEnabled: parseBoolean(process.env.BYOK_UI_ENABLED, true),
});
