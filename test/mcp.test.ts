import assert from "node:assert/strict";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { ApiError, KisongApi } from "../src/api.js";
import { readConfig } from "../src/config.js";

const taskId = "550e8400-e29b-41d4-a716-446655440000";
const key = "sk-local-test-only";

async function mockApi(handler: (req: IncomingMessage, res: ServerResponse, body: unknown) => void) {
  const server = createHttpServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    handler(req, res, raw ? JSON.parse(raw) : undefined);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

function json(res: ServerResponse, data: unknown, code = "SUCCESS") {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ code, message: code === "SUCCESS" ? "ok" : "Not enough credits", data }));
}

test("compiled stdio server: handshake, tool boundaries and application errors", async t => {
  const calls: { method: string; url: string; body: unknown; auth: string | undefined }[] = [];
  let fail = false;
  const api = await mockApi((req, res, body) => {
    calls.push({ method: req.method!, url: req.url!, body, auth: req.headers.authorization });
    if (fail) return json(res, { taskId }, "INSUFFICIENT_CREDITS");
    if (req.url === "/api/credits/get-user-credits") return json(res, { leftCredits: 8, isRecharged: true });
    if (req.url === "/api/music/generate") return json(res, { taskId, status: "SUBMITTED", isTerminal: false });
    if (req.url === "/api/music/generate-lyrics") return json(res, {
      result: { title: "Sommer", style: "Pop", lyrics: "[Verse]\nAm See" }, taskId,
    });
    if (req.url?.startsWith("/api/music/task/status/")) return json(res, {
      taskId, status: "SUCCESS", isTerminal: true,
      tracks: [{ musicId: "song-1", audioUrl: "https://cdn.example/song.mp3", status: "SUCCESS" }],
    });
    if (req.url?.startsWith("/api/music/tracks?")) return json(res, { items: [], total: 0, page: 1, limit: 20, hasMore: false });
    if (req.url?.startsWith("/api/music/my-music?")) return json(res, { batches: [], total: 0, page: 1, limit: 20 });
    res.writeHead(404).end();
  });
  t.after(api.close);
  const transport = new StdioClientTransport({
    command: process.execPath, args: ["dist/index.js"], cwd: process.cwd(),
    env: { KISONG_API_KEY: key, KISONG_API_BASE_URL: api.url }, stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", chunk => { stderr += String(chunk); });
  const client = new Client({ name: "kisong-test", version: "1.0.0" });
  t.after(() => client.close());
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 7);
  assert.equal(tools.find(tool => tool.name === "kisong_get_credits")?.annotations?.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === "kisong_generate_song")?.annotations?.idempotentHint, false);

  const credits = await client.callTool({ name: "kisong_get_credits", arguments: {} });
  assert.deepEqual(credits.structuredContent, { leftCredits: 8, isRecharged: true });
  assert.equal(calls.at(-1)?.method, "POST");
  assert.equal(calls.at(-1)?.body, undefined);

  const song = await client.callTool({ name: "kisong_generate_song", arguments: { prompt: "  Deutscher Pop  " } });
  assert.deepEqual(song.structuredContent, { taskId, status: "SUBMITTED", isTerminal: false });
  assert.deepEqual(calls.at(-1)?.body, { formData: { type: "text", prompt: "Deutscher Pop", isInstrumental: false } });
  const custom = { title: "Sommer", styles: "Pop", prompt: "Am See", vocalGender: "female" };
  await client.callTool({ name: "kisong_generate_from_lyrics", arguments: custom });
  assert.deepEqual(calls.at(-1)?.body, { formData: { type: "lyrics", ...custom, isInstrumental: false } });
  await client.callTool({ name: "kisong_generate_from_lyrics", arguments: { title: "Intro", styles: "Lo-Fi", isInstrumental: true } });
  assert.deepEqual(calls.at(-1)?.body, { formData: { type: "lyrics", title: "Intro", styles: "Lo-Fi", isInstrumental: true } });
  await client.callTool({ name: "kisong_generate_lyrics", arguments: { prompt: "Sommer am See" } });
  assert.deepEqual(calls.at(-1)?.body, { prompt: "Sommer am See", language: "German" });
  const status = await client.callTool({ name: "kisong_get_task", arguments: { taskId } });
  assert.deepEqual(status.structuredContent, {
    taskId, status: "SUCCESS", isTerminal: true,
    tracks: [{ musicId: "song-1", audioUrl: "https://cdn.example/song.mp3", status: "SUCCESS" }],
  });
  assert.equal(calls.at(-1)?.url, `/api/music/task/status/${taskId}`);
  await client.callTool({ name: "kisong_list_tasks", arguments: {} });
  assert.equal(calls.at(-1)?.url, "/api/music/my-music?page=1&limit=20");
  await client.callTool({ name: "kisong_list_tracks", arguments: { query: "Sommer & See" } });
  assert.equal(calls.at(-1)?.url, "/api/music/tracks?page=1&limit=20&query=Sommer+%26+See");
  assert(calls.every(call => call.auth === `Bearer ${key}`));

  const count = calls.length;
  for (const [name, args] of [
    ["kisong_generate_song", { prompt: "x".repeat(401) }],
    ["kisong_generate_song", { prompt: " " }],
    ["kisong_generate_song", { prompt: "Song", providerModelName: "private" }],
    ["kisong_generate_from_lyrics", { title: "Title", styles: "Pop" }],
    ["kisong_get_task", { taskId: "../../api-keys" }],
    ["kisong_list_tracks", { limit: 51 }],
  ] as const) {
    // SDK versions may surface validation as either a tool error or JSON-RPC error.
    try {
      const rejected = await client.callTool({ name, arguments: args });
      assert.equal(rejected.isError, true);
    } catch (error) {
      assert.match(String(error), /valid|big|required|unrecognized|lyrics/i);
    }
  }
  assert.equal(calls.length, count, "Invalid inputs must not reach the API or consume credits");
  fail = true;
  const failure = await client.callTool({ name: "kisong_generate_song", arguments: { prompt: "Song" } });
  assert.equal(failure.isError, true);
  assert.deepEqual(failure.structuredContent, { code: "INSUFFICIENT_CREDITS", message: "Not enough credits", data: { taskId } });
  assert.equal(calls.length, count + 1, "Failed submissions must not be retried");
  assert.equal(stderr, "", "No transport errors should be logged");
});

