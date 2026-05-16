# Pi Hex Edit Extension

[![npm version](https://img.shields.io/npm/v/@vtstech/pi-hex-edit)](https://www.npmjs.com/package/@vtstech/pi-hex-edit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-VTSTech-blue)](https://github.com/VTSTech/pi-coding-agent)

A robust hex stream-based edit replacement for Pi Coding Agent that provides reliable, byte-level file editing with validation and transparency.

## Features

- **Hex Stream Validation**: Uses byte-level comparison instead of text matching for maximum reliability
- **LLM-callable Tools**: Tools that Pi can directly call for file operations
- **Hash Verification**: Shows SHA-256 hashes before and after edits for verification
- **Multiple Occurrence Handling**: Warns when multiple matches found and uses the first occurrence
- **Detailed Output**: Displays file sizes, byte changes, and exact positions
- **Error Handling**: Clear error messages for missing files and text not found
- **Binary File Support**: Perfect for both text and binary file editing

## Installation

```bash
# Install via npm
npm install @vtstech/pi-hex-edit

# Or install directly from GitHub
pi install git:github.com/VTSTech/pi-coding-agent#main --filter pi-hex-edit
```

## Available Tools

### 1. `hex_edit`

Edit file using hex stream validation for reliable byte-level editing.

```typescript
{
  "name": "hex_edit",
  "parameters": {
    "file": "string",           // Path to the file to edit
    "oldText": "string",        // Exact text to replace  
    "newText": "string"         // Replacement text
  }
}
```

**Example Usage:**
```json
{
  "tool": "hex_edit",
  "parameters": {
    "file": "src/app.js",
    "oldText": "console.log('Hello World');",
    "newText": "console.log('Hello Universe!');"
  }
}
```

### 2. `hex_edit_show`

Show file content with line numbers and hex preview.

```typescript
{
  "name": "hex_edit_show", 
  "parameters": {
    "file": "string"           // Path to the file to show
  }
}
```

**Output includes:**
- File size and SHA-256 hash
- Line-by-line view with text preview (60 chars)
- Hex bytes preview for each line (16 bytes)
- Line numbers for easy reference

### 3. `hex_edit_validate`

Validate that old text exists in file and show positions.

```typescript
{
  "name": "hex_edit_validate",
  "parameters": {
    "file": "string",          // Path to the file to validate
    "searchText": "string"     // Text to search for in the file
  }
}
```

**Output includes:**
- Number of occurrences found
- Byte positions for each occurrence
- Context around each match (±20 bytes)
- Clear success/failure indication

### 4. `hex_edit_diff`

Show byte-level diff between two files.

```typescript
{
  "name": "hex_edit_diff",
  "parameters": {
    "file1": "string",         // Path to the first file
    "file2": "string"         // Path to the second file
  }
}
```

**Output includes:**
- File sizes and hashes for both files
- "Files are identical" or detailed differences
- Line-by-line diff showing additions (+) and deletions (-)
- Truncated to 50 lines for readability

## Usage Examples

### Basic File Edit
```bash
# Pi can call: hex_edit(file: "config.txt", oldText: "debug=false", newText: "debug=true")
```

### Validate Text Exists
```bash
# Pi can call: hex_edit_validate(file: "app.js", searchText: "function main")
```

### Show File Details
```bash
# Pi can call: hex_edit_show(file: "README.md")
```

### Compare Files
```bash
# Pi can call: hex_edit_diff(file1: "old.txt", file2: "new.txt")
```

## Why Hex Edit?

### Problems with Regular Text Editing
- **Text encoding issues** with different character sets
- **Line ending differences** between platforms (CRLF vs LF)
- **Partial matches** causing unintended replacements
- **Binary file corruption** when using text-based editors

### Hex Edit Solutions
- **Byte-level precision** - Works exactly on the bytes you specify
- **Encoding agnostic** - Doesn't care about text encodings
- **Exact matching** - Only replaces the exact byte sequence
- **Binary safe** - Perfect for images, executables, and other binary files

## Technical Details

### Hash Algorithm
- **SHA-256** for file content verification
- **Simple hash** for quick comparison during editing

### Search Algorithm
- **Linear scan** through file content
- **All occurrences** found and reported
- **First occurrence** used for editing

### Replacement Algorithm
- **Buffer manipulation** for precise byte replacement
- **No text parsing** involved
- **Position-based** replacement guaranteed

## Error Handling

| Error Type | Description | Solution |
|------------|-------------|----------|
| File not found | Specified file doesn't exist | Check file path and permissions |
| Text not found | Old text not found in file | Use hex_edit_validate to verify |
| Multiple matches | Multiple occurrences found | Tool will use first occurrence |
| Permission denied | Insufficient file permissions | Check file permissions |
| Invalid encoding | Text encoding issues | Use exact byte sequences |

## Integration

The extension automatically integrates with Pi Coding Agent:

1. **Tool Registration**: All tools are available to Pi immediately
2. **Slash Commands**: User-friendly slash commands also available
3. **Error Handling**: Graceful error reporting and recovery
4. **Validation**: Built-in validation for all parameters

## Development

### Building
```bash
# Build the extension
npm run build

# Or build the entire project
npm run build:hex-edit
```

### Testing
```bash
# Run tests (when implemented)
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

**VTSTech**  
Website: [www.vts-tech.org](https://www.vts-tech.org)  
GitHub: [VTSTech](https://github.com/VTSTech)  
Repository: [pi-coding-agent](https://github.com/VTSTech/pi-coding-agent)

## Support

For issues and questions:
- GitHub Issues: [pi-coding-agent/issues](https://github.com/VTSTech/pi-coding-agent/issues)
- Email: support@vts-tech.org