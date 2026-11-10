export interface Config {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiKey = env.KISONG_API_KEY?.trim();
  if (!apiKey?.startsWith("sk-") || apiKey.length <= 3) {
    throw new Error("Set KISONG_API_KEY to an API key from https://kisongerstellen.com/api-keys.");
  }
  let url: URL;
  try {
    url = new URL(env.KISONG_API_BASE_URL ?? "https://kisongerstellen.com");
  } catch {
    throw new Error("KISONG_API_BASE_URL must be an HTTP(S) origin.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && local))
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("KISONG_API_BASE_URL must be an HTTPS origin, or HTTP on localhost.");
  }
  const timeoutMs = Number(env.KISONG_API_TIMEOUT_MS ?? 120_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 300_000) {
    throw new Error("KISONG_API_TIMEOUT_MS must be an integer from 1000 to 300000.");
  }
  return { apiKey, baseUrl: url.origin, timeoutMs };
}
