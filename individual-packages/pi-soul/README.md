# @vtstech/pi-soul

SoulSpec extension for Pi Coding Agent — load and manage AI agent personas with progressive disclosure support, configurable persistence, and CLI startup flags.

## Features

- **Enhanced Partial Matching**: Flexible soul name matching with regex support
- **SoulSpec Loading**: Load AI agent personas defined in SoulSpec format
- **Progressive Disclosure**: Support for Level 1-3 disclosure levels
- **Multiple Soul Locations**: Load souls from global and project-local directories
- **Built-in Tools**: Tools for listing, loading, and inspecting souls with smart suggestions
- **CLI Commands**: Commands for soul management with partial matching support
- **Configurable Persistence**: `piSoul.persistence` controls where the active soul is stored (`global`, `session`, or `none`)
- **Startup Flag**: `--soul <name>` activates a soul before the first prompt without requiring a separate command
- **Lifecycle Events**: `soul:activated` / `soul:deactivated` events on the shared `pi.events` bus for companion extensions
- **Embodied Agent Support**: Hardware constraints and safety configurations
- **Smart Error Handling**: Helpful suggestions when no exact match is found

## Installation

```bash
# Install as part of the bundle
pi install git:github.com/VTSTech/pi-coding-agent

# Or install individually
pi install "npm:@vtstech/pi-soul
```

## Usage

### Tools

#### `load_soul`
Load a SoulSpec persona and build system prompt.

```typescript
// Parameters
{
  "soul_name": "nova-helper",  // Name of the soul to load
  "level": 2                   // Progressive disclosure level (1-3, default 2)
}
```

#### `list_souls`
List all available SoulSpec personas.

#### `soul_info`
Get detailed information about a soul.

### Commands

#### `/souls`
List available souls.

#### `/soul` (no arguments)
Opens an interactive picker that shows available souls plus `status` and `off` options.
After selecting a soul, a second picker asks for the disclosure level (1-3).

#### `/soul <name>`
Use a soul for the current session with partial matching support.

```bash
/soul                       # Interactive picker: choose soul + disclosure level
/soul nova-helper          # Use the Nova Helper persona (exact match)
/soul dev                  # Load any soul containing 'dev' (partial matching)
/soul /dev/ig              # Load any soul with 'dev' (case-insensitive regex)
/soul nova-helper --level 3  # Load soul at level 3 (full details)
/soul off                  # Clear the active soul
/soul status               # Show active soul, persistence, and auto-load config
/soul --help               # Show full help
```

#### CLI startup flags

```bash
pi --soul nova-helper          # Start with a soul already active
pi --soul nova-helper --soul-level 3  # Start with soul at level 3
pi --soul off                  # Clear persisted soul on startup
```

## Configuration

Configuration lives in `~/.pi/agent/soul-config.json` (global) or
`.pi/soul-config.json` (project-local override). If no file exists, it is
created automatically with defaults the first time the extension loads.

```json
{
  "persistence": "global",
  "autoLoad": true
}
```

| Key | Values | Default | Description |
|-----|--------|---------|-------------|
| `persistence` | `"global"`, `"session"`, `"none"` | `"global"` | Where to store the active soul |
| `autoLoad` | `true`, `false` | `true` | Auto-apply persisted soul on fresh startup (global mode only) |

Config file is created automatically at `~/.pi/agent/soul-config.json` with defaults
if it doesn't exist when the extension loads.

**Example — per-directory soul persistence with manual activation:**

```json
{
  "persistence": "session",
  "autoLoad": false
}
```

With this config, normal coding sessions start clean. An explicit `/soul dave` or
`--soul dave` saves the mapping `cwd → dave` into `.active-soul.json`. On `/reload`
or `/new` in that directory, Dave is restored automatically — without loading on
fresh Pi startup.

**`persistence` values:**
- `"global"` (default) — stores in `~/.pi/agent/.active-soul.json` as a single top-level entry; persists across all sessions including `/new`. Original upstream behavior, unchanged.
- `"session"` — stores in the same `.active-soul.json` file, but in a `sessions[]` array keyed by `process.cwd()`. Each project directory can have its own soul. Survives both `/reload` and `/new`. `/soul off` removes the current directory's entry from the array; other directories' souls are unaffected.
- `"none"` — memory only; soul is active for the current process only, never written to disk. Resets on `/reload` and `/new`.

**File structure with `persistence: "session"`:**
```json
{
  "sessions": [
    { "path": "/home/user/project-a", "soul": "dave", "level": 2, "updatedAt": 10001 },
    { "path": "/home/user/project-b", "soul": "iris", "level": 1, "updatedAt": 10002 }
  ]
}
```
Top-level fields (created by global mode) are preserved when writing in session mode — backward compatible with older Pi versions that only read the top-level `soul` key.

