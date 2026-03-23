import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SmtpConfigForm, createEmptySmtpConfig } from "./SmtpConfigForm";

describe("SmtpConfigForm", () => {
  it("허용 발신 도메인을 Enter로 추가하고 배열로 저장한다", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <SmtpConfigForm
        mode="create"
        tenantId="tenant-1"
        initialData={createEmptySmtpConfig("tenant-1")}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText("SMTP 호스트"), {
      target: { value: "smtp.example.com" },
    });
    fireEvent.change(screen.getByLabelText("설정 별칭"), {
      target: { value: "보안훈련 기본 발송" },
    });

    const domainInput = screen.getByLabelText("도메인 입력");
    fireEvent.change(domainInput, {
      target: { value: "example.com" },
    });
    fireEvent.keyDown(domainInput, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
    });

    fireEvent.change(domainInput, {
      target: { value: "mail.example.com" },
    });
    fireEvent.keyDown(domainInput, {
      key: "Enter",
      code: "Enter",
      charCode: 13,
    });

    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("mail.example.com")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "보안훈련 기본 발송",
          host: "smtp.example.com",
          allowedSenderDomains: ["example.com", "mail.example.com"],
        }),
      );
    });
  });

  it("허용 발신 도메인이 5개에 도달하면 입력을 막고 저장은 정상 처리한다", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(
      <SmtpConfigForm
        mode="create"
        tenantId="tenant-1"
        initialData={createEmptySmtpConfig("tenant-1")}
        onSubmit={onSubmit}
      />,
    );

    const domainInput = screen.getByLabelText("도메인 입력");
    ["one.example", "two.example", "three.example", "four.example", "five.example"].forEach(
      (domain) => {
        fireEvent.change(domainInput, {
          target: { value: domain },
        });
        fireEvent.keyDown(domainInput, {
          key: "Enter",
          code: "Enter",
          charCode: 13,
        });
      },
    );

    fireEvent.change(screen.getByLabelText("SMTP 호스트"), {
      target: { value: "smtp.example.com" },
    });

    expect(domainInput).toBeDisabled();
    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
    expect(
      screen.getByText("최대 5개까지 등록되었습니다. 새 도메인을 추가하려면 기존 도메인을 삭제하세요."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          host: "smtp.example.com",
          allowedSenderDomains: [
            "one.example",
            "two.example",
            "three.example",
            "four.example",
            "five.example",
          ],
        }),
      );
    });
  });
});
