# @vtstech/pi-workspace

Workspace management extension for Pi Coding Agent - Save, load, and manage workspace state with git repository detection and content archiving.

## Features

- **Workspace Commands**: `save`, `load`, `list`, `delete`, `current` commands for managing workspaces
- **Git Repository Detection**: Automatically detects git repos in the current directory (up to 2 levels deep)
- **Extension Tracking**: Captures extension sources (local, git, or package-based)
- **Content Archiving**: Archives workspace files when no git repos are present
- **Smart Filtering**: Skips large files (>100KB), binary files, and `!dirs` reference folders
- **Soul Integration**: Saves and restores soul state with workspaces
- **Skills Tracking**: Saves and restores skills list

## Installation

```bash
# Install as part of the bundle
pi install git:github.com/VTSTech/pi-coding-agent

# Or install individually
pi install "npm:@vtstech/pi-workspace"
```

## Usage

### Commands

#### `/workspace`
Show workspace management help.

#### `/workspace save <name>`
Save current workspace state including configs, skills, extensions, and soul.

#### `/workspace load <name>`
Load a saved workspace and restore its state.

#### `/workspace list`
List all saved workspaces.

#### `/workspace delete <name>`
Delete a saved workspace.

#### `/workspace current`
Show current workspace state including extensions, skills, and git repos.

## Workspace State

Workspaces are stored in `~/.pi/agent/workspaces/` as `.ws.json` files. Each workspace captures:

- Session configuration
- Skills list
- Extensions (with source information: local/git/package)
- Soul state (name and level)
- Git repository information (path and remote URL)
- Archived content files (when no git repos are present)

## Git Repository Detection

When saving a workspace, the extension automatically:

1. Checks if the current directory is a git repository
2. Scans subdirectories (up to 2 levels deep) for git repos
3. Skips `!dirs` reference folders
4. Captures remote URLs for tracked repositories

## Content Archiving

When no git repositories are found in the workspace, the extension archives:

- Files under 100KB
- Skips: `.log`, `.tmp`, `.cache`, `.lock`, `.swp`, `.swo` extensions
- Binary files (`.png`, `.jpg`, `.gif`)
- Files containing null bytes (except TypeScript/JavaScript)

## Extension Sources

Extensions are tracked with their source:

- **local**: Extensions from `~/.pi/agent/extensions/`
- **git**: Extensions from cloned git repositories
- **package**: Extensions from git-based packages

## File Structure

```
.pi/agent/workspaces/
├── my-workspace.ws.json
├── project-backup.ws.json
└── default.ws.json
```

## Contributing

This package is part of the [Pi Coding Agent](https://github.com/VTSTech/pi-coding-agent) extensions bundle.

## License

MIT License - see LICENSE file for details.