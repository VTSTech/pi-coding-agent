# @vtstech/pi-soul

SoulSpec extension for Pi Coding Agent - Load and manage AI agent personas with progressive disclosure support and enhanced partial matching.

## Features

- **Enhanced Partial Matching**: Flexible soul name matching with regex support for better tab autocomplete compatibility
- **SoulSpec Loading**: Load AI agent personas defined in SoulSpec format
- **Progressive Disclosure**: Support for Level 1-3 disclosure levels
- **Multiple Soul Locations**: Load souls from global and project-local directories
- **Built-in Tools**: Tools for listing, loading, and inspecting souls with smart suggestions
- **CLI Commands**: Commands for soul management with partial matching support
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

#### `/soul <name>`
Use a soul for the current session with partial matching support.

```bash
/soul nova-helper     # Use the Nova Helper persona (exact match)
/soul dev             # Load any soul containing 'dev' (partial matching)
/soul /dev/ig         # Load any soul with 'dev' (case-insensitive regex)
/soul --help          # Show enhanced help with partial matching examples
```

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