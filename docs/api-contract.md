# KlangKI API contract

This adapter follows the application routes and domain validation in the KlangKI project, reviewed on 2026-11-10. It uses account API keys through `Authorization: Bearer sk-…`. Every API call is made on behalf of that key's owner.

## Endpoint mapping

| MCP tool | Method | API route | Body / query |
| --- | --- | --- | --- |
| `kisong_get_credits` | POST | `/api/credits/get-user-credits` | No body |
| `kisong_generate_song` | POST | `/api/music/generate` | `{ "formData": { "type": "text", "prompt": "…", "isInstrumental": false } }` |
| `kisong_generate_from_lyrics` | POST | `/api/music/generate` | `{ "formData": { "type": "lyrics", "title": "…", "styles": "…", "prompt": "…" } }` |
| `kisong_generate_lyrics` | POST | `/api/music/generate-lyrics` | `prompt`, optional `language`, `style`, `title` |
| `kisong_get_task` | GET | `/api/music/task/status/{taskId}` | Local task UUID |
| `kisong_list_tasks` | GET | `/api/music/my-music` | `page`, `limit` (1–100) |
| `kisong_list_tracks` | GET | `/api/music/tracks` | `page`, `limit` (1–50), optional `query` (≤100 characters) |

Do not use `/api/music/task/{taskId}`: that legacy route does not return task status. The active status route includes `/status/`.

The API responds with `{ "code": "SUCCESS", "message": "ok", "data": { … } }`. Application failures can arrive with HTTP 200, so both HTTP status and `code` must be checked. Successful tool results unwrap `data` into text JSON and `structuredContent`. Failed tool results set `isError: true` and retain application error codes and any returned data, such as a task ID or insufficient-credit details.

## Input boundaries

- Text-to-song: `prompt` is required, up to 400 characters. Put language, mood, genre and other requirements in the description.
- Lyrics-to-song: `title` (≤80) and `styles` (≤1000) are required. `prompt` (≤5000) is required with vocals and optional for an instrumental. Optional `excludeStyles` is limited by this adapter to 1000 characters. Optional `vocalGender` is `male` or `female`; omit for a random choice.
- Lyrics writing: `prompt` (≤1000) is required; `language` (≤50), `style` (≤180) and `title` (≤80) are optional. This adapter defaults language to `German`.
- Input strings are trimmed. Unknown tool fields are rejected; the adapter sends only public parameters and the music generation type.

## Lifecycle and billing

Music creation returns `taskId`, `status`, `isTerminal: false` and usually `createdAt`. The status endpoint returns `isTerminal`, tracks and optional failure `errorCode`; completed tracks expose playback URLs. Partial results may appear before the whole task finishes. Consumers should follow `isTerminal` rather than maintaining their own terminal-state list.

Generation uses the account's credit policies. The server does not hardcode prices. Lyrics use the separate lyrics free-credit pool. The music history endpoint does not include lyrics-only tasks. Backend refunds and result access remain governed by the existing application.

No automatic HTTP retries are performed, because repeating a POST can create another charged task. Timeouts and cancellation do not prove that a submission failed. Resolve uncertain music submissions through task history. MP3 downloads, public sharing, uploads, stem separation and custom voices are not exposed by this adapter.
