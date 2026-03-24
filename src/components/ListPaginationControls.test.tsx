import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListPaginationControls } from "./ListPaginationControls";

describe("ListPaginationControls", () => {
  it("1페이지여도 컨트롤을 표시하고 이동 버튼을 비활성화한다", () => {
    const onPageChange = vi.fn();

    render(
      <ListPaginationControls
        page={1}
        totalPages={1}
        onPageChange={onPageChange}
        previousLabel="이전"
        nextLabel="다음"
      />,
    );

    expect(screen.getByText("1 / 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("활성 페이지에서 이동 버튼을 누르면 페이지 변경을 호출한다", () => {
    const onPageChange = vi.fn();

    render(
      <ListPaginationControls
        page={2}
        totalPages={3}
        onPageChange={onPageChange}
        previousLabel="이전"
        nextLabel="다음"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));

    expect(onPageChange).toHaveBeenNthCalledWith(1, 1);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });
});
