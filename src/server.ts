import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ApiError, KisongApi } from "./api.js";

const shortText = (max: number) => z.string().trim().min(1).max(max);
const page = z.number().int().min(1).default(1);
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const generation = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

async function result(operation: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const data = await operation();
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  } catch (error) {
    const failure = error instanceof ApiError
      ? { code: error.code, message: error.message, ...(error.data ? { data: error.data } : {}) }
      : { code: "INTERNAL_ERROR", message: "The MCP tool failed." };
    return { isError: true, content: [{ type: "text", text: JSON.stringify(failure) }], structuredContent: failure };
  }
}

export function createServer(api: KisongApi): McpServer {
  const server = new McpServer(
    { name: "ki-song-erstellen-mcp", version: "0.1.0", title: "KI Song erstellen MCP", websiteUrl: "https://kisongerstellen.com" },
    { instructions: "Create music with KlangKI at kisongerstellen.com. Generation consumes account credits and returns an asynchronous task ID. Check credits before generating. Use kisong_get_task to check progress; typically allow 15–30 seconds between checks. Completion usually takes about 3–5 minutes. Never automatically resubmit a generation after a timeout: inspect kisong_list_tasks first. Track audioUrl values are playback URLs; paid MP3 downloads are available in the website account." },
  );

  server.registerTool("kisong_get_credits", {
    title: "Get music credits",
    description: "Read remaining account music credits and purchase status. This does not report the separate lyrics free-credit balance.",
    inputSchema: z.object({}).strict(), annotations: readOnly,
  }, async (_input, ctx) => result(() => api.request("/api/credits/get-user-credits", { method: "POST", signal: ctx.mcpReq.signal })));

  server.registerTool("kisong_generate_song", {
    title: "Create a song from a description",
    description: "KI Song erstellen: generate a song or instrumental from a description (up to 400 characters). Consumes music credits. Returns taskId immediately; call kisong_get_task later. Include language and style requirements in the prompt.",
    inputSchema: z.object({
      prompt: shortText(400).describe("Song idea, mood, genre and desired language."),
      isInstrumental: z.boolean().default(false).describe("Generate music without vocals."),
    }).strict(), annotations: generation,
  }, async (input, ctx) => result(() => api.request("/api/music/generate", {
    method: "POST", body: { formData: { type: "text", ...input } }, signal: ctx.mcpReq.signal, createsTask: true,
  })));

  server.registerTool("kisong_generate_from_lyrics", {
    title: "Create a song from lyrics",
    description: "Generate music from your lyrics, title and style, or create a custom instrumental. Consumes music credits. Returns an asynchronous taskId. For instrumentals, set isInstrumental=true; lyrics may be omitted.",
    inputSchema: z.object({
      prompt: shortText(5000).optional().describe("Lyrics, including verse/chorus structure. Required for songs with vocals."),
      title: shortText(80),
      styles: shortText(1000).describe("Genre, mood, tempo and instruments."),
      excludeStyles: shortText(1000).optional(),
      vocalGender: z.enum(["male", "female"]).optional().describe("Omit for a random voice."),
      isInstrumental: z.boolean().default(false),
    }).strict().refine((input) => input.isInstrumental || Boolean(input.prompt), {
      message: "Lyrics are required unless isInstrumental is true.", path: ["prompt"],
    }), annotations: generation,
  }, async (input, ctx) => result(() => api.request("/api/music/generate", {
    method: "POST", body: { formData: { type: "lyrics", ...input } }, signal: ctx.mcpReq.signal, createsTask: true,
  })));

  server.registerTool("kisong_generate_lyrics", {
    title: "Write song lyrics",
    description: "Write original lyrics with a title and style. Uses the account's separate free lyrics credits. Pass the resulting lyrics to kisong_generate_from_lyrics to create music.",
    inputSchema: z.object({
      prompt: shortText(1000),
      language: shortText(50).default("German").describe("Desired lyrics language, e.g. German or English."),
      style: shortText(180).optional(),
      title: shortText(80).optional(),
    }).strict(), annotations: generation,
  }, async (input, ctx) => result(() => api.request("/api/music/generate-lyrics", {
    method: "POST", body: input, signal: ctx.mcpReq.signal, createsTask: true,
  })));

  server.registerTool("kisong_get_task", {
    title: "Check song generation",
    description: "Read your music task's status and tracks. Stop polling when isTerminal=true; inspect errorCode for failures. audioUrl is a playback URL when a track is ready. Use the local taskId returned by generation.",
    inputSchema: z.object({ taskId: z.string().uuid() }).strict(), annotations: readOnly,
  }, async ({ taskId }, ctx) => result(() => api.request(`/api/music/task/status/${encodeURIComponent(taskId)}`, { signal: ctx.mcpReq.signal })));

  server.registerTool("kisong_list_tasks", {
    title: "List music generation history",
    description: "List your music task batches and their tracks, including pending and failed tasks. Check this after an uncertain music submission before starting another generation. Does not include lyrics-only tasks.",
    inputSchema: z.object({ page, limit: z.number().int().min(1).max(100).default(20) }).strict(), annotations: readOnly,
  }, async ({ page, limit }, ctx) => result(() => api.request(`/api/music/my-music?page=${page}&limit=${limit}`, { signal: ctx.mcpReq.signal })));

  server.registerTool("kisong_list_tracks", {
    title: "Find generated songs",
    description: "Browse or search playable tracks in your account. Returns paginated tracks with playback URLs, titles, lyrics and styles when available.",
    inputSchema: z.object({ page, limit: z.number().int().min(1).max(50).default(20), query: shortText(100).optional() }).strict(), annotations: readOnly,
  }, async ({ page, limit, query }, ctx) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (query) params.set("query", query);
    return result(() => api.request(`/api/music/tracks?${params}`, { signal: ctx.mcpReq.signal }));
  });

  return server;
}
