import type { Config } from "./config.js";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class KisongApi {
  constructor(private readonly config: Config) {}

  async request(
    path: string,
    options: {
      method?: "GET" | "POST";
      body?: unknown;
      signal?: AbortSignal;
      createsTask?: boolean;
    } = {},
  ): Promise<Record<string, unknown>> {
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    // Submitted tasks may already be charged. Never retry requests automatically.
    const uncertain = options.createsTask
      ? " The submission outcome is unknown. Do not automatically resubmit. For music submissions, check kisong_list_tasks or your music history first."
      : "";
    let response: Response;
    let envelope: unknown;
    try {
      response = await fetch(new URL(path, this.config.baseUrl), {
        method: options.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
        redirect: "error",
      });
      try {
        envelope = await response.json();
      } catch {
        if (signal.aborted) throw signal.reason;
        throw new ApiError("INVALID_RESPONSE", `The API returned a non-JSON response (HTTP ${response.status}).${uncertain}`);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code = options.signal?.aborted ? "CANCELLED" : timeout.aborted ? "TIMEOUT" : "NETWORK_ERROR";
      throw new ApiError(code, `API request ${code === "TIMEOUT" ? "timed out" : code === "CANCELLED" ? "was cancelled" : "failed"}.${uncertain}`);
    }

    if (!isRecord(envelope) || typeof envelope.code !== "string") {
      throw new ApiError("INVALID_RESPONSE", `The API response has no application status code.${uncertain}`);
    }
    if (!response.ok || envelope.code !== "SUCCESS") {
      throw new ApiError(
        envelope.code === "SUCCESS" ? `HTTP_${response.status}` : envelope.code,
        typeof envelope.message === "string" ? envelope.message : `API error (HTTP ${response.status}).`,
        isRecord(envelope.data) ? envelope.data : undefined,
      );
    }
    if (!isRecord(envelope.data)) {
      throw new ApiError("INVALID_RESPONSE", `The API response has no data object.${uncertain}`);
    }
    return envelope.data;
  }
}