**`autoLoad`:** Only applies to `persistence: "global"`. Ignored for `session`
and `none` modes — those modes never auto-load on fresh startup.

- `true` (default with `"global"` persistence) — loads the single active soul
  from `.active-soul.json` on fresh Pi startup.
- `false` — persisted soul is not auto-applied on fresh startup; explicit
  `/soul <name>` or `--soul <name>` still works.

**Important:** `/reload` and `/new` always restore the active soul from the
persisted store, regardless of `autoLoad` or `persistence` mode. The soul was
explicitly activated within this Pi process.

**Project-local override example (`.pi/soul-config.json`):**

```json
{
  "persistence": "none",
  "autoLoad": false
}
```

With this config, run `pi --soul my-assistant` to activate a soul for that session only
without persisting it globally.

## Lifecycle Events

The extension emits events on the shared `pi.events` bus:

```typescript
// soul:activated — emitted on startup autoload, --soul flag, /soul command,
//                    or session restore on reload/new/resume/fork
pi.events.on("soul:activated", (payload) => {
  // payload.soul          — soul name
  // payload.displayName   — display name
  // payload.level         — disclosure level (1-3)
  // payload.manifest      — full SoulManifest
  // payload.persistence   — piSoul.persistence value
  // payload.autoLoad      — piSoul.autoLoad value
  // payload.source        — "startup" | "cli" | "command" | "reload" (all modes)
});

// soul:deactivated — emitted on --soul off or /soul off
pi.events.on("soul:deactivated", (payload) => {
  // payload.previousSoul, payload.previousDisplayName, payload.previousLevel
  // payload.persistence, payload.autoLoad
  // payload.source — "cli" | "command"
});
```

**Assistant integration pattern (companion extension):**

```typescript
// my-companion.ts — companion extension that reacts to soul activation
export default function(pi) {
  pi.events.on("soul:activated", (payload) => {
    if (payload.soul === "my-assistant") {
      // e.g. trigger Telegram connection, set UI mode, etc.
    }
  });
}
```


## Powerline Integration

When [pi-powerline-footer](https://github.com/nicobailon/pi-powerline-footer) is installed,
the active soul name appears in the status bar automatically. The extension calls
`ctx.ui.setStatus("pi-soul", displayName)` on activation and clears it on deactivation.

No configuration needed — the status appears in the `extension_statuses` secondary segment.
If powerline is not installed, the API call is a harmless no-op.
## Soul Structure

Souls are defined in `.pi/agent/souls/` directory with the following structure:

```
.pi/agent/souls/
├── nova-helper/
│   ├── soul.json     # Required: Soul manifest
│   ├── SOUL.md       # Required: Core persona
│   ├── IDENTITY.md   # Optional: Identity information
│   ├── STYLE.md      # Optional: Style guidelines
│   ├── AGENTS.md     # Optional: Agent behavior
│   └── HEARTBEAT.md  # Optional: Operational rhythm
└── robot-assistant/
    ├── soul.json
    ├── SOUL.md
    ├── IDENTITY.md
    ├── AGENTS.md
    ├── HEARTBEAT.md
    └── STYLE.md
```

## Soul Manifest Format

```json
{
  "specVersion": "0.5",
  "name": "nova-helper",
  "displayName": "Nova Helper",
  "version": "1.0.0",
  "description": "A helpful coding assistant",
  "author": {
    "name": "VTSTech"
  },
  "license": "MIT",
  "tags": ["coding", "assistant"],
  "category": "development/assistant",
  "environment": "virtual",
  "interactionMode": "text",
  "files": {
    "soul": "SOUL.md",
    "identity": "IDENTITY.md"
  },
  "disclosure": {
    "summary": "Helpful coding assistant"
  }
}
```

## Progressive Disclosure

- **Level 1**: Basic soul info (soul.json only)
- **Level 2**: Core persona (SOUL.md + IDENTITY.md)
- **Level 3**: Extended behavior (all files including examples)

## Soul Locations

The extension searches for souls in the following directories (in order):

1. `~/.pi/agent/souls/` - Global souls directory
2. `.pi/souls/` - Project-local souls directory
3. `./souls/` - Current directory souls

## Examples

### Loading a soul with partial matching
```bash
/soul nova-helper     # Exact match
/soul dev             # Partial match (matches 'developer', 'assistant-dev', etc.)
/soul /dev/ig         # Regex match (case-insensitive)
```

### Listing souls
```bash
/souls
```

### Getting soul info with partial matching
```bash
/soul_info dev        # Get info for souls matching 'dev'
/load_soul {"soul_name": "nova-helper"}
```

## Contributing

This package is part of the [Pi Coding Agent](https://github.com/VTSTech/pi-coding-agent) extensions bundle.

## License

MIT License - see LICENSE file for details.