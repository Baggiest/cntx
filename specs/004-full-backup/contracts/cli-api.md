# CLI API Contract: Full Backup and Restore

**Date**: 2025-12-24
**Feature**: 004-full-backup

## New Commands

### `cursor-history backup`

Create a full backup of all Cursor chat history data.

```text
Usage: cursor-history backup [options]

Create a backup of all chat history data

Options:
  -o, --output <path>    Output file path (default: ~/cursor-history-backups/<timestamp>.zip)
  -f, --force            Overwrite existing backup file
  --data-path <path>     Custom Cursor data path
  --json                 Output result as JSON
  -h, --help             Display help
```

**Examples**:
```bash
# Create backup with default name
cursor-history backup

# Create backup at specific location
cursor-history backup -o ~/my-backup.zip

# Overwrite existing backup
cursor-history backup -o ~/backup.zip --force

# Output JSON result
cursor-history backup --json
```

**Exit Codes**:
- `0`: Success
- `1`: General error
- `2`: No data to backup
- `3`: Output file exists (use --force)
- `4`: Insufficient disk space

**Output (human)**:
```text
Creating backup...
  Scanning files... 5 workspaces, 42 sessions
  Backing up globalStorage/state.vscdb... done
  Backing up workspaceStorage/abc123/state.vscdb... done
  ...
  Writing manifest... done

Backup created: ~/cursor-history-backups/cursor_history_backup_2025-12-24_143052.zip
  Size: 15.2 MB
  Sessions: 42
  Workspaces: 5
```

**Output (JSON)**:
```json
{
  "success": true,
  "backupPath": "/home/user/cursor-history-backups/cursor_history_backup_2025-12-24_143052.zip",
  "manifest": {
    "version": "1.0.0",
    "createdAt": "2025-12-24T14:30:52.000Z",
    "stats": {
      "totalSize": 15945728,
      "sessionCount": 42,
      "workspaceCount": 5
    }
  },
  "durationMs": 2340
}
```

---

### `cursor-history restore`

Restore chat history from a backup file.

```text
Usage: cursor-history restore <backup-file> [options]

Restore chat history from a backup file

Arguments:
  backup-file            Path to backup zip file

Options:
  -t, --target <path>    Target Cursor data path (default: platform default)
  -f, --force            Overwrite existing data
  --data-path <path>     Alias for --target
  --json                 Output result as JSON
  -h, --help             Display help
```

**Examples**:
```bash
# Restore to default location
cursor-history restore ~/backup.zip

# Restore with overwrite
cursor-history restore ~/backup.zip --force

# Restore to custom location
cursor-history restore ~/backup.zip --target /path/to/cursor/data
```

**Exit Codes**:
- `0`: Success
- `1`: General error
- `2`: Backup file not found
- `3`: Invalid or corrupted backup
- `4`: Target exists (use --force)
- `5`: Integrity check failed

**Output (human)**:
```text
Validating backup...
  Manifest version: 1.0.0
  Files: 6 (15.2 MB)
  Integrity: ✓ all checksums valid

Restoring to /home/user/.config/Cursor/User/...
  Extracting globalStorage/state.vscdb... done
  Extracting workspaceStorage/abc123/state.vscdb... done
  ...

Restore complete!
  Files restored: 6
  Sessions: 42
  Workspaces: 5
```

**Output (JSON)**:
```json
{
  "success": true,
  "targetPath": "/home/user/.config/Cursor/User",
  "filesRestored": 6,
  "warnings": [],
  "durationMs": 1234
}
```

---

### `cursor-history list-backups`

List available backup files with metadata.

```text
Usage: cursor-history list-backups [options] [directory]

List available backup files

Arguments:
  directory              Directory to scan (default: ~/cursor-history-backups)

Options:
  --json                 Output as JSON
  -h, --help             Display help
```

**Examples**:
```bash
# List backups in default directory
cursor-history list-backups

# List backups in custom directory
cursor-history list-backups ~/my-backups

# Output as JSON
cursor-history list-backups --json
```

**Exit Codes**:
- `0`: Success (even if no backups found)
- `1`: General error
- `2`: Directory not found

**Output (human)**:
```text
Backups in /home/user/cursor-history-backups:

  #  Filename                                    Date        Size     Sessions
  1  cursor_history_backup_2025-12-24_143052.zip 2025-12-24  15.2 MB  42
  2  cursor_history_backup_2025-12-20_091530.zip 2025-12-20  12.8 MB  35
  3  cursor_history_backup_2025-12-15_163422.zip 2025-12-15  10.1 MB  28

3 backups found
```

**Output (JSON)**:
```json
{
  "directory": "/home/user/cursor-history-backups",
  "backups": [
    {
      "filename": "cursor_history_backup_2025-12-24_143052.zip",
      "filePath": "/home/user/cursor-history-backups/cursor_history_backup_2025-12-24_143052.zip",
      "fileSize": 15945728,
      "modifiedAt": "2025-12-24T14:30:52.000Z",
      "manifest": {
        "version": "1.0.0",
        "stats": { "sessionCount": 42, "workspaceCount": 5 }
      }
    }
  ]
}
```

---

## Modified Commands

### `cursor-history list`

Add `--backup` option to list sessions from a backup file.

```text
Options:
  --backup <file>        Read from backup file instead of live data
  ... (existing options)
```

**Example**:
```bash
cursor-history list --backup ~/backup.zip
```

---

### `cursor-history show`

Add `--backup` option to show session from a backup file.

```text
Options:
  --backup <file>        Read from backup file instead of live data
  ... (existing options)
```

**Example**:
```bash
cursor-history show 1 --backup ~/backup.zip
```

---

### `cursor-history search`

Add `--backup` option to search within a backup file.

```text
Options:
  --backup <file>        Read from backup file instead of live data
  ... (existing options)
```

**Example**:
```bash
cursor-history search "error handling" --backup ~/backup.zip
```

---

### `cursor-history export`

Add `--backup` option to export from a backup file.

```text
Options:
  --backup <file>        Read from backup file instead of live data
  ... (existing options)
```

**Example**:
```bash
cursor-history export --all --backup ~/backup.zip -o exported/
```

---

## Global Options

No changes to global options. All existing global options (`--json`, `--data-path`, `--workspace`) continue to work.

When `--backup` is specified:
- `--data-path` is ignored (backup file is the data source)
- `--workspace` filters within the backup
