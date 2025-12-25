# Data Model: Full Backup and Restore

**Date**: 2025-12-24
**Feature**: 004-full-backup

## Entities

### BackupManifest

Metadata stored in the manifest.json file within the backup zip.

```typescript
interface BackupManifest {
  /** Manifest schema version for backward compatibility */
  version: string;  // e.g., "1.0.0"

  /** ISO 8601 timestamp when backup was created */
  createdAt: string;

  /** Platform where backup was created */
  sourcePlatform: 'darwin' | 'win32' | 'linux';

  /** cursor-history version that created the backup */
  cursorHistoryVersion: string;

  /** List of files in the backup with metadata */
  files: BackupFileEntry[];

  /** Aggregate statistics for quick display */
  stats: BackupStats;
}

interface BackupFileEntry {
  /** Path within zip (forward slashes, relative to zip root) */
  path: string;

  /** Original file size in bytes */
  size: number;

  /** SHA-256 checksum for integrity verification */
  checksum: string;  // "sha256:<hex>"

  /** File type for categorization */
  type: 'global-db' | 'workspace-db' | 'manifest';
}

interface BackupStats {
  /** Total uncompressed size of all files */
  totalSize: number;

  /** Number of chat sessions across all workspaces */
  sessionCount: number;

  /** Number of workspaces included */
  workspaceCount: number;
}
```

**Validation Rules**:
- `version` must be semver format
- `createdAt` must be valid ISO 8601
- `files` must contain at least one global-db entry
- `checksum` must match pattern `sha256:[a-f0-9]{64}`
- All `path` values must use forward slashes

---

### BackupInfo

Metadata about a backup file for listing purposes (without opening the zip).

```typescript
interface BackupInfo {
  /** Full path to the backup file */
  filePath: string;

  /** Backup filename */
  filename: string;

  /** File size in bytes */
  fileSize: number;

  /** File modification time (from filesystem) */
  modifiedAt: Date;

  /** Parsed manifest (if valid backup) */
  manifest?: BackupManifest;

  /** Error if backup is invalid or corrupted */
  error?: string;
}
```

---

### BackupConfig

Configuration for backup creation operation.

```typescript
interface BackupConfig {
  /** Source Cursor data path (default: platform-specific) */
  sourcePath?: string;

  /** Output file path (default: ~/cursor-history-backups/<timestamp>.zip) */
  outputPath?: string;

  /** Overwrite existing file without prompting */
  force?: boolean;

  /** Progress callback for UI updates */
  onProgress?: (progress: BackupProgress) => void;
}

interface BackupProgress {
  /** Current operation phase */
  phase: 'scanning' | 'backing-up' | 'compressing' | 'finalizing';

  /** Current file being processed */
  currentFile?: string;

  /** Files completed / total files */
  filesCompleted: number;
  totalFiles: number;

  /** Bytes completed / total bytes */
  bytesCompleted: number;
  totalBytes: number;
}
```

---

### RestoreConfig

Configuration for restore operation.

```typescript
interface RestoreConfig {
  /** Path to backup zip file */
  backupPath: string;

  /** Target Cursor data path (default: platform-specific) */
  targetPath?: string;

  /** Overwrite existing data without prompting */
  force?: boolean;

  /** Progress callback for UI updates */
  onProgress?: (progress: RestoreProgress) => void;
}

interface RestoreProgress {
  /** Current operation phase */
  phase: 'validating' | 'extracting' | 'finalizing';

  /** Current file being processed */
  currentFile?: string;

  /** Files completed / total files */
  filesCompleted: number;
  totalFiles: number;

  /** Integrity status */
  integrityStatus: 'pending' | 'passed' | 'warnings' | 'failed';

  /** Files with checksum warnings (if any) */
  corruptedFiles?: string[];
}
```

---

### BackupResult

Result of a backup operation.

```typescript
interface BackupResult {
  /** Whether backup succeeded */
  success: boolean;

  /** Path to created backup file */
  backupPath: string;

  /** Generated manifest */
  manifest: BackupManifest;

  /** Duration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;
}
```

---

### RestoreResult

Result of a restore operation.

```typescript
interface RestoreResult {
  /** Whether restore succeeded */
  success: boolean;

  /** Path where data was restored */
  targetPath: string;

  /** Number of files restored */
  filesRestored: number;

  /** Files with integrity warnings (still restored) */
  warnings: string[];

  /** Duration in milliseconds */
  durationMs: number;

  /** Error message if failed */
  error?: string;
}
```

---

### BackupValidation

Result of backup integrity validation.

```typescript
interface BackupValidation {
  /** Overall validation status */
  status: 'valid' | 'warnings' | 'invalid';

  /** Manifest if parseable */
  manifest?: BackupManifest;

  /** Files that passed checksum verification */
  validFiles: string[];

  /** Files that failed checksum verification */
  corruptedFiles: string[];

  /** Files missing from manifest */
  missingFiles: string[];

  /** Detailed error messages */
  errors: string[];
}
```

---

## Backup Zip Structure

```text
cursor_history_backup_2025-12-24_143052.zip
├── manifest.json                           # BackupManifest
├── globalStorage/
│   └── state.vscdb                         # Global storage DB
└── workspaceStorage/
    ├── 1a2b3c.../
    │   └── state.vscdb                     # Workspace 1 DB
    ├── 4d5e6f.../
    │   └── state.vscdb                     # Workspace 2 DB
    └── ...
```

**Path Conventions**:
- All paths use forward slashes (cross-platform)
- Relative to zip root (no leading slash)
- Preserve original directory structure from Cursor data path

---

## State Transitions

### Backup Operation States

```text
IDLE → SCANNING → BACKING_UP → COMPRESSING → FINALIZING → COMPLETE
                                                       ↘ FAILED
```

| State | Description |
|-------|-------------|
| IDLE | No backup in progress |
| SCANNING | Discovering DB files and calculating sizes |
| BACKING_UP | Using SQLite backup API to copy DBs |
| COMPRESSING | Adding files to zip archive |
| FINALIZING | Writing manifest and closing zip |
| COMPLETE | Backup succeeded |
| FAILED | Error occurred; cleanup partial files |

### Restore Operation States

```text
IDLE → VALIDATING → EXTRACTING → FINALIZING → COMPLETE
                              ↘ ROLLING_BACK → FAILED
```

| State | Description |
|-------|-------------|
| IDLE | No restore in progress |
| VALIDATING | Checking backup integrity and checksums |
| EXTRACTING | Copying files from zip to target |
| FINALIZING | Verifying extracted files |
| ROLLING_BACK | Undoing partial restore on failure |
| COMPLETE | Restore succeeded |
| FAILED | Error occurred; original state preserved |

---

## Relationships

```text
┌─────────────────┐     ┌──────────────┐
│  BackupConfig   │────▶│ BackupResult │
└─────────────────┘     └──────────────┘
        │                      │
        ▼                      ▼
┌─────────────────┐     ┌──────────────────┐
│ BackupProgress  │     │  BackupManifest  │
└─────────────────┘     └──────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │ BackupFileEntry  │
                        └──────────────────┘

┌─────────────────┐     ┌───────────────┐
│  RestoreConfig  │────▶│ RestoreResult │
└─────────────────┘     └───────────────┘
        │
        ▼
┌─────────────────┐     ┌──────────────────┐
│ RestoreProgress │     │ BackupValidation │
└─────────────────┘     └──────────────────┘
```
