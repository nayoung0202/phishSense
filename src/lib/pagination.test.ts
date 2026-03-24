import { describe, expect, it } from "vitest";
import { paginateItems } from "./pagination";

describe("paginateItems", () => {
  it("현재 페이지 기준으로 항목을 잘라 반환한다", () => {
    const result = paginateItems([1, 2, 3, 4, 5], 2, 2);

    expect(result).toEqual({
      items: [3, 4],
      total: 5,
      totalPages: 3,
      page: 2,
    });
  });

  it("페이지가 범위를 넘으면 마지막 페이지로 보정한다", () => {
    const result = paginateItems([1, 2, 3], 9, 2);

    expect(result.page).toBe(2);
    expect(result.items).toEqual([3]);
  });
});
