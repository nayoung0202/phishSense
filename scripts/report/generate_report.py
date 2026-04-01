import json
import os
import sys
from pathlib import Path


def main():
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("입력 JSON 파싱에 실패했습니다.", file=sys.stderr)
        sys.exit(1)

    template_path = payload.get("template_path")
    output_path = payload.get("output_path")
    data = payload.get("data", {})

    if not template_path or not output_path:
        print("template_path 또는 output_path가 없습니다.", file=sys.stderr)
        sys.exit(1)

    try:
        from docxtpl import DocxTemplate, InlineImage
        from docx.shared import Cm
    except Exception as exc:
        print(f"docxtpl 모듈 로드 실패: {exc}", file=sys.stderr)
        sys.exit(1)

    charts = payload.get("charts", [])
    images = payload.get("images", [])

    if charts:
        try:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            from matplotlib import font_manager as font_manager
        except Exception as exc:
            print(f"matplotlib 모듈 로드 실패: {exc}", file=sys.stderr)
            sys.exit(1)

        def configure_font():
            font_path = os.environ.get("REPORT_MPL_FONT_PATH")
            if font_path:
                font_file = Path(font_path)
                if not font_file.is_absolute():
                    font_file = Path.cwd() / font_file
                if not font_file.exists():
                    raise RuntimeError("REPORT_MPL_FONT_PATH에 지정한 폰트 파일을 찾을 수 없습니다.")
                try:
                    font_manager.fontManager.addfont(str(font_file))
                    font_name = font_manager.FontProperties(fname=str(font_file)).get_name()
                    plt.rcParams["font.family"] = font_name
                    plt.rcParams["axes.unicode_minus"] = False
                    return True
                except Exception as exc:
                    raise RuntimeError(f"REPORT_MPL_FONT_PATH 폰트 로드 실패: {exc}")
            candidates = [
                "Noto Sans CJK KR",
                "Noto Sans KR",
                "NanumGothic",
                "NanumBarunGothic",
                "Malgun Gothic",
                "AppleGothic",
            ]
            available = {font.name for font in font_manager.fontManager.ttflist}
            for name in candidates:
                if name in available:
                    plt.rcParams["font.family"] = name
                    plt.rcParams["axes.unicode_minus"] = False
                    return True
            return False

        font_ready = configure_font()

        def requires_unicode(label_list):
            for label in label_list:
                if not isinstance(label, str):
                    continue
                if any(ord(ch) > 127 for ch in label):
                    return True
            return False

        def build_donut_percentages(raw_values):
            safe_raw_values = [max(float(value), 0) for value in raw_values]
            total = sum(safe_raw_values)
            if total <= 0:
                return [0.0 for _ in safe_raw_values]
            return [(value / total) * 100 for value in safe_raw_values]

        def build_donut_legend_labels(label_list, raw_values):
            percentages = build_donut_percentages(raw_values)
            legend_labels = []
            for index, percent in enumerate(percentages):
                raw_label = label_list[index] if index < len(label_list) else ""
                label = raw_label if isinstance(raw_label, str) and raw_label.strip() else f"항목 {index + 1}"
                legend_labels.append(f"{label} {percent:.1f}%")
            return legend_labels

    try:
        template = DocxTemplate(template_path)

        for image in images:
            key = image.get("key")
            path = image.get("path")
            if not key or not path:
                continue
            width_cm = image.get("width_cm")
            height_cm = image.get("height_cm")

            kwargs = {}
            if width_cm is not None:
                kwargs["width"] = Cm(float(width_cm))
            if height_cm is not None:
                kwargs["height"] = Cm(float(height_cm))

            data[key] = InlineImage(template, path, **kwargs)
        for chart in charts:
            key = chart.get("key")
            chart_type = chart.get("type", "donut")
            labels = chart.get("labels", [])
            values = chart.get("values", [])
            width_cm = float(chart.get("width_cm", 13.5))
            height_cm = float(chart.get("height_cm", 5.0))

            if not key or not isinstance(values, list) or len(values) == 0:
                continue

            if not font_ready and requires_unicode(labels):
                raise RuntimeError(
                    "한글 폰트를 찾을 수 없습니다. "
                    "REPORT_MPL_FONT_PATH를 지정하거나 시스템에 한글 폰트를 설치하세요.",
                )

            safe_values = [max(float(v), 0) for v in values]
            donut_percentages = build_donut_percentages(safe_values)
            render_values = safe_values
            if chart_type != "bar" and sum(render_values) <= 0:
                render_values = [1 for _ in render_values]

            colors = chart.get("colors")
            if not isinstance(colors, list) or len(colors) < len(render_values):
                if chart_type == "bar":
                    colors = ["#4EC3E0", "#7C9CF5", "#F59E0B", "#F97316"]
                else:
                    colors = ["#4EC3E0", "#CBD5F5"]

            fig, ax = plt.subplots(figsize=(width_cm / 2.54, height_cm / 2.54))
            if chart_type == "bar":
                indices = list(range(len(safe_values)))
                ax.bar(indices, safe_values, color=colors[: len(safe_values)])
                if labels:
                    ax.set_xticks(indices)
                    ax.set_xticklabels(labels, fontsize=9, color="#475569")
                max_value = max(safe_values) if safe_values else 0
                ax.set_ylim(0, max_value * 1.2 if max_value > 0 else 1)
                ax.grid(axis="y", color="#E2E8F0", linestyle="-", linewidth=0.6)
                ax.spines["top"].set_visible(False)
                ax.spines["right"].set_visible(False)
                ax.spines["left"].set_visible(False)
                ax.tick_params(axis="y", labelsize=9, colors="#64748B")
            else:
                wedges, _ = ax.pie(
                    render_values,
                    labels=None,
                    startangle=90,
                    counterclock=False,
                    colors=colors[: len(render_values)],
                    wedgeprops={"width": 0.4, "edgecolor": "white", "linewidth": 2},
                )
                ax.axis("equal")
                ax.axis("off")

                primary_label = labels[0] if labels else "비율"
                primary_percent = donut_percentages[0] if donut_percentages else 0.0
                ax.text(
                    0,
                    0.08,
                    f"{primary_percent:.1f}%",
                    ha="center",
                    va="center",
                    fontsize=15,
                    fontweight="bold",
                    color="#0F172A",
                )
                ax.text(
                    0,
                    -0.16,
                    primary_label,
                    ha="center",
                    va="center",
                    fontsize=8.5,
                    color="#64748B",
                )

                legend_labels = build_donut_legend_labels(labels, safe_values)
                if legend_labels:
                    ax.legend(
                        wedges,
                        legend_labels,
                        loc="center left",
                        bbox_to_anchor=(0.98, 0.5),
                        frameon=False,
                        fontsize=8.5,
                        handlelength=1.2,
                        handletextpad=0.6,
                        borderaxespad=0.0,
                    )
                    fig.subplots_adjust(right=0.72)

            chart_path = f"{output_path}.{key}.png"
            fig.savefig(chart_path, dpi=150, bbox_inches="tight", transparent=True)
            plt.close(fig)

            data[key] = InlineImage(
                template,
                chart_path,
                width=Cm(width_cm),
                height=Cm(height_cm),
            )

        template.render(data)
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        template.save(str(output_file))
    except Exception as exc:
        print(f"보고서 생성 실패: {exc}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps({"ok": True}))


if __name__ == "__main__":
    main()
