import { describe, expect, it } from "vitest";
import {
  ALWAYS_FRESH_QUERY_OPTIONS,
  PROJECT_DETAIL_REFETCH_INTERVAL_MS,
  PROJECT_MONITORING_REFETCH_INTERVAL_MS,
  createAlwaysFreshQueryOptions,
} from "./projectMetricsRealtime";

describe("projectMetricsRealtime", () => {
  it("운영 화면 쿼리를 mount/focus 시 항상 새로 가져오도록 설정한다", () => {
    expect(ALWAYS_FRESH_QUERY_OPTIONS).toEqual({
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
    });
  });

  it("대시보드/목록용 polling 주기를 15초로 유지한다", () => {
    expect(PROJECT_MONITORING_REFETCH_INTERVAL_MS).toBe(15_000);
    expect(createAlwaysFreshQueryOptions(PROJECT_MONITORING_REFETCH_INTERVAL_MS)).toEqual({
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchInterval: 15_000,
    });
  });

  it("프로젝트 상세용 polling 주기를 10초로 유지한다", () => {
    expect(PROJECT_DETAIL_REFETCH_INTERVAL_MS).toBe(10_000);
    expect(createAlwaysFreshQueryOptions(PROJECT_DETAIL_REFETCH_INTERVAL_MS)).toEqual({
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchInterval: 10_000,
    });
  });

  it("polling이 필요 없으면 false를 유지한다", () => {
    expect(createAlwaysFreshQueryOptions()).toEqual({
      refetchOnMount: "always",
      refetchOnWindowFocus: "always",
      refetchInterval: false,
    });
  });
});
