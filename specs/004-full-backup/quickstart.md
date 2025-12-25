# Quickstart: Full Backup and Restore

**Date**: 2025-12-24
**Feature**: 004-full-backup

## CLI Usage

### Create a Backup

```bash
# Create backup with automatic timestamped filename
cursor-history backup

# Specify output location
cursor-history backup -o ~/my-cursor-backup.zip

# Overwrite existing backup
cursor-history backup -o ~/backup.zip --force
```

### View Backup Contents

```bash
# List sessions from backup
cursor-history list --backup ~/backup.zip

# Show a specific session from backup
cursor-history show 1 --backup ~/backup.zip

# Search within backup
cursor-history search "authentication" --backup ~/backup.zip

# Export from backup
cursor-history export --all --backup ~/backup.zip -o ~/exported/
```

### Restore from Backup

```bash
# Restore to default Cursor data location
cursor-history restore ~/backup.zip

# Force overwrite existing data
cursor-history restore ~/backup.zip --force

# Restore to custom location
cursor-history restore ~/backup.zip --target /path/to/cursor/data
```

### Manage Backups

```bash
# List all backups in default directory
cursor-history list-backups

# List backups in custom directory
cursor-history list-backups ~/my-backups
```

---

## Library Usage

### Basic Backup

```typescript
import { createBackup } from 'cursor-history';

async function backupChatHistory() {
  const result = await createBackup();

  if (result.success) {
    console.log(`Backup created: ${result.backupPath}`);
    console.log(`Sessions: ${result.manifest.stats.sessionCount}`);
  } else {
    console.error(`Backup failed: ${result.error}`);
  }
}
```

### Backup with Progress

```typescript
import { createBackup } from 'cursor-history';

async function backupWithProgress() {
  const result = await createBackup({
    outputPath: './my-backup.zip',
    force: true,
    onProgress: (progress) => {
      const percent = Math.round(
        (progress.filesCompleted / progress.totalFiles) * 100
      );
      console.log(`[${progress.phase}] ${percent}% - ${progress.currentFile}`);
    }
  });

  return result;
}
```

### Restore from Backup

```typescript
import { restoreBackup, validateBackup } from 'cursor-history';

async function restoreChatHistory(backupPath: string) {
  // Validate first
  const validation = await validateBackup(backupPath);

  if (validation.status === 'invalid') {
    console.error('Backup is corrupted:', validation.errors);
    return;
  }

  if (validation.status === 'warnings') {
    console.warn('Some files are corrupted:', validation.corruptedFiles);
    // Continue anyway - graceful degradation
  }

  // Restore
  const result = await restoreBackup({
    backupPath,
    force: true
  });

  console.log(`Restored ${result.filesRestored} files to ${result.targetPath}`);
}
```

### Read from Backup

```typescript
import { listSessions, getSession, searchSessions } from 'cursor-history';

async function browseBackup(backupPath: string) {
  // List all sessions in backup
  const sessions = await listSessions({ backupPath });
  console.log(`Found ${sessions.total} sessions in backup`);

  // Get a specific session
  const session = await getSession(0, { backupPath });
  console.log(`Session: ${session.title}`);

  // Search within backup
  const results = await searchSessions('error', { backupPath });
  console.log(`Found ${results.length} matches`);
}
```

### List Available Backups

```typescript
import { listBackups, getDefaultBackupDir } from 'cursor-history';

async function showBackups() {
  const backupDir = getDefaultBackupDir();
  const backups = await listBackups(backupDir);

  console.log(`Backups in ${backupDir}:\n`);

  for (const backup of backups) {
    if (backup.manifest) {
      console.log(`${backup.filename}`);
      console.log(`  Created: ${backup.manifest.createdAt}`);
      console.log(`  Sessions: ${backup.manifest.stats.sessionCount}`);
      console.log(`  Size: ${(backup.fileSize / 1024 / 1024).toFixed(1)} MB\n`);
    } else {
      console.log(`${backup.filename} - Invalid: ${backup.error}`);
    }
  }
}
```

---

## Error Handling

```typescript
import {
  createBackup,
  restoreBackup,
  isBackupError,
  isInvalidBackupError,
  FileExistsError,
  InsufficientSpaceError
} from 'cursor-history';

async function safeBackup() {
  try {
    const result = await createBackup();
    return result;
  } catch (error) {
    if (error instanceof FileExistsError) {
      console.log('Backup already exists. Use force: true to overwrite.');
    } else if (error instanceof InsufficientSpaceError) {
      console.log('Not enough disk space for backup.');
    } else if (isBackupError(error)) {
      console.log('Backup failed:', error.message);
    } else {
      throw error;
    }
  }
}

async function safeRestore(backupPath: string) {
  try {
    const result = await restoreBackup({ backupPath });
    return result;
  } catch (error) {
    if (isInvalidBackupError(error)) {
      console.log('Backup file is corrupted or invalid.');
    } else {
      throw error;
    }
  }
}
```

---

## Common Workflows

### Migrate to New Machine

```bash
# On old machine: create backup
cursor-history backup -o ~/cursor-backup.zip

# Transfer backup.zip to new machine via USB, cloud, etc.

# On new machine: restore
cursor-history restore ~/cursor-backup.zip
```

### Pre-Update Backup

```bash
# Before updating Cursor, create a backup
cursor-history backup

# After update, verify data is intact
cursor-history list

# If something went wrong, restore
cursor-history restore ~/cursor-history-backups/cursor_history_backup_<timestamp>.zip --force
```

### Archive Old Conversations

```bash
# Create dated backup
cursor-history backup -o ~/archives/cursor-2025-Q4.zip

# View old conversations without restoring
cursor-history show 5 --backup ~/archives/cursor-2025-Q4.zip

# Export specific session from archive
cursor-history export 5 --backup ~/archives/cursor-2025-Q4.zip -o ~/exported/
```
