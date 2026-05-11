# @vtstech/pi-throttle

Rate limit throttling for Pi Coding Agent to prevent 429 errors with OpenRouter and Zhipu AI.

## Features

- **Smart Request Queuing**: FIFO queue system that prevents 429 errors
- **Provider-Specific Limits**: Hardcoded rate limits for OpenRouter and Zhipu AI
- **Token-Aware Throttling**: Tracks token usage per provider
- **Real-time Status**: Live status display in footer (Q:queue, A:active, T:throttled)
- **Automatic Provider Detection**: Works with any provider configuration

## Installation

```bash
pi install npm:@vtstech/pi-throttle
```

Or using the local build:

```bash
pi install /path/to/pi-throttle-1.2.6.tgz
```

## Usage

### Commands

```bash
/throttle status      # Show current throttle status
/throttle reset        # Reset all counters and queues  
/throttle providers   # List configured providers and limits
/throttle stats       # Show detailed statistics
```

### Status Indicators

The extension shows real-time status in the footer:
- `Q:N` - Queue size (N requests waiting)
- `A:N` - Active requests (N currently being processed)
- `T:N` - Total throttled (N requests queued since start)
- `TH:OK` - No throttling active

## Rate Limits

### OpenRouter (Free Tier)
- 15 requests per minute
- 2,000 tokens per minute
- 900 requests per hour
- 120,000 tokens per hour

### Zhipu AI (Standard Tier)
- 100 requests per minute
- 50,000 tokens per minute
- 6,000 requests per hour
- 3,000,000 tokens per hour

### Fallback (Unknown Providers)
- 10 requests per minute
- 1,000 tokens per minute

## How It Works

1. **Request Detection**: Intercepts API tool calls before execution
2. **Limit Check**: Checks current usage against provider limits
3. **Queue or Execute**: Queues request if limits would be exceeded, executes immediately otherwise
4. **Token Tracking**: Updates actual token usage after completion
5. **Status Updates**: Shows real-time queue and usage information

## Configuration

The extension automatically detects your provider from `models.json` and applies the appropriate rate limits. No manual configuration required.

## Integration

The extension integrates seamlessly with Pi Coding Agent:
- Works with all providers (OpenRouter, Zhipu AI, Ollama, etc.)
- Non-API tools (bash, read, write, etc.) are not throttled
- Compatible with other extensions (security, status, etc.)
- Minimal performance impact

## License

MIT - See LICENSE file for details.

## Author

VTSTech - https://www.vts-tech.org
