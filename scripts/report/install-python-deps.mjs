import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const requirementsPath = path.join(repoRoot, "scripts", "report", "requirements.txt");
const defaultVenvDir = path.join(repoRoot, ".venv-report");
const defaultVenvPython =
  process.platform === "win32"
    ? path.join(defaultVenvDir, "Scripts", "python.exe")
    : path.join(defaultVenvDir, "bin", "python");

for (const envFile of [".env.local", ".env"]) {
  const envPath = path.join(repoRoot, envFile);
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

const checkOnly = process.argv.includes("--check");
const skipInstall = process.env.REPORT_SKIP_PYTHON_DEPS_INSTALL === "true";

const log = (message) => {
  console.log(`[report-python-deps] ${message}`);
};

const fail = (message, detail) => {
  console.error(`[report-python-deps] ${message}`);
  if (detail) {
    console.error(detail);
  }
  process.exit(1);
};

const runOrFail = (command, args, message) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.error) {
    fail(message, result.error.message);
  }

  if (result.status !== 0) {
    fail(message, `${command} exited with code ${result.status ?? "unknown"}`);
  }
};

const resolvePythonBin = () => {
  const configuredPython = process.env.REPORT_PYTHON_BIN?.trim();
  if (configuredPython) {
    return configuredPython;
  }

  if (!existsSync(defaultVenvPython)) {
    log(`creating local venv at ${path.relative(repoRoot, defaultVenvDir)}`);
    runOrFail(
      "python3",
      ["-m", "venv", defaultVenvDir],
      "프로젝트 로컬 Python 가상환경 생성에 실패했습니다. Python 3 설치 상태를 확인하세요.",
    );
  }

  return defaultVenvPython;
};

if (skipInstall) {
  log("skipped by REPORT_SKIP_PYTHON_DEPS_INSTALL=true");
  process.exit(0);
}

if (!existsSync(requirementsPath)) {
  fail("리포트 Python requirements 파일을 찾을 수 없습니다.", requirementsPath);
}

const pythonBin = resolvePythonBin();

if (!checkOnly) {
  runOrFail(
    pythonBin,
    ["-m", "pip", "install", "--upgrade", "pip"],
    "pip 업그레이드에 실패했습니다.",
  );
  runOrFail(
    pythonBin,
    [
      "-m",
      "pip",
      "install",
      "--disable-pip-version-check",
      "-r",
      requirementsPath,
    ],
    "리포트 Python 의존성 설치에 실패했습니다.",
  );
}

runOrFail(
  pythonBin,
  ["-c", "import docxtpl, matplotlib; print('report deps ok')"],
  "리포트 Python 의존성 검증에 실패했습니다.",
);

log(`ready (${pythonBin})`);
