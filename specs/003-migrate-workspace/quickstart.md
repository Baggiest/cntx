# Quickstart: Migrate Workspace History

## CLI Usage

### Migrate Single Session

```bash
# Move session by index (from `cursor-history list`)
cursor-history migrate-session 3 /path/to/new/project

# Move session by ID
cursor-history migrate-session abc123-def456 /path/to/new/project

# Move multiple sessions
cursor-history migrate-session 1,3,5 /path/to/new/project

# Copy instead of move (keeps original)
cursor-history migrate-session --copy 3 /path/to/new/project

# Dry run (preview without changes)
cursor-history migrate-session --dry-run 3 /path/to/new/project
```

### Migrate All Sessions from Workspace

```bash
# Move all sessions from old project to new
cursor-history migrate /old/project/path /new/project/path

# Copy all sessions (create backup)
cursor-history migrate --copy /project/path /backup/project/path

# Force migration if destination already has sessions
cursor-history migrate --force /old/path /existing/path

# Dry run to see what would be migrated
cursor-history migrate --dry-run /old/path /new/path
```

### Common Workflow: Project Rename

```bash
# 1. Rename your project folder
mv ~/projects/my-app ~/projects/my-app-v2

# 2. Open the new folder in Cursor (creates workspace)
# (This step is required so the destination workspace exists)

# 3. Migrate all chat history
cursor-history migrate ~/projects/my-app ~/projects/my-app-v2

# 4. Verify migration
cursor-history list --workspace ~/projects/my-app-v2
```

## Library Usage

### Migrate Sessions Programmatically

```typescript
import {
  migrateSession,
  migrateWorkspace,
  isSessionNotFoundError,
  isWorkspaceNotFoundError
} from 'cursor-history';

// Move a single session by index
const result = migrateSession({
  sessions: 3,
  destination: '/path/to/new/project'
});

console.log(`Migrated: ${result[0].success}`);
console.log(`From: ${result[0].sourceWorkspace}`);
console.log(`To: ${result[0].destinationWorkspace}`);

// Move multiple sessions
const results = migrateSession({
  sessions: [1, 3, 5],
  destination: '/path/to/new/project'
});

const successful = results.filter(r => r.success).length;
console.log(`Migrated ${successful}/${results.length} sessions`);
```

### Migrate Entire Workspace

```typescript
import { migrateWorkspace } from 'cursor-history';

const result = migrateWorkspace({
  source: '/old/project',
  destination: '/new/project',
  mode: 'move' // or 'copy'
});

if (result.success) {
  console.log(`Migrated all ${result.totalSessions} sessions`);
} else {
  console.log(`Migrated ${result.successCount}/${result.totalSessions}`);
  result.results
    .filter(r => !r.success)
    .forEach(r => console.error(`Failed: ${r.sessionId} - ${r.error?.message}`));
}
```

### Error Handling

```typescript
import {
  migrateSession,
  isSessionNotFoundError,
  isWorkspaceNotFoundError
} from 'cursor-history';

try {
  const result = migrateSession({
    sessions: 999, // Non-existent
    destination: '/some/path'
  });
} catch (err) {
  if (isSessionNotFoundError(err)) {
    console.error(`Session ${err.identifier} not found`);
    console.error('Run `cursor-history list` to see available sessions');
  } else if (isWorkspaceNotFoundError(err)) {
    console.error(`Workspace not found: ${err.path}`);
    console.error('Please open the project in Cursor first');
  } else {
    throw err;
  }
}
```

### Dry Run Preview

```typescript
import { migrateWorkspace } from 'cursor-history';

// Preview what would be migrated
const preview = migrateWorkspace({
  source: '/old/project',
  destination: '/new/project',
  dryRun: true
});

console.log(`Would migrate ${preview.totalSessions} sessions:`);
preview.results.forEach(r => {
  console.log(`  - ${r.sessionId}`);
});

// Actually perform migration if user confirms
if (userConfirms()) {
  const result = migrateWorkspace({
    source: '/old/project',
    destination: '/new/project',
    dryRun: false
  });
}
```

## Important Notes

1. **Close Cursor first**: Migration modifies Cursor's internal database. Close Cursor before running migration commands to avoid database lock errors.

2. **Destination must exist**: The destination workspace must have been opened in Cursor at least once. This creates the necessary workspace directory structure.

3. **Move is default**: Without `--copy`, sessions are moved (removed from source). Use `--copy` to keep originals.

4. **Partial failure continues**: If some sessions fail to migrate, the command continues with remaining sessions and reports per-session results.

5. **Use dry-run first**: For important migrations, use `--dry-run` to preview what will happen before making changes.
