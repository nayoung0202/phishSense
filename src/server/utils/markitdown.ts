import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MARKITDOWN_PYTHON_SCRIPT = `
import json
import sys

try:
    from markitdown import MarkItDown
except Exception:
    sys.exit(3)

try:
    result = MarkItDown().convert(sys.argv[1])
    text = getattr(result, "text_content", "") or ""
    print(json.dumps({"text": text}, ensure_ascii=False))
except Exception:
    sys.exit(4)
`.trim();

const normalizeMarkdown = (value: string) => value.replace(/\0/g, "").replace(/\r\n/g, "\n").trim();

export const extractReferenceMarkdownFromImage = async (args: {
  fileName: string;
  buffer: Buffer;
}) => {
  const tempDir = await mkdtemp(join(tmpdir(), "phishsense-markitdown-"));
  const tempFilePath = join(tempDir, args.fileName || "reference-image");

  try {
    await writeFile(tempFilePath, args.buffer);

    const { stdout } = await execFileAsync("python3", ["-c", MARKITDOWN_PYTHON_SCRIPT, tempFilePath], {
      maxBuffer: 8 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as { text?: string };
    const markdown = normalizeMarkdown(parsed.text ?? "");
    return markdown.length > 0 ? markdown : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Command failed|No module named|exit code 3/i.test(message)) {
      console.warn("[markitdown] image markdown extraction failed", {
        fileName: args.fileName,
        message,
      });
    }

    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};
