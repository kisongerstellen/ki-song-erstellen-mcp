# KI Song erstellen MCP – AI music through KlangKI API

Create songs from descriptions, turn your lyrics into music, or generate instrumentals with [KI Song erstellen](https://kisongerstellen.com/). This local MCP server connects compatible assistants to the KlangKI API.

[Deutsche Dokumentation](README.md)

## Setup

Requires Node.js 22+, pnpm and a KlangKI account. Sign in at [kisongerstellen.com](https://kisongerstellen.com/) and create a key at [API Keys](https://kisongerstellen.com/api-keys).

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Add this entry to your client's MCP configuration, replacing the absolute path and key:

```json
{
  "mcpServers": {
    "ki-song-erstellen-mcp": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/ki-song-erstellen-mcp/dist/index.js"],
      "env": { "KISONG_API_KEY": "sk-YOUR-API-KEY" }
    }
  }
}
```

Claude Desktop and Cursor support this configuration shape. Use an absolute Node.js executable path if your client cannot find `node`. No npm publication is needed to run the local build. The process communicates over stdin/stdout.

Configuration is supplied through environment variables; `.env` files are not loaded automatically. To start manually, copy `.env.example` to `.env`, enter your key, then run `node --env-file=.env dist/index.js`.

## Available tools

| Tool | Purpose |
| --- | --- |
| `kisong_get_credits` | Read music credits and purchase status |
| `kisong_generate_song` | Generate a song or instrumental from a description |
| `kisong_generate_from_lyrics` | Generate from lyrics, title and style; also supports custom instrumentals |
| `kisong_generate_lyrics` | Write lyrics with a title and style, defaulting to German |
| `kisong_get_task` | Read a music task's progress and tracks |
| `kisong_list_tasks` | List music task history, including pending and failed tasks |
| `kisong_list_tracks` | Browse or search playable songs |

Music generation consumes account credits and returns a `taskId`. Check it with `kisong_get_task`, allowing roughly 15–30 seconds between checks, until `isTerminal` is true. Generation usually takes about 3–5 minutes. Completed tracks include playback `audioUrl` values. Failed tasks may include an `errorCode`.

Lyrics generation uses a separate free-credit pool, which `kisong_get_credits` does not report. Requests are never automatically retried. If a music submission times out, inspect `kisong_list_tasks` or your website history before submitting again. Lyrics-only tasks do not appear in the music history.

KlangKI offers trial credits and [paid plans](https://kisongerstellen.com/pricing). Paid MP3 downloads are available through the website account. Generated music can be used in personal and commercial projects.

Example requests to your assistant:

> Check my credits, then create a German indie-pop song about starting over in Berlin, with warm guitars and an optimistic mood.

> Write German lyrics about a summer by the lake, then turn them into a gentle acoustic pop song with a female voice.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `KISONG_API_KEY` | required | Your account's `sk-…` API key |
| `KISONG_API_BASE_URL` | `https://kisongerstellen.com` | HTTPS API origin; local HTTP is allowed on localhost |
| `KISONG_API_TIMEOUT_MS` | `120000` | Per-request timeout, 1000–300000 ms |

The MCP server uses the official [TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server) with stdio transport. See [the API contract](docs/api-contract.md) for limits and endpoints.

```sh
pnpm tsc --noEmit
pnpm test
pnpm build
```

Tests run against a local mock API without generating paid songs. The server code is licensed under MIT; API use requires your own KlangKI account.

## MCP directory listings

Public listings for this MCP server:

- [Glama](https://glama.ai/mcp/servers/kisongerstellen/ki-song-erstellen-mcp)
- [Claude Code Agents](https://www.claudecodeagents.com/mcp/ki-song-erstellen)
- [Cursor Directory](https://cursor.directory/plugins/ki-song-erstellen-mcp)
- [MCPRepository](https://mcprepository.com/kisongerstellen/ki-song-erstellen-mcp)
- [MCPServers](https://mcpservers.org/servers/kisongerstellen/ki-song-erstellen-mcp)