test("API boundary: HTTP errors, malformed responses, redirects and timeout do not retry", async t => {
  let mode = "http";
  let calls = 0;
  const api = await mockApi((_req, res) => {
    calls++;
    if (mode === "timeout") return;
    if (mode === "redirect") return void res.writeHead(302, { Location: "/other" }).end();
    if (mode === "html") return void res.end("<html>Unavailable</html>");
    if (mode === "invalid") return void res.end(JSON.stringify({ success: true }));
    if (mode === "missing") return void res.end(JSON.stringify({ code: "SUCCESS" }));
    res.statusCode = 503;
    json(res, {}, "SUCCESS");
  });
  t.after(api.close);
  const client = new KisongApi({ apiKey: key, baseUrl: api.url, timeoutMs: 100 });
  for (const [scenario, code] of [
    ["http", "HTTP_503"], ["html", "INVALID_RESPONSE"], ["invalid", "INVALID_RESPONSE"],
    ["missing", "INVALID_RESPONSE"], ["redirect", "NETWORK_ERROR"], ["timeout", "TIMEOUT"],
  ]) {
    mode = scenario!;
    await assert.rejects(client.request("/api/music/generate", { method: "POST", createsTask: true }), error => {
      assert(error instanceof ApiError);
      assert.equal(error.code, code);
      if (scenario === "timeout") assert.match(error.message, /unknown.*Do not automatically resubmit/);
      return true;
    });
  }
  assert.equal(calls, 6);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.request("/api/music/generate", { signal: controller.signal, createsTask: true }), error => {
    assert(error instanceof ApiError);
    assert.equal(error.code, "CANCELLED");
    return true;
  });
  assert.equal(calls, 6);
});

test("configuration rejects unusable credentials, origins and timeout bounds", () => {
  assert.throws(() => readConfig({}), /KISONG_API_KEY/);
  for (const origin of ["file:///tmp", "http://example.com", "https://example.com/path", "https://user:pass@example.com", "https://example.com?x=1"]) {
    assert.throws(() => readConfig({ KISONG_API_KEY: key, KISONG_API_BASE_URL: origin }), /BASE_URL/);
  }
  for (const timeout of ["0", "500", "300001", "NaN", "1.5"]) {
    assert.throws(() => readConfig({ KISONG_API_KEY: key, KISONG_API_TIMEOUT_MS: timeout }), /TIMEOUT/);
  }
  assert.equal(readConfig({ KISONG_API_KEY: key }).baseUrl, "https://kisongerstellen.com");
  assert.equal(readConfig({ KISONG_API_KEY: key, KISONG_API_BASE_URL: "http://localhost:3000" }).baseUrl, "http://localhost:3000");
  const failed = spawnSync(process.execPath, ["dist/index.js"], { env: { KISONG_API_KEY: "" }, encoding: "utf8" });
  assert.equal(failed.status, 1);
  assert.equal(failed.stdout, "");
  assert.match(failed.stderr, /KISONG_API_KEY/);
});
