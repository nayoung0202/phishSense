import { existsSync } from "node:fs";
import path from "node:path";

const REPORT_VENV_DIRNAME = ".venv-report";

export const getDefaultReportPythonBin = (cwd = process.cwd()) =>
  process.platform === "win32"
    ? path.join(cwd, REPORT_VENV_DIRNAME, "Scripts", "python.exe")
    : path.join(cwd, REPORT_VENV_DIRNAME, "bin", "python");

export const resolveReportPythonBin = (cwd = process.cwd()) => {
  const configuredPython = process.env.REPORT_PYTHON_BIN?.trim();
  if (configuredPython) {
    return configuredPython;
  }

  const defaultPythonBin = getDefaultReportPythonBin(cwd);
  return existsSync(defaultPythonBin) ? defaultPythonBin : "python3";
};
