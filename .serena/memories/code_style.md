# Code Style and Conventions

## TypeScript
- Strict mode enabled
- Prefer existing file edits over creating new files
- Use picocolors (not chalk) for terminal colors
- Handle errors with `CliError` and exit codes

## Naming
- camelCase for functions and variables
- PascalCase for types and interfaces
- Descriptive function names: `extractBubbleText`, `findWorkspaceForSession`

## Database
- Use `openDatabase()` for read-only queries
- Use `openDatabaseReadWrite()` for migrations
- Always close database connections

## Formatting
- ESLint + Prettier
- Run `npm run format` before committing
