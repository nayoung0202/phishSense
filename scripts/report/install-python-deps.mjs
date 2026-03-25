import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

const readOsRelease = () => {
  if (process.platform !== "linux" || !existsSync("/etc/os-release")) {
    return null;
  }

  try {
    const raw = readFileSync("/etc/os-release", "utf8");
    const fields = Object.fromEntries(
      raw
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const separatorIndex = line.indexOf("=");
          if (separatorIndex === -1) {
            return [line, ""];
          }

          const key = line.slice(0, separatorIndex);
          const value = line.slice(separatorIndex + 1).replace(/^"/, "").replace(/"$/, "");
          return [key, value];
        }),
    );

    return {
      id: fields.ID?.toLowerCase() ?? "",
      idLike: fields.ID_LIKE?.toLowerCase().split(/\s+/).filter(Boolean) ?? [],
    };
  } catch {
    return null;
  }
};

const getPythonMajorMinorVersion = (command) => {
  const result = spawnSync(
    command,
    ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  if (result.error || result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
};

const isDebianFamily = () => {
  const osRelease = readOsRelease();

  if (!osRelease) {
    return false;
  }

  return (
    osRelease.id === "debian" ||
    osRelease.id === "ubuntu" ||
    osRelease.idLike.includes("debian") ||
    osRelease.idLike.includes("ubuntu")
  );
};

const buildVenvFailureGuidance = (stderr) => {
  const normalizedStderr = stderr.toLowerCase();
  const guidance = [];

  if (
    normalizedStderr.includes("ensurepip is not available") ||
    normalizedStderr.includes("no module named ensurepip") ||
    normalizedStderr.includes("no module named venv")
  ) {
    guidance.push("시스템 Python에 venv/ensurepip 지원이 빠져 있습니다.");

    if (isDebianFamily()) {
      const pythonVersion = getPythonMajorMinorVersion("python3");

      guidance.push("Debian/Ubuntu 계열에서는 venv 패키지를 먼저 설치해야 할 수 있습니다.");

      if (pythonVersion) {
        guidance.push(`- sudo apt install python${pythonVersion}-venv`);
      }

      guidance.push("- sudo apt install python3-venv");
      guidance.push("- 설치 후 npm install 또는 npm run report:deps:install 재실행");
    } else {
      guidance.push("사용 중인 배포판의 Python venv/ensurepip 패키지를 설치한 뒤 다시 실행하세요.");
    }
  }

  guidance.push("- 대안: REPORT_PYTHON_BIN으로 준비된 Python/venv 경로 지정");

  return guidance.join("\n");
};

const createLocalVenvOrFail = () => {
  log(`creating local venv at ${path.relative(repoRoot, defaultVenvDir)}`);

  const result = spawnSync("python3", ["-m", "venv", defaultVenvDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (!result.error && result.status === 0) {
    return;
  }

  const details = [];

  if (result.error) {
    details.push(result.error.message);
  }

  if (result.stdout?.trim()) {
    details.push(result.stdout.trim());
  }

  if (result.stderr?.trim()) {
    details.push(result.stderr.trim());
  }

  details.push(buildVenvFailureGuidance(result.stderr ?? ""));

  fail(
    "프로젝트 로컬 Python 가상환경 생성에 실패했습니다. Python 3 venv/ensurepip 설치 상태를 확인하세요.",
    details.join("\n\n"),
  );
};

const resolvePythonBin = () => {
  const configuredPython = process.env.REPORT_PYTHON_BIN?.trim();
  if (configuredPython) {
    return configuredPython;
  }

  if (!existsSync(defaultVenvPython)) {
    createLocalVenvOrFail();
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
