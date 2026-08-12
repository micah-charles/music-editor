import { defaultFeatureFlags, type FeatureFlags } from "./features";

export const workspaceIds = [
  "home",
  "projects",
  "score",
  "piano-input",
  "piano-roll",
  "track-editor",
  "recording",
  "omr-review",
  "analysis",
  "learning",
  "export",
  "settings"
] as const;

export type WorkspaceId = typeof workspaceIds[number];

const workspaceIdSet = new Set<string>(workspaceIds);
const aiAnalysisPath = /\/(?:ai-)?analysis\/?$/i;
const aiAnalysisHash = /^#\/?(?:workspace\/)?(?:ai-)?analysis\/?$/i;

export function resolveWorkspaceId(
  value: unknown,
  flags: FeatureFlags = defaultFeatureFlags
): WorkspaceId {
  if (value === "mixer") return "track-editor";
  if (value === "analysis" && !flags.aiAnalysis) return "score";
  return typeof value === "string" && workspaceIdSet.has(value)
    ? value as WorkspaceId
    : "score";
}

export function isDisabledAiAnalysisUrl(
  url: URL,
  flags: FeatureFlags = defaultFeatureFlags
): boolean {
  if (flags.aiAnalysis) return false;
  return aiAnalysisPath.test(url.pathname)
    || aiAnalysisHash.test(url.hash)
    || url.searchParams.get("workspace") === "analysis";
}

export function safeUrlWithoutAiAnalysis(url: URL): string {
  const safe = new URL(url.href);
  safe.pathname = safe.pathname.replace(aiAnalysisPath, "/");
  if (aiAnalysisHash.test(safe.hash)) safe.hash = "";
  if (safe.searchParams.get("workspace") === "analysis") {
    safe.searchParams.delete("workspace");
  }
  return `${safe.pathname}${safe.search}${safe.hash}`;
}

export function redirectDisabledFeatureRoute(
  location: Pick<Location, "href"> = window.location,
  history: Pick<History, "replaceState"> = window.history,
  flags: FeatureFlags = defaultFeatureFlags
): boolean {
  const url = new URL(location.href);
  if (!isDisabledAiAnalysisUrl(url, flags)) return false;
  history.replaceState(null, "", safeUrlWithoutAiAnalysis(url));
  return true;
}
