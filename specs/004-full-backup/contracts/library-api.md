# Library API Contract: Full Backup and Restore

**Date**: 2025-12-24
**Feature**: 004-full-backup

## New Exports

### `createBackup(config?: BackupConfig): Promise<BackupResult>`

Create a full backup of Cursor chat history.

```typescript
import { createBackup } from 'cursor-history';

// Basic usage
const result = await createBackup();
console.log(`Backup created: ${result.backupPath}`);

// With options
const result = await createBackup({
  outputPath: '/path/to/backup.zip',
  force: true,
  onProgress: (progress) => {
    console.log(`${progress.phase}: ${progress.filesCompleted}/${progress.totalFiles}`);
  }
});
```

**Parameters**:
```typescript
interface BackupConfig {
  sourcePath?: string;    // Default: platform Cursor data path
  outputPath?: string;    // Default: ~/cursor-history-backups/<timestamp>.zip
  force?: boolean;        // Default: false
  onProgress?: (progress: BackupProgress) => void;
}
```

**Returns**:
```typescript
interface BackupResult {
  success: boolean;
  backupPath: string;
  manifest: BackupManifest;
  durationMs: number;
  error?: string;
}
```

**Errors**:
- `BackupError`: General backup failure
- `NoDataError`: No Cursor data found
- `FileExistsError`: Output file exists (use force: true)
- `InsufficientSpaceError`: Not enough disk space

---

### `restoreBackup(config: RestoreConfig): Promise<RestoreResult>`

Restore Cursor chat history from a backup file.

```typescript
import { restoreBackup } from 'cursor-history';

// Basic usage
const result = await restoreBackup({
  backupPath: '/path/to/backup.zip'
});

// With options
const result = await restoreBackup({
  backupPath: '/path/to/backup.zip',
  targetPath: '/custom/cursor/data',
  force: true,
  onProgress: (progress) => {
    console.log(`${progress.phase}: ${progress.integrityStatus}`);
  }
});
```

**Parameters**:
```typescript
interface RestoreConfig {
  backupPath: string;     // Required: path to backup zip
  targetPath?: string;    // Default: platform Cursor data path
  force?: boolean;        // Default: false
  onProgress?: (progress: RestoreProgress) => void;
}
```

**Returns**:
```typescript
interface RestoreResult {
  success: boolean;
  targetPath: string;
  filesRestored: number;
  warnings: string[];     // Checksum warnings (files still restored)
  durationMs: number;
  error?: string;
}
```

**Errors**:
- `RestoreError`: General restore failure
- `BackupNotFoundError`: Backup file not found
- `InvalidBackupError`: Backup is corrupted or invalid
- `TargetExistsError`: Target has existing data (use force: true)
- `IntegrityError`: Critical checksum failures

---

### `listBackups(directory?: string): Promise<BackupInfo[]>`

List available backup files in a directory.

```typescript
import { listBackups } from 'cursor-history';

// Default directory
const backups = await listBackups();

// Custom directory
const backups = await listBackups('/path/to/backups');

for (const backup of backups) {
  console.log(`${backup.filename}: ${backup.manifest?.stats.sessionCount} sessions`);
}
```

**Parameters**:
- `directory?: string` - Directory to scan (default: `~/cursor-history-backups`)

**Returns**:
```typescript
interface BackupInfo {
  filePath: string;
  filename: string;
  fileSize: number;
  modifiedAt: Date;
  manifest?: BackupManifest;
  error?: string;         // If backup is invalid
}
```

---

### `validateBackup(backupPath: string): Promise<BackupValidation>`

Validate a backup file's integrity without restoring.

```typescript
import { validateBackup } from 'cursor-history';

const validation = await validateBackup('/path/to/backup.zip');

if (validation.status === 'valid') {
  console.log('Backup is valid');
} else if (validation.status === 'warnings') {
  console.log('Backup has issues:', validation.corruptedFiles);
} else {
  console.log('Backup is invalid:', validation.errors);
}
```

**Returns**:
```typescript
interface BackupValidation {
  status: 'valid' | 'warnings' | 'invalid';
  manifest?: BackupManifest;
  validFiles: string[];
  corruptedFiles: string[];
  missingFiles: string[];
  errors: string[];
}
```

---

### `getDefaultBackupDir(): string`

Get the default backup directory path.

```typescript
import { getDefaultBackupDir } from 'cursor-history';

const dir = getDefaultBackupDir();
// Returns: /home/user/cursor-history-backups (Linux)
// Returns: C:\Users\user\cursor-history-backups (Windows)
// Returns: /Users/user/cursor-history-backups (macOS)
```

---

## Modified Functions

### `listSessions(config?: LibraryConfig)`

Existing function now accepts `backupPath` in config.

```typescript
import { listSessions } from 'cursor-history';

// From live data (existing behavior)
const sessions = await listSessions();

// From backup file (new)
const sessions = await listSessions({
  backupPath: '/path/to/backup.zip'
});
```

**Config Addition**:
```typescript
interface LibraryConfig {
  // ... existing options ...
  backupPath?: string;  // NEW: Read from backup instead of live data
}
```

---

### `getSession(index: number, config?: LibraryConfig)`

Existing function now accepts `backupPath` in config.

```typescript
import { getSession } from 'cursor-history';

// From backup file
const session = await getSession(0, {
  backupPath: '/path/to/backup.zip'
});
```

---

### `searchSessions(query: string, config?: LibraryConfig)`

Existing function now accepts `backupPath` in config.

```typescript
import { searchSessions } from 'cursor-history';

// Search within backup
const results = await searchSessions('error handling', {
  backupPath: '/path/to/backup.zip'
});
```

---

### `exportSessionToMarkdown(index: number, config?: LibraryConfig)`

### `exportSessionToJson(index: number, config?: LibraryConfig)`

### `exportAllSessionsToMarkdown(config?: LibraryConfig)`

### `exportAllSessionsToJson(config?: LibraryConfig)`

All export functions now accept `backupPath` in config.

---

## Error Classes

### New Errors

```typescript
import {
  BackupError,
  RestoreError,
  BackupNotFoundError,
  InvalidBackupError,
  FileExistsError,
  InsufficientSpaceError,
  IntegrityError,
  // Type guards
  isBackupError,
  isRestoreError,
  isInvalidBackupError
} from 'cursor-history';
```

**Error Hierarchy**:
```text
Error
├── BackupError
│   ├── NoDataError
│   ├── FileExistsError
│   └── InsufficientSpaceError
├── RestoreError
│   ├── BackupNotFoundError
│   ├── InvalidBackupError
│   ├── TargetExistsError
│   └── IntegrityError
```

---

## Type Exports

All types from the data model are exported:

```typescript
import type {
  BackupManifest,
  BackupFileEntry,
  BackupStats,
  BackupInfo,
  BackupConfig,
  BackupProgress,
  BackupResult,
  RestoreConfig,
  RestoreProgress,
  RestoreResult,
  BackupValidation
} from 'cursor-history';
```
