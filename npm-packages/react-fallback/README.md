# @vtstech/pi-react-fallback

ReAct fallback extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Text-based tool calling bridge for models without native function calling support.

## Install

```bash
pi install "npm:@vtstech/pi-react-fallback"
```

## How It Works

Automatically loaded — no commands needed. When a model lacks native tool calling:

- Parses `Thought:`, `Action:`, `Action Input:` patterns from model output
- Multiple regex strategies including parenthetical style and loose matching
- Bridges text-based tool calls into Pi's native tool execution pipeline
- Falls back when native tool calls fail

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#react-fallback-react-fallbackts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
