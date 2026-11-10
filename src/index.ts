#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { KisongApi } from "./api.js";
import { readConfig } from "./config.js";
import { createServer } from "./server.js";

try {
  const api = new KisongApi(readConfig());
  const handle = serveStdio(() => createServer(api), {
    onerror: () => console.error("ki-song-erstellen-mcp: MCP transport error."),
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => { void handle.close().finally(() => process.exit(0)); });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "ki-song-erstellen-mcp: startup failed.");
  process.exitCode = 1;
}
