# Research: Full Backup and Restore

**Date**: 2025-12-24
**Feature**: 004-full-backup

## Research Questions

### 1. SQLite Hot Backup API in better-sqlite3

**Decision**: Use better-sqlite3's native `.backup()` method

**Rationale**:
- better-sqlite3 fully supports SQLite's Online Backup API via the `.backup(destination, [options])` method
- Returns a promise that resolves when backup is complete
- Supports progress monitoring via callback with `totalPages` and `remainingPages`
- Allows continued database usage during backup (hot backup)
- If the source database is modified during backup via the same connection, changes are automatically included
- If modified by another connection, backup is automatically restarted

**Syntax**:
```typescript
const db = new Database('source.db');
await db.backup('destination.db', {
  progress: ({ totalPages, remainingPages }) => {
    console.log(`Progress: ${totalPages - remainingPages}/${totalPages}`);
    return 100; // pages per event loop cycle
  }
});
```

**Alternatives Considered**:
- File copy with read-only mode: Risky if Cursor is writing; not transactionally safe
- VACUUM INTO: Creates snapshot but slower and doesn't support progress
- Litestream: Overkill for this use case; requires separate daemon

**Sources**: [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md), [SQLite Backup API](https://sqlite.org/backup.html)

---

### 2. Reading Database from Memory (Zip Streaming)

**Decision**: Use better-sqlite3's `.serialize()` / `new Database(buffer)` pattern

**Rationale**:
- better-sqlite3 supports opening a database from a Buffer via `new Database(buffer)`
- The buffer can be obtained by reading a file from zip into memory
- Supports the clarification decision: "Stream directly from zip into memory"
- WAL mode consideration: If source DB uses WAL, need to switch to DELETE mode before serialize

**Syntax**:
```typescript
// Reading from zip buffer
const zipBuffer = fs.readFileSync('backup.zip');
const zip = new AdmZip(zipBuffer);
const dbBuffer = zip.readFile('globalStorage/state.vscdb');
const db = new Database(dbBuffer);
```

**Limitations**:
- Entire DB file must fit in memory (documented in spec edge cases)
- For large DBs, user needs sufficient RAM

**Alternatives Considered**:
- Extract to temp directory: Works but violates "no disk extraction" requirement
- Virtual filesystem: Complex; not supported by better-sqlite3

**Sources**: [better-sqlite3 serialize/deserialize](https://github.com/JoshuaWise/better-sqlite3/issues/573), [SQLite deserialize](https://www.sqlite.org/c3ref/deserialize.html)

---

### 3. Zip Library Selection

**Decision**: Use **adm-zip** for both reading and writing

**Rationale**:
- Supports both creating and extracting zip files (single dependency)
- Simple synchronous API aligns with better-sqlite3's synchronous nature
- Good enough for typical backup sizes (up to 1GB per SC-001)
- No streaming needed since we're already loading DB into memory
- Actively maintained with 8.5M weekly downloads

**Alternatives Considered**:

| Library | Pros | Cons | Decision |
|---------|------|------|----------|
| archiver + yauzl | Best streaming, most popular | Two dependencies; overkill since we load DB to memory anyway | Rejected |
| jszip | Works in browser too | Slower than adm-zip for Node.js | Rejected |
| adm-zip | Simple API, read+write, sync | No streaming (but we don't need it) | **Selected** |

**Usage Pattern**:
```typescript
// Creating backup
const zip = new AdmZip();
zip.addLocalFile('globalStorage/state.vscdb', 'globalStorage/');
zip.addLocalFile('manifest.json');
zip.writeZip('backup.zip');

// Reading backup
const zip = new AdmZip('backup.zip');
const manifest = JSON.parse(zip.readAsText('manifest.json'));
const dbBuffer = zip.readFile('globalStorage/state.vscdb');
```

**Sources**: [npm-compare](https://npm-compare.com/adm-zip,archiver,yauzl), [npm trends](https://npmtrends.com/adm-zip-vs-archiver-vs-jszip)

---

### 4. Manifest File Format

**Decision**: JSON manifest with version, checksums, and metadata

**Rationale**:
- JSON is human-readable and easy to parse
- Checksums (SHA-256) enable integrity verification per clarification
- Version field supports future backward compatibility
- Forward slashes in paths per clarification decision

**Schema**:
```json
{
  "version": "1.0.0",
  "createdAt": "2025-12-24T14:30:52.000Z",
  "sourcePlatform": "linux",
  "cursorHistoryVersion": "0.7.0",
  "files": [
    {
      "path": "globalStorage/state.vscdb",
      "size": 1048576,
      "checksum": "sha256:abc123..."
    }
  ],
  "stats": {
    "totalSize": 52428800,
    "sessionCount": 42,
    "workspaceCount": 5
  }
}
```

**Alternatives Considered**:
- YAML: More readable but adds dependency
- Plain text: Harder to parse; no nested structure
- SQLite metadata table: Requires extraction to read

---

### 5. Checksum Algorithm

**Decision**: SHA-256 via Node.js crypto module

**Rationale**:
- SHA-256 is cryptographically strong and widely used
- Node.js crypto module is built-in (no new dependency)
- Fast enough for 1GB datasets
- Can be computed incrementally for progress reporting

**Usage**:
```typescript
import { createHash } from 'crypto';

function computeChecksum(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
```

---

### 6. Default Backup Directory

**Decision**: `~/cursor-history-backups/` (per clarification)

**Rationale**:
- User's home directory is accessible and portable
- Separate from Cursor's internal data (won't be affected by Cursor updates)
- Easy to find and manage
- Cross-platform: `os.homedir()` works on all platforms

**Implementation**:
```typescript
import { homedir } from 'os';
import { join } from 'path';

const DEFAULT_BACKUP_DIR = join(homedir(), 'cursor-history-backups');
```

---

## Summary of Decisions

| Question | Decision |
|----------|----------|
| Hot backup | better-sqlite3 `.backup()` API |
| Memory DB | `new Database(buffer)` from serialize |
| Zip library | adm-zip (single dependency) |
| Manifest format | JSON with version and checksums |
| Checksum algorithm | SHA-256 (Node.js crypto) |
| Default backup dir | `~/cursor-history-backups/` |

## Dependencies to Add

```json
{
  "dependencies": {
    "adm-zip": "^0.5.x"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.x"
  }
}
```

## Technical Risks

1. **Memory usage**: Large DBs (>500MB) may cause memory pressure when loaded from zip
   - Mitigation: Document memory requirements; consider streaming fallback in future

2. **WAL mode**: If Cursor uses WAL, serialize won't work directly
   - Mitigation: Use backup API which handles WAL correctly; only serialize for reading from zip (those are already in DELETE mode from backup)

3. **Cross-platform paths**: Windows uses backslashes
   - Mitigation: Always use forward slashes in manifest; normalize on restore (per clarification)
