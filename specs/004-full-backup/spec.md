# Feature Specification: Full Backup and Restore

**Feature Branch**: `004-full-backup`
**Created**: 2025-12-24
**Status**: Draft
**Input**: User description: "Full backup feature to copy all DB files and session directories at file level, zip into cursor_history_bak.zip, restore from backup, and view zipped histories directly via CLI/lib without restoring"

## Clarifications

### Session 2025-12-24

- Q: What happens when Cursor is running and has database locked during backup? → A: Use SQLite backup API for hot backup (consistent snapshot even while Cursor is running)
- Q: Where should the default backup directory be located? → A: User's home directory (`~/cursor-history-backups/`)
- Q: How should backup viewing work without extracting to disk? → A: Stream directly from zip (read DB files in memory, no disk extraction)
- Q: How should partially corrupted backups be handled? → A: Verify checksums, warn about corrupted files, allow access to intact files
- Q: How should cross-platform path differences be handled? → A: Store paths with forward slashes in manifest, normalize to OS-native separators on restore

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Full Backup (Priority: P1)

As a user, I want to create a complete backup of all my Cursor chat history data (database files and session directories) into a single zip file, so that I can safely preserve my chat history before making changes or migrating to a new machine.

**Why this priority**: This is the foundational feature - without the ability to create backups, no other backup-related functionality is useful. Users need data protection before any destructive operations.

**Independent Test**: Can be fully tested by running the backup command and verifying the zip file contains all expected database files and session directories with correct structure.

**Acceptance Scenarios**:

1. **Given** a user has Cursor chat history data, **When** they run the backup command, **Then** a zip file is created containing all database files and session directories
2. **Given** a user specifies a custom output path, **When** they run the backup command with the path option, **Then** the zip file is created at the specified location
3. **Given** a user has no Cursor data directory, **When** they run the backup command, **Then** they receive a clear error message indicating no data to backup
4. **Given** a backup file already exists at the target location, **When** the user runs backup without force flag, **Then** they are warned and backup is not overwritten
5. **Given** a backup file already exists at the target location, **When** the user runs backup with force flag, **Then** the existing file is overwritten

---

### User Story 2 - View Backup Contents Without Restore (Priority: P2)

As a user, I want to browse and view my chat history directly from a backup zip file without restoring it, so that I can verify backup contents, review old conversations, or access history from a different machine without affecting current data.

**Why this priority**: This enables users to access backed-up data without risk of overwriting current data. It's essential for verification and read-only access scenarios.

**Independent Test**: Can be fully tested by running list/show/search commands with the backup file option and verifying correct session data is displayed.

**Acceptance Scenarios**:

1. **Given** a valid backup zip file exists, **When** the user runs list command with the backup file option, **Then** all sessions from the backup are listed
2. **Given** a valid backup zip file exists, **When** the user runs show command with backup file option and session index, **Then** the full session content is displayed
3. **Given** a valid backup zip file exists, **When** the user runs search command with backup file option and query, **Then** matching sessions from the backup are returned
4. **Given** an invalid or corrupted backup file, **When** the user tries to view its contents, **Then** they receive a clear error message
5. **Given** a backup file from a different cursor-history version, **When** the user views its contents, **Then** the data is displayed correctly (backward compatible)

---

### User Story 3 - Restore from Backup (Priority: P3)

As a user, I want to restore my Cursor chat history from a backup zip file, so that I can recover from data loss or migrate my history to a new machine.

**Why this priority**: While critical for disaster recovery, most users will use backup more frequently than restore. Restore is a high-impact but lower-frequency operation.

**Independent Test**: Can be fully tested by restoring a backup to a clean environment and verifying all sessions and data are accessible through normal CLI/lib commands.

**Acceptance Scenarios**:

1. **Given** a valid backup zip file and empty Cursor data directory, **When** the user runs restore command, **Then** all data is restored and accessible via normal commands
2. **Given** a valid backup zip file and existing Cursor data, **When** the user runs restore without force flag, **Then** they are warned about overwriting and restore is aborted
3. **Given** a valid backup zip file and existing Cursor data, **When** the user runs restore with force flag, **Then** existing data is replaced with backup data
4. **Given** an invalid or corrupted backup file, **When** the user runs restore, **Then** they receive a clear error message and no data is modified
5. **Given** a valid backup with custom restore path, **When** the user specifies a target directory, **Then** data is restored to the specified location

---

### User Story 4 - List Available Backups (Priority: P4)

As a user, I want to list all backup files in a directory with their metadata (date, size, session count), so that I can manage multiple backups and choose which one to view or restore.

**Why this priority**: This is a convenience feature for users with multiple backups. Core functionality works without it.

**Independent Test**: Can be fully tested by creating multiple backups in a directory and running the list-backups command to verify all are shown with correct metadata.

**Acceptance Scenarios**:

1. **Given** multiple backup files in the default backup directory, **When** the user runs list-backups command, **Then** all backups are listed with date, size, and session count
2. **Given** a custom directory with backup files, **When** the user runs list-backups with path option, **Then** backups from that directory are listed
3. **Given** a directory with no backup files, **When** the user runs list-backups, **Then** they receive a message indicating no backups found

---

### Edge Cases

- When Cursor is running and has database locked during backup: System uses SQLite backup API for hot backup, ensuring a consistent snapshot even while Cursor is running
- When backup zip file is partially corrupted: System verifies checksums, warns user about corrupted files, and allows access to intact files (graceful degradation)
- When disk space is insufficient during backup creation: System checks available space before starting, fails early with clear error if insufficient; partial files are cleaned up on failure
- When restoring a backup created on a different OS: Paths are stored with forward slashes in manifest and normalized to OS-native separators on restore (cross-platform compatible)
- When backup contains sessions from workspaces that no longer exist: Sessions are still viewable from backup; on restore, workspace directories are recreated as needed
- When backup file exceeds available memory for reading: System reports clear error with memory requirements; user may need sufficient RAM to load DB files from zip (since streaming loads DB into memory)

## Requirements *(mandatory)*

### Functional Requirements

**Backup Creation:**
- **FR-001**: System MUST copy all workspace storage database files (`workspaceStorage/*/state.vscdb`) to the backup
- **FR-002**: System MUST copy the global storage database file (`globalStorage/state.vscdb`) to the backup
- **FR-003**: System MUST preserve the directory structure within the backup zip file
- **FR-004**: System MUST generate a default backup filename with timestamp (e.g., `cursor_history_backup_2025-12-24_143052.zip`)
- **FR-005**: System MUST allow users to specify a custom output path for the backup file
- **FR-006**: System MUST prevent overwriting existing backup files unless force flag is provided
- **FR-007**: System MUST display progress during backup creation for large datasets
- **FR-008**: System MUST include a manifest file in the backup with metadata (version, timestamp, file list, checksums)
- **FR-009**: System MUST use SQLite backup API for database files to ensure consistent snapshots even when Cursor is running (hot backup support)

**Backup Viewing:**
- **FR-010**: System MUST support viewing backup contents without extracting to disk by streaming DB files directly from zip into memory
- **FR-011**: System MUST support all existing read commands (list, show, search, export) with backup file as data source
- **FR-012**: Library API MUST accept backup file path as an alternative to the default data path
- **FR-013**: System MUST validate backup integrity using checksums; warn about corrupted files but allow access to intact files (graceful degradation)

**Restore:**
- **FR-014**: System MUST extract all files from backup to the appropriate Cursor data locations
- **FR-015**: System MUST verify backup integrity before starting restore operation
- **FR-016**: System MUST prevent restore from overwriting existing data unless force flag is provided
- **FR-017**: System MUST allow restoring to a custom target directory
- **FR-018**: System MUST display progress during restore operation
- **FR-019**: System MUST rollback partial restore if any file extraction fails

**Backup Management:**
- **FR-020**: System MUST provide a command to list available backups with metadata
- **FR-021**: System MUST support a default backup directory in user's home directory (`~/cursor-history-backups/`)

### Key Entities

- **Backup**: A zip archive containing all Cursor chat history data files
  - Contains: workspace storage DBs, global storage DB, manifest file
  - Attributes: creation timestamp, version, total size, session count, checksum

- **Manifest**: Metadata file within backup describing contents
  - Contains: backup version, creation time, source platform, file list with forward-slash paths and checksums
  - Paths are normalized to OS-native separators on restore for cross-platform compatibility

- **BackupConfig**: Configuration for backup/restore operations
  - Attributes: source path, destination path, force overwrite flag, progress callback

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a complete backup of all chat history in under 30 seconds for typical datasets (up to 1GB)
- **SC-002**: Users can view any session from a backup file with the same response time as viewing from live data
- **SC-003**: Users can restore a backup with 100% data fidelity (all sessions, messages, and metadata preserved)
- **SC-004**: Backup files are portable across supported platforms (Windows, macOS, Linux)
- **SC-005**: Users can identify and select from multiple backups using clear metadata (date, size, session count)
- **SC-006**: Failed operations (backup/restore) leave the system in a consistent state with no partial data
- **SC-007**: 100% of existing CLI commands work identically when pointed at a backup file vs live data

## Assumptions

- Users have sufficient disk space for backup files (roughly equal to source data size when compressed)
- Backup files will be stored on local filesystem (not cloud storage directly)
- SQLite database files can be safely copied when Cursor is not running, or read-only when running
- Zip format provides adequate compression and is universally supported across platforms
- Backup manifest format may evolve; backward compatibility will be maintained for reading older backups
