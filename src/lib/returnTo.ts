const DEFAULT_RETURN_TO = "/";
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const ENCODED_SLASH_PATTERN = /%2f/i;
const ENCODED_BACKSLASH_PATTERN = /%5c/i;

const getPathnameCandidate = (candidate: string) => {
  const queryIndex = candidate.search(/[?#]/);
  return queryIndex === -1 ? candidate : candidate.slice(0, queryIndex);
};

const hasEncodedSeparatorsInPathname = (candidate: string) => {
  const pathname = getPathnameCandidate(candidate);
  return (
    ENCODED_SLASH_PATTERN.test(pathname) || ENCODED_BACKSLASH_PATTERN.test(pathname)
  );
};

export const normalizeReturnTo = (candidate: string | null | undefined) => {
  if (!candidate) return DEFAULT_RETURN_TO;
  if (CONTROL_CHAR_PATTERN.test(candidate)) return DEFAULT_RETURN_TO;
  if (!candidate.startsWith("/")) return DEFAULT_RETURN_TO;
  if (candidate.startsWith("//")) return DEFAULT_RETURN_TO;
  if (candidate.includes("\\")) return DEFAULT_RETURN_TO;
  if (hasEncodedSeparatorsInPathname(candidate)) return DEFAULT_RETURN_TO;

  const pathname = getPathnameCandidate(candidate);
  if (pathname.startsWith("/api/auth")) return DEFAULT_RETURN_TO;

  return candidate;
};
