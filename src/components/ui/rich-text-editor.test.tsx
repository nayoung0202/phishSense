import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./rich-text-editor";

vi.mock("@/components/I18nProvider", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("RichTextEditor", () => {
  it("메일 본문 편집 테마에 다크 배경 가독성 보정 클래스를 적용한다", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value="<p>본문</p>"
        onChange={handleChange}
        editTheme="mail-dark-readable"
      />,
    );

    expect(container.querySelector(".template-editor-dark-readable")).not.toBeNull();
  });

  it("악성본문 편집 테마에 모달 전용 클래스를 적용한다", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value="<div>본문</div>"
        onChange={handleChange}
        editTheme="malicious-modal"
      />,
    );

    expect(container.querySelector(".template-editor-malicious-modal")).not.toBeNull();
  });

  it("미리보기 전환 시 편집 DOM을 교체 렌더링한다", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <RichTextEditor
        value="<p>편집 본문</p>"
        previewHtml="<p>미리보기 본문</p>"
        onChange={handleChange}
      />,
    );

    expect(container.textContent).toContain("편집 본문");

    fireEvent.mouseDown(screen.getByRole("button", { name: "richTextEditor.modePreview" }));

    expect(container.querySelector("[contenteditable='true']")).toBeNull();
    expect(container.textContent).not.toContain("편집 본문");
    expect(screen.getByTitle("template-preview-frame")).toBeInTheDocument();
  });

  it("바깥 form 안에서도 악성본문의 TRAINING_URL form 토큰을 보존한다", () => {
    const handleChange = vi.fn();
    const { container } = render(
      <form>
        <RichTextEditor
          value='<form action="{{TRAINING_URL}}"><input name="email" /><button type="submit">제출</button></form>'
          onChange={handleChange}
          editTheme="malicious-modal"
        />
      </form>,
    );

    const editor = container.querySelector("[contenteditable='true']") as HTMLDivElement | null;
    expect(editor).not.toBeNull();
    expect(editor?.innerHTML).toContain("ps-editor-form");

    if (!editor) {
      return;
    }

    editor.innerHTML = `${editor.innerHTML}<p>추가 문구</p>`;
    fireEvent.input(editor);

    expect(handleChange).toHaveBeenCalled();
    expect(handleChange.mock.lastCall?.[0]).toContain('<form action="{{TRAINING_URL}}">');
    expect(handleChange.mock.lastCall?.[0]).toContain('type="submit"');
    expect(handleChange.mock.lastCall?.[0]).not.toContain("ps-editor-form");
  });
});
