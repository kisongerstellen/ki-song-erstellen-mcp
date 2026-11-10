# KI Song erstellen MCP – Songs und Musik mit KlangKI

Mit diesem MCP-Server können KI-Assistenten einen **[KI Song erstellen](https://kisongerstellen.com/)**: aus einer Beschreibung, eigenen Songtexten oder als Instrumental. Der Server verbindet lokale MCP-Clients mit der KlangKI API auf kisongerstellen.com.

[English documentation](README.en.md)

## Funktionen

- Songs aus Textbeschreibungen oder eigenen Songtexten erstellen.
- Instrumentalmusik für Videos, Podcasts und andere Projekte generieren.
- Deutsche und englische Songtexte mit Titel und Stil schreiben.
- Generierungsstatus prüfen, eigene Songs finden und Wiedergabe-URLs abrufen.
- Musik-Credits und Kaufstatus abfragen.

Die Musik kann für persönliche und kommerzielle Projekte verwendet werden. KlangKI bietet kostenlose Start-Credits; weitere Nutzung richtet sich nach dem [Guthaben und Tarif](https://kisongerstellen.com/pricing). MP3-Downloads für zahlende Nutzer stehen im Website-Konto bereit.

## Lokale Installation

Voraussetzungen: Node.js ab Version 22, pnpm und ein KlangKI-Konto.

1. Auf [kisongerstellen.com](https://kisongerstellen.com/) anmelden.
2. Unter [API Keys](https://kisongerstellen.com/api-keys) einen Schlüssel erstellen.
3. In diesem Projektverzeichnis die Abhängigkeiten installieren und bauen:

```sh
pnpm install --frozen-lockfile
pnpm build
```

Der Server wird lokal aus dem Build gestartet. Es ist keine npm-Veröffentlichung erforderlich.

## MCP-Client einrichten

In der MCP-Konfiguration des Clients folgenden Eintrag ergänzen. Den absoluten Pfad und den API Key ersetzen:

```json
{
  "mcpServers": {
    "ki-song-erstellen-mcp": {
      "command": "node",
      "args": ["/ABSOLUTER/PFAD/ki-song-erstellen-mcp/dist/index.js"],
      "env": {
        "KISONG_API_KEY": "sk-DEIN-API-KEY"
      }
    }
  }
}
```

Dieses `mcpServers`-Format wird etwa von Claude Desktop und Cursor verwendet. Falls `node` vom Client nicht gefunden wird, den absoluten Pfad zur Node.js-Datei als `command` eintragen. Konfigurationsvorlage: [examples/mcp.json](examples/mcp.json).

Die Variablen kommen vom MCP-Client oder aus der Shell. `.env`-Dateien werden nicht automatisch geladen. Für den manuellen Start mit Node.js:

```sh
cp .env.example .env
# KISONG_API_KEY in .env eintragen
node --env-file=.env dist/index.js
```

Der laufende Prozess wartet auf MCP-Nachrichten über stdin; stdout ist für das Protokoll reserviert.

## Tools

| Tool | Aufgabe |
| --- | --- |
| `kisong_get_credits` | Musik-Credits und Kaufstatus lesen |
| `kisong_generate_song` | Beschreibung → Song oder Instrumental |
| `kisong_generate_from_lyrics` | Eigene Songtexte → Song; Instrumentalmodus mit Titel und Stil |
| `kisong_generate_lyrics` | Thema → Titel, Stil und Songtext |
| `kisong_get_task` | Status und Ergebnisse einer Musikaufgabe lesen |
| `kisong_list_tasks` | Eigene Musikaufgaben samt Ergebnissen auflisten |
| `kisong_list_tracks` | Abspielbare Songs durchsuchen |

Musikaufgaben sind asynchron. Nach der Generierung kommt eine `taskId`; den Status anschließend mit `kisong_get_task` prüfen. Zwischen Abfragen etwa 15–30 Sekunden warten und bei `isTerminal: true` aufhören. Die Generierung dauert üblicherweise etwa 3–5 Minuten. Ein fertiger Track enthält eine `audioUrl` zur Wiedergabe. Bei fehlgeschlagenen Aufgaben kann `errorCode` den Grund erklären.

Musikgenerierung verwendet Musik-Credits. Songtexte verwenden einen separaten kostenlosen Credit-Pool; dessen Restbestand ist nicht in `kisong_get_credits` enthalten. Der Server wiederholt Anfragen nicht automatisch. Nach einem Timeout beim Erstellen eines Songs zuerst `kisong_list_tasks` oder die Website-Historie prüfen, da die Aufgabe bereits angelegt worden sein kann. Die Musik-Historie enthält keine reinen Songtextaufgaben.

## Beispiele

Als Nachricht an den verbundenen Assistenten:

> Prüfe meine Credits. Erstelle einen deutschsprachigen Indie-Pop-Song über einen Neuanfang in Berlin, mit warmen Gitarren und optimistischer Stimmung.

> Schreibe zuerst einen deutschen Songtext über einen Sommer am See. Vertone ihn danach als ruhigen Akustik-Pop mit weiblicher Stimme.

> Erstelle ein Instrumental für ein Podcast-Intro: Lo-Fi, dezentes Klavier, sanfter Beat. Prüfe später den Status und zeige mir die Wiedergabe-URL.

Direkte Tool-Argumente:

```json
{
  "prompt": "Deutschsprachiger Indie-Pop über einen Neuanfang in Berlin, warme Gitarren, optimistisch",
  "isInstrumental": false
}
```

Für `kisong_generate_from_lyrics`:

```json
{
  "title": "Sommer am See",
  "prompt": "[Verse]\nWir sitzen am Ufer, der Tag zieht vorbei\n[Chorus]\nDer Sommer am See macht die Gedanken frei",
  "styles": "Akustik-Pop, warme Gitarre, ruhig",
  "vocalGender": "female"
}
```

## Konfiguration und Entwicklung

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `KISONG_API_KEY` | erforderlich | API Key des KlangKI-Kontos (`sk-…`) |
| `KISONG_API_BASE_URL` | `https://kisongerstellen.com` | API-Ursprung; für lokale Entwicklung auch `http://localhost:3000` |
| `KISONG_API_TIMEOUT_MS` | `120000` | Zeitlimit pro Anfrage, 1000–300000 ms |

```sh
pnpm tsc --noEmit
pnpm test
pnpm build
```

Tests verwenden eine lokale simulierte API und erzeugen keine kostenpflichtigen Songs. Sie prüfen unter anderem MCP-Handshake, Tool-Schemas, Bearer-Authentifizierung, Request-Formate, asynchrone Statusantworten und Fehlerfälle.

Weitere technische Details: [docs/api-contract.md](docs/api-contract.md). Umsetzung mit dem offiziellen [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server) und lokalem stdio-Transport.

## Lizenz

MIT für den Servercode. Die Nutzung der KlangKI API erfolgt über das eigene KlangKI-Konto.
