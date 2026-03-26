import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getDefaultReportPythonBin, resolveReportPythonBin } from "./reportPythonRuntime";

const originalReportPythonBin = process.env.REPORT_PYTHON_BIN;
const tempDirs: string[] = [];

afterEach(() => {
  if (originalReportPythonBin === undefined) {
    delete process.env.REPORT_PYTHON_BIN;
  } else {
    process.env.REPORT_PYTHON_BIN = originalReportPythonBin;
  }

  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

const createTempWorkspace = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "report-python-runtime-"));
  tempDirs.push(dir);
  return dir;
};

describe("reportPythonRuntime", () => {
  it("REPORT_PYTHON_BIN이 있으면 해당 경로를 우선 사용한다", () => {
    process.env.REPORT_PYTHON_BIN = "/custom/python";

    expect(resolveReportPythonBin("/tmp/workspace")).toBe("/custom/python");
  });

  it("기본 .venv-report python이 있으면 그 경로를 사용한다", () => {
    delete process.env.REPORT_PYTHON_BIN;
    const workspace = createTempWorkspace();
    const pythonBin = getDefaultReportPythonBin(workspace);

    mkdirSync(path.dirname(pythonBin), { recursive: true });
    writeFileSync(pythonBin, "");

    expect(resolveReportPythonBin(workspace)).toBe(pythonBin);
  });

  it("준비된 venv가 없으면 시스템 python3로 fallback 한다", () => {
    delete process.env.REPORT_PYTHON_BIN;
    const workspace = createTempWorkspace();

    expect(resolveReportPythonBin(workspace)).toBe("python3");
  });
});
