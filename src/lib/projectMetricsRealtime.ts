export const PROJECT_MONITORING_REFETCH_INTERVAL_MS = 15_000;
export const PROJECT_DETAIL_REFETCH_INTERVAL_MS = 10_000;

export const ALWAYS_FRESH_QUERY_OPTIONS = {
  refetchOnMount: "always" as const,
  refetchOnWindowFocus: "always" as const,
};

export const createAlwaysFreshQueryOptions = (refetchInterval: number | false = false) => ({
  ...ALWAYS_FRESH_QUERY_OPTIONS,
  refetchInterval,
});
