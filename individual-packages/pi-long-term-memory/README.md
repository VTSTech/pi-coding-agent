# @vtstech/pi-long-term-memory

Long-term memory extension for the [Pi Coding Agent](https://github.com/badlogic/pi).

Persistent memory across sessions with automatic injection, AI-driven memory creation, and a ~4k token window.

## Install

```bash
pi install "npm:@vtstech/pi-long-term-memory"
```

## Features

- **Persistent Storage**: Memories survive across sessions and restarts
- **Auto-Injection**: Memory automatically injected at session start
- **AI-Driven Creation**: AI can request memories via `create_memory` tool
- **Memory Gate**: Confirm before creating memories (enabled by default)
- **Tag Organization**: Organize memories with tags
- **Token Management**: ~4k token window with auto-summarization

## Commands

```
/memory add <text>     - Add memory (with optional tags)
/memory list           - List all memories
/memory clear          - Clear memories (preserves metadata)
/memory clear-meta     - Reset metadata
/memory meta           - Show metadata
/memory backups        - List available memory backups
/memory stats          - Show comprehensive memory statistics
/memory-gate           - Toggle memory creation gate
/memory --help         - Show help
```

## Memory Statistics

The `/memory stats` command provides detailed metrics:
- Total memories count
- Total content characters
- Estimated tokens (rough calculation)
- Average tokens per memory
- Formatted context tokens
- Memory gate status
- Last compaction timestamp

## Enhanced Features
- **User-Prompted Metadata**: Primary User, Environment, and Framework fields are now prompted on first run
- **Backup System**: Automatic backup of pre-compacted memories to memory-backups directory
- **Enhanced Error Handling**: Comprehensive debugging and error handling throughout memory operations
- **Memory Injection Hooks**: Proper timing ensures memory is loaded and displayed before AI responses

## AI-Driven Memory

The AI can request memory creation via the `create_memory` tool:

```json
{
  "action": "create_memory",
  "content": "Decided on PostgreSQL for session storage",
  "tags": "decision, architecture",
  "reason": "Better consistency guarantees needed"
}
```

With the memory gate enabled (default), you'll be prompted to confirm before creation.

## Memory Injection

Memory is automatically injected at session start, BEFORE the AI generates its first response. The extension hooks into:
- `pre_session_start` - Ensures metadata is complete
- `session_start` - Displays memory context to user
- `before_provider_request` - Prepends memory to the API request

## Token Management

Memory operates within a ~4k token window with automatic summarization:
- Memories are sorted by importance and last accessed
- When approaching token limits, older/less important memories are compacted
- System preserves all memories across sessions

## Metadata

User-prompted on first run:
- **Primary User**: Prompted for user name
- **Environment**: Prompted for environment (e.g., development, production, G! Colab)
- **Framework**: Prompted for framework name (defaults to "Pi Coding Agent")

The system ensures metadata is complete before memory injection.

## Storage

Memory file: `.pi/agent/long-term-memory.json`

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#long-term-memory-extension)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)