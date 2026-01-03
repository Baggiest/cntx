# cursor-history Project Overview

## Purpose
CLI tool and library to browse, search, export, migrate, and backup Cursor AI chat history.

## Tech Stack
- **Language**: TypeScript 5.9+ (strict mode)
- **Database**: SQLite via better-sqlite3
- **CLI Framework**: commander + picocolors
- **Module System**: Dual ESM/CommonJS support
- **Testing**: vitest
- **Linting**: ESLint + Prettier

## Architecture
```
src/
├── cli/          # CLI commands and formatters
├── core/         # Shared logic (storage.ts, migrate.ts, parser.ts)
└── lib/          # Library API entry point
```

Both CLI and library share `src/core/` for database access.

## Database Access Pattern
- Uses better-sqlite3 for synchronous SQLite queries
- Two functions in storage.ts:
  - `openDatabase(path)` - readonly access
  - `openDatabaseReadWrite(path)` - read-write access
- Common operations: `.prepare()`, `.get()`, `.all()`, `.run()`
