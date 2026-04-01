import { describe, expect, it } from "vitest";
import { buildYearlyTrendData, formatCount, formatPercent, isRateDataKey } from "./Dashboard";

describe("Dashboard format helpers", () => {
  it("퍼센트 값을 정수로 반올림해 표시한다", () => {
    expect(formatPercent(33.3333)).toBe("33%");
    expect(formatPercent(66.6666)).toBe("67%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("건수 값을 천 단위 구분 정수로 표시한다", () => {
    expect(formatCount(1200)).toBe("1,200");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("0");
  });

  it("퍼센트 시리즈 dataKey를 올바르게 판별한다", () => {
    expect(isRateDataKey("openRate")).toBe(true);
    expect(isRateDataKey("clickRate")).toBe(true);
    expect(isRateDataKey("submitRate")).toBe(true);
    expect(isRateDataKey("targetCount")).toBe(false);
    expect(isRateDataKey(undefined)).toBe(false);
  });

  it("연간 추이 데이터는 선택한 연도의 12개월을 모두 채우고 분기 정보를 유지한다", () => {
    const data = buildYearlyTrendData(
      [
        {
          startDate: new Date("2026-01-10T00:00:00Z"),
          fiscalYear: 2026,
          targetCount: 100,
          openCount: 50,
          clickCount: 10,
          submitCount: 5,
        },
        {
          startDate: new Date("2026-01-20T00:00:00Z"),
          fiscalYear: 2026,
          targetCount: 50,
          openCount: 10,
          clickCount: 5,
          submitCount: 0,
        },
        {
          startDate: new Date("2026-04-02T00:00:00Z"),
          fiscalYear: 2026,
          targetCount: 40,
          openCount: 20,
          clickCount: 8,
          submitCount: 4,
        },
        {
          startDate: new Date("2025-12-31T00:00:00Z"),
          fiscalYear: 2025,
          targetCount: 999,
          openCount: 999,
          clickCount: 999,
          submitCount: 999,
        },
      ],
      2026,
    );

    expect(data).toHaveLength(12);
    expect(data[0]).toMatchObject({
      monthNumber: 1,
      quarterNumber: 1,
      targetCount: 150,
      openCount: 60,
      clickCount: 15,
      submitCount: 5,
    });
    expect(data[0]?.openRate).toBeCloseTo(40);
    expect(data[0]?.clickRate).toBeCloseTo(10);
    expect(data[0]?.submitRate).toBeCloseTo(3.3333, 3);
    expect(data[1]).toMatchObject({
      monthNumber: 2,
      quarterNumber: 1,
      targetCount: 0,
      openRate: 0,
    });
    expect(data[3]).toMatchObject({
      monthNumber: 4,
      quarterNumber: 2,
      targetCount: 40,
      openRate: 50,
    });
  });
});
