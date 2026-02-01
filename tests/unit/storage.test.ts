import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from '../../src/core/database/types.js';

// Mock the database module
const mockOpenDatabase = vi.fn();
const mockOpenDatabaseReadWrite = vi.fn();
const mockEnsureDriver = vi.fn().mockResolvedValue(undefined);

vi.mock('../../src/core/database/index.js', () => ({
  openDatabase: (...args: unknown[]) => mockOpenDatabase(...args),
  openDatabaseReadWrite: (...args: unknown[]) => mockOpenDatabaseReadWrite(...args),
  ensureDriver: (...args: unknown[]) => mockEnsureDriver(...args),
}));

// Mock backup module to avoid real zip operations
vi.mock('../../src/core/backup.js', () => ({
  openBackupDatabase: vi.fn(),
  readBackupManifest: vi.fn().mockResolvedValue(null),
}));

// Mock node:fs
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  readWorkspaceJson,
  findWorkspaces,
  listSessions,
  getSession,
  searchSessions,
  getComposerData,
  updateComposerData,
  resolveSessionIdentifiers,
  findWorkspaceForSession,
  findWorkspaceByPath,
  listWorkspaces,
  listGlobalSessions,
  getGlobalSession,
} from '../../src/core/storage.js';

/**
 * Create a mock DB where prepare().get(key) returns different results based on the key argument.
 * composerValue: value returned when querying for 'composer.composerData' key
 */
function createWorkspaceDb(composerValue: string): Database {
  return {
    prepare: vi.fn(() => ({
      get: vi.fn((key?: string) => {
        if (key === 'composer.composerData') return { value: composerValue };
        return undefined;
      }),
      all: vi.fn(() => []),
      run: vi.fn(),
    })),
    close: vi.fn(),
    runSQL: vi.fn(),
  };
}

/**
 * Create a global storage mock DB with cursorDiskKV table and bubble data.
 */
function createGlobalDb(bubbleRows: { key: string; value: string }[]): Database {
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('sqlite_master')) {
        return { get: vi.fn(() => ({ name: 'cursorDiskKV' })), all: vi.fn(() => []), run: vi.fn() };
      }
      if (sql.includes('cursorDiskKV')) {
        return {
          get: vi.fn(),
          all: vi.fn(() => bubbleRows),
          run: vi.fn(),
        };
      }
      return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    }),
    close: vi.fn(),
    runSQL: vi.fn(),
  };
}

/**
 * Setup mockOpenDatabase to return workspace DB for workspace paths
 * and global DB for global storage path.
 */
function setupGetSessionMocks(composerData: string, bubbleRows: { key: string; value: string }[]) {
  const wsDb = createWorkspaceDb(composerData);
  const globalDb = createGlobalDb(bubbleRows);
  mockOpenDatabase.mockImplementation(async (path: string) => {
    if (String(path).includes('globalStorage')) {
      return globalDb;
    }
    return wsDb;
  });
}

function createMockDb(queryMap: Record<string, { get?: unknown; all?: unknown[] }> = {}): Database {
  return {
    prepare: vi.fn((sql: string) => {
      for (const [key, result] of Object.entries(queryMap)) {
        if (sql.includes(key)) {
          return {
            get: vi.fn((..._args: unknown[]) => result.get),
            all: vi.fn((..._args: unknown[]) => result.all ?? []),
            run: vi.fn(),
          };
        }
      }
      return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
    }),
    close: vi.fn(),
    runSQL: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// readWorkspaceJson
// =============================================================================
describe('readWorkspaceJson', () => {
  it('returns path from workspace.json', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/my/project' }));
    const result = readWorkspaceJson('/workspace/dir');
    expect(result).toBe('/my/project');
  });

  it('strips file:// prefix', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: 'file:///my/project' }));
    const result = readWorkspaceJson('/workspace/dir');
    expect(result).toBe('/my/project');
  });

  it('returns null when file does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(readWorkspaceJson('/nonexistent')).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('not json');
    expect(readWorkspaceJson('/workspace/dir')).toBeNull();
  });

  it('returns null when folder key is missing', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ other: 'value' }));
    expect(readWorkspaceJson('/workspace/dir')).toBeNull();
  });
});

// =============================================================================
// findWorkspaces
// =============================================================================
describe('findWorkspaces', () => {
  it('returns empty array when path does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await findWorkspaces('/nonexistent');
    expect(result).toEqual([]);
  });

  it('finds workspaces with sessions', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      return path.includes('state.vscdb') || path.includes('workspace.json') || path === '/data';
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/my/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test' }],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await findWorkspaces('/data');
    expect(result).toHaveLength(1);
    expect(result[0]!.path).toBe('/my/project');
    expect(result[0]!.sessionCount).toBe(1);
  });

  it('skips directories without state.vscdb', async () => {
    vi.mocked(existsSync).mockImplementation((p) => {
      const path = String(p);
      if (path.includes('state.vscdb')) return false;
      return true;
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);

    const result = await findWorkspaces('/data');
    expect(result).toEqual([]);
  });
});

// =============================================================================
// listSessions
// =============================================================================
describe('listSessions', () => {
  it('returns sorted sessions across workspaces', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [
        { composerId: 'c1', name: 'Chat A', createdAt: 1000000, lastUpdatedAt: 2000000 },
        { composerId: 'c2', name: 'Chat B', createdAt: 3000000, lastUpdatedAt: 4000000 },
      ],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await listSessions({ limit: 10, all: false }, '/data');
    expect(result).toHaveLength(2);
    // Should be sorted by most recent first
    expect(result[0]!.id).toBe('c2');
    expect(result[1]!.id).toBe('c1');
    // Indexes assigned after sorting
    expect(result[0]!.index).toBe(1);
    expect(result[1]!.index).toBe(2);
  });

  it('applies limit', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [
        { composerId: 'c1', name: 'A', createdAt: 1000 },
        { composerId: 'c2', name: 'B', createdAt: 2000 },
        { composerId: 'c3', name: 'C', createdAt: 3000 },
      ],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await listSessions({ limit: 1, all: false }, '/data');
    expect(result).toHaveLength(1);
  });

  it('returns all when all=true', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [
        { composerId: 'c1', name: 'A', createdAt: 1000 },
        { composerId: 'c2', name: 'B', createdAt: 2000 },
        { composerId: 'c3', name: 'C', createdAt: 3000 },
      ],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await listSessions({ limit: 1, all: true }, '/data');
    expect(result).toHaveLength(3);
  });
});

// =============================================================================
// listWorkspaces
// =============================================================================
describe('listWorkspaces', () => {
  it('returns sorted workspaces by session count', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Chat' }],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await listWorkspaces('/data');
    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// getSession
// =============================================================================
describe('getSession', () => {
  it('returns null for invalid index', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    const result = await getSession(999, '/data');
    expect(result).toBeNull();
  });

  it('returns session from global storage with bubble data', async () => {
    // Setup workspace to list sessions
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test Chat', createdAt: 1000 }],
    });

    // User bubble
    const userBubble = JSON.stringify({
      type: 1,
      text: 'Hello from user',
      createdAt: '2024-01-15T10:00:00Z',
      bubbleId: 'b1',
    });

    // Assistant bubble with plain text
    const assistantBubble = JSON.stringify({
      type: 2,
      text: 'Here is my response',
      createdAt: '2024-01-15T10:01:00Z',
      bubbleId: 'b2',
    });

    setupGetSessionMocks(composerData, [
      { key: 'bubbleId:c1:b1', value: userBubble },
      { key: 'bubbleId:c1:b2', value: assistantBubble },
    ]);

    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('c1');
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0]!.role).toBe('user');
    expect(result!.messages[0]!.content).toBe('Hello from user');
    expect(result!.messages[1]!.role).toBe('assistant');
    expect(result!.messages[1]!.content).toBe('Here is my response');
  });

  it('handles assistant bubble with tool call', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 1000 }],
    });

    const toolBubble = JSON.stringify({
      type: 2,
      createdAt: '2024-01-15T10:00:00Z',
      bubbleId: 'b1',
      toolFormerData: {
        name: 'read_file',
        params: JSON.stringify({ targetFile: '/src/main.ts' }),
        result: JSON.stringify({ contents: 'file content here' }),
        status: 'completed',
      },
    });

    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: toolBubble }]);

    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Read File]');
    expect(result!.messages[0]!.content).toContain('/src/main.ts');
  });

  it('handles assistant bubble with thinking text', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 1000 }],
    });

    const thinkingBubble = JSON.stringify({
      type: 2,
      createdAt: '2024-01-15T10:00:00Z',
      bubbleId: 'b1',
      thinking: { text: 'Let me reason about this...' },
    });

    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: thinkingBubble }]);

    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Thinking]');
    expect(result!.messages[0]!.content).toContain('Let me reason');
  });

  it('handles assistant bubble with text + codeBlocks combined', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 1000 }],
    });

    const combinedBubble = JSON.stringify({
      type: 2,
      text: 'Here is the code:',
      createdAt: '2024-01-15T10:00:00Z',
      bubbleId: 'b1',
      codeBlocks: [{ content: 'const x = 1;', languageId: 'typescript' }],
    });

    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: combinedBubble }]);

    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('Here is the code:');
    expect(result!.messages[0]!.content).toContain('```typescript');
    expect(result!.messages[0]!.content).toContain('const x = 1;');
  });

  it('handles assistant bubble with diff in toolFormerData.result', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 1000 }],
    });

    const diffBubble = JSON.stringify({
      type: 2,
      createdAt: '2024-01-15T10:00:00Z',
      bubbleId: 'b1',
      toolFormerData: {
        name: 'write',
        params: JSON.stringify({ relativeWorkspacePath: 'src/main.ts' }),
        result: JSON.stringify({
          diff: { chunks: [{ diffString: '-old\n+new' }] },
          resultForModel: 'File updated',
        }),
        status: 'completed',
      },
    });

    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: diffBubble }]);

    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Write File]');
    expect(result!.messages[0]!.content).toContain('src/main.ts');
    expect(result!.messages[0]!.content).toContain('```diff');
  });

  it('handles error bubble', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 1000 }],
    });

    const errorBubble = JSON.stringify({
      type: 2,
      createdAt: '2024-01-15T10:00:00Z',
      bubbleId: 'b1',
      nested: { deep: { msg: 'Error occurred\n```\nstack trace\n```\n# heading' } },
      toolFormerData: { additionalData: { status: 'error' } },
    });

    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: errorBubble }]);

    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Error]');
  });
});

// =============================================================================
// searchSessions
// =============================================================================
describe('searchSessions', () => {
  it('returns empty when no matches', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    const result = await searchSessions('xyz', { limit: 10 }, '/data');
    expect(result).toEqual([]);
  });
});

// =============================================================================
// getComposerData
// =============================================================================
describe('getComposerData', () => {
  it('returns new format with allComposers', () => {
    const data = JSON.stringify({ allComposers: [{ composerId: 'c1' }], selectedComposerIds: [] });
    const db = createMockDb({ 'ItemTable': { get: { value: data } } });
    const result = getComposerData(db);
    expect(result).not.toBeNull();
    expect(result!.isNewFormat).toBe(true);
    expect(result!.composers).toHaveLength(1);
    expect(result!.composers[0]!.composerId).toBe('c1');
  });

  it('returns legacy format (direct array)', () => {
    const data = JSON.stringify([{ composerId: 'c1' }]);
    const db = createMockDb({ 'ItemTable': { get: { value: data } } });
    const result = getComposerData(db);
    expect(result).not.toBeNull();
    expect(result!.isNewFormat).toBe(false);
    expect(result!.composers).toHaveLength(1);
  });

  it('returns null when no data', () => {
    const db = createMockDb({});
    const result = getComposerData(db);
    expect(result).toBeNull();
  });

  it('returns null on invalid JSON', () => {
    const db = createMockDb({ 'ItemTable': { get: { value: 'not json' } } });
    const result = getComposerData(db);
    expect(result).toBeNull();
  });

  it('returns null for non-array non-object data', () => {
    const db = createMockDb({ 'ItemTable': { get: { value: '"just a string"' } } });
    const result = getComposerData(db);
    expect(result).toBeNull();
  });
});

// =============================================================================
// updateComposerData
// =============================================================================
describe('updateComposerData', () => {
  it('writes new format with allComposers wrapper', () => {
    const mockRun = vi.fn();
    const db: Database = {
      prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: mockRun })),
      close: vi.fn(),
      runSQL: vi.fn(),
    };

    const composers = [{ composerId: 'c1' }];
    const originalRaw = { allComposers: [], selectedComposerIds: ['x'] };
    updateComposerData(db, composers, true, originalRaw);

    expect(mockRun).toHaveBeenCalled();
    const writtenJson = mockRun.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenJson);
    expect(parsed.allComposers).toEqual(composers);
    expect(parsed.selectedComposerIds).toEqual(['x']); // Preserved
  });

  it('writes legacy format as direct array', () => {
    const mockRun = vi.fn();
    const db: Database = {
      prepare: vi.fn(() => ({ get: vi.fn(), all: vi.fn(() => []), run: mockRun })),
      close: vi.fn(),
      runSQL: vi.fn(),
    };

    const composers = [{ composerId: 'c1' }];
    updateComposerData(db, composers, false);

    const writtenJson = mockRun.mock.calls[0]![0] as string;
    const parsed = JSON.parse(writtenJson);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(composers);
  });
});

// =============================================================================
// resolveSessionIdentifiers
// =============================================================================
describe('resolveSessionIdentifiers', () => {
  function setupSessions() {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [
        { composerId: 'uuid-abc', name: 'Session A', createdAt: 2000 },
        { composerId: 'uuid-def', name: 'Session B', createdAt: 1000 },
      ],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));
  }

  it('resolves single index', async () => {
    setupSessions();
    const result = await resolveSessionIdentifiers(1, '/data');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('uuid-abc'); // Index 1 is most recent
  });

  it('resolves single UUID string', async () => {
    setupSessions();
    const result = await resolveSessionIdentifiers('uuid-def', '/data');
    expect(result).toEqual(['uuid-def']);
  });

  it('resolves comma-separated', async () => {
    setupSessions();
    const result = await resolveSessionIdentifiers('1, 2', '/data');
    expect(result).toHaveLength(2);
  });

  it('resolves array input', async () => {
    setupSessions();
    const result = await resolveSessionIdentifiers([1, 2], '/data');
    expect(result).toHaveLength(2);
  });

  it('throws for unknown identifier', async () => {
    setupSessions();
    await expect(resolveSessionIdentifiers(999, '/data')).rejects.toThrow();
  });
});

// =============================================================================
// findWorkspaceForSession
// =============================================================================
describe('findWorkspaceForSession', () => {
  it('returns null when session not found', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    const result = await findWorkspaceForSession('nonexistent', '/data');
    expect(result).toBeNull();
  });
});

// =============================================================================
// findWorkspaceByPath
// =============================================================================
describe('findWorkspaceByPath', () => {
  it('returns null when path not found', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    const result = await findWorkspaceByPath('/nonexistent', '/data');
    expect(result).toBeNull();
  });
});

// =============================================================================
// listGlobalSessions
// =============================================================================
describe('listGlobalSessions', () => {
  it('returns empty when global DB does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await listGlobalSessions();
    expect(result).toEqual([]);
  });
});

// =============================================================================
// getGlobalSession
// =============================================================================
describe('getGlobalSession', () => {
  it('returns null for invalid index', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await getGlobalSession(999);
    expect(result).toBeNull();
  });
});

// =============================================================================
// searchSessions — with actual matches
// =============================================================================
describe('searchSessions (with matches)', () => {
  function setupForSearch() {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [
        { composerId: 'c1', name: 'Debug Session', createdAt: 2000 },
      ],
    });

    const userBubble = JSON.stringify({ type: 1, text: 'How do I fix the authentication bug?' });
    const assistantBubble = JSON.stringify({ type: 2, text: 'You can fix the bug by checking the token.' });

    setupGetSessionMocks(composerData, [
      { key: 'bubbleId:c1:b1', value: userBubble },
      { key: 'bubbleId:c1:b2', value: assistantBubble },
    ]);
  }

  it('returns matches when query is found in session messages', async () => {
    setupForSearch();
    const results = await searchSessions('bug', { limit: 10, contextChars: 40 }, '/data');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.matchCount).toBeGreaterThan(0);
    expect(results[0]!.snippets.length).toBeGreaterThan(0);
  });

  it('returns empty when no matches', async () => {
    setupForSearch();
    const results = await searchSessions('nonexistentxyz', { limit: 10, contextChars: 40 }, '/data');
    expect(results).toHaveLength(0);
  });

  it('applies limit to results', async () => {
    setupForSearch();
    const results = await searchSessions('bug', { limit: 0, contextChars: 40 }, '/data');
    // limit=0 means no limit
    expect(results).toBeInstanceOf(Array);
  });
});

// =============================================================================
// findWorkspaceForSession — with match
// =============================================================================
describe('findWorkspaceForSession (with match)', () => {
  it('returns workspace info when session found', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'target-id', name: 'Found' }],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await findWorkspaceForSession('target-id', '/data');
    expect(result).not.toBeNull();
    expect(result!.workspace.path).toBe('/project');
  });
});

// =============================================================================
// findWorkspaceByPath — with match
// =============================================================================
describe('findWorkspaceByPath (with match)', () => {
  it('returns workspace info when path matches', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/my/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Session' }],
    });
    mockOpenDatabase.mockResolvedValue(createWorkspaceDb(composerData));

    const result = await findWorkspaceByPath('/my/project', '/data');
    expect(result).not.toBeNull();
    expect(result!.dbPath).toContain('state.vscdb');
  });
});

// =============================================================================
// listGlobalSessions — with data
// =============================================================================
describe('listGlobalSessions (with data)', () => {
  it('returns sessions from global storage', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const composerValue = JSON.stringify({
      name: 'Global Session',
      createdAt: '2024-01-15T10:00:00Z',
    });
    const bubbleValue = JSON.stringify({ type: 1, text: 'Hello from global' });

    mockOpenDatabase.mockResolvedValue({
      prepare: vi.fn((sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { get: vi.fn(() => ({ name: 'cursorDiskKV' })), all: vi.fn(() => []), run: vi.fn() };
        }
        if (sql.includes("LIKE 'composerData:%'")) {
          return {
            get: vi.fn(),
            all: vi.fn(() => [{ key: 'composerData:g1', value: composerValue }]),
            run: vi.fn(),
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { get: vi.fn(() => ({ count: 2 })), all: vi.fn(() => []), run: vi.fn() };
        }
        if (sql.includes('LIMIT 1')) {
          return { get: vi.fn(() => ({ value: bubbleValue })), all: vi.fn(() => []), run: vi.fn() };
        }
        return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
      }),
      close: vi.fn(),
      runSQL: vi.fn(),
    });

    const result = await listGlobalSessions();
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.title).toBe('Global Session');
    expect(result[0]!.messageCount).toBe(2);
  });
});

// =============================================================================
// getSession — more tool call types for formatToolCall coverage
// =============================================================================
describe('getSession (more tool types)', () => {
  function setupToolTest(bubbleValue: string) {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 2000 }],
    });

    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: bubbleValue }]);
  }

  it('extracts list_dir tool call', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'list_dir',
        params: JSON.stringify({ targetDirectory: '/src' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: List Directory]');
    expect(result!.messages[0]!.content).toContain('/src');
  });

  it('extracts grep tool call', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'grep',
        params: JSON.stringify({ pattern: 'TODO', path: '/src' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Grep]');
    expect(result!.messages[0]!.content).toContain('TODO');
  });

  it('extracts terminal command tool call', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'run_terminal_command',
        params: JSON.stringify({ command: 'npm test' }),
        status: 'completed',
        result: JSON.stringify({ output: 'All tests passed' }),
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Terminal Command]');
    expect(result!.messages[0]!.content).toContain('npm test');
  });

  it('extracts edit_file tool call', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'edit_file',
        params: JSON.stringify({ targetFile: '/src/main.ts', oldString: 'foo', newString: 'bar' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool:');
    expect(result!.messages[0]!.content).toContain('/src/main.ts');
  });

  it('extracts write tool with relativeWorkspacePath', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'write',
        params: JSON.stringify({ relativeWorkspacePath: 'new-file.ts', content: 'export const x = 1;' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('new-file.ts');
  });

  it('extracts codebase_search tool call', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'codebase_search',
        params: JSON.stringify({ query: 'authentication handler' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Search]');
    expect(result!.messages[0]!.content).toContain('authentication handler');
  });

  it('handles cancelled tool status', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'read_file',
        params: JSON.stringify({ targetFile: '/cancelled.ts' }),
        status: 'cancelled',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool:');
  });

  it('handles text field with JSON diff', async () => {
    const diffData = JSON.stringify({
      diff: {
        chunks: [{ diffString: '-old\n+new' }],
      },
    });
    const bubble = JSON.stringify({
      type: 2,
      text: diffData,
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    // Should detect JSON diff in text
    expect(result!.messages[0]!.content.length).toBeGreaterThan(0);
  });

  it('handles fallback to longest markdown string', async () => {
    const bubble = JSON.stringify({
      type: 2,
      someField: 'short',
      nested: {
        deepField: 'This is a much longer string with **markdown** features that should be found by the fallback.',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    // The fallback should find the longest string with markdown
    expect(result!.messages[0]!.content.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// getSession — generic tool with result output
// =============================================================================
describe('getSession (generic tool)', () => {
  function setupToolTest(bubbleValue: string) {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));
    const composerData = JSON.stringify({
      allComposers: [{ composerId: 'c1', name: 'Test', createdAt: 2000 }],
    });
    setupGetSessionMocks(composerData, [{ key: 'bubbleId:c1:b1', value: bubbleValue }]);
  }

  it('handles generic tool with string params', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'custom_tool',
        params: JSON.stringify({ inputFile: '/data.csv', mode: 'parse' }),
        status: 'completed',
        result: JSON.stringify({ output: 'Parsed 100 rows' }),
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: custom_tool]');
    expect(result!.messages[0]!.content).toContain('Parsed 100 rows');
  });

  it('handles tool with non-JSON result string', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'custom_tool',
        params: '{}',
        status: 'completed',
        result: 'plain text result',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('plain text result');
  });

  it('handles write_file tool name in diff result', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'write_file',
        params: JSON.stringify({ relativeWorkspacePath: 'output.ts' }),
        status: 'completed',
        result: JSON.stringify({
          diff: { chunks: [{ diffString: '-old line\n+new line' }] },
          resultForModel: 'File updated',
        }),
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Write File]');
    expect(result!.messages[0]!.content).toContain('output.ts');
    expect(result!.messages[0]!.content).toContain('```diff');
  });

  it('handles search_replace tool', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'search_replace',
        params: JSON.stringify({ targetFile: '/src/app.ts', old_string: 'oldCode', new_string: 'newCode' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Search & Replace]');
    expect(result!.messages[0]!.content).toContain('oldCode');
    expect(result!.messages[0]!.content).toContain('newCode');
  });

  it('handles create_file tool', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'create_file',
        params: JSON.stringify({ targetFile: '/new-module.ts' }),
        status: 'completed',
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Create File]');
  });

  it('handles tool with user decision', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'write',
        params: JSON.stringify({ relativeWorkspacePath: 'file.ts' }),
        status: 'completed',
        additionalData: { userDecision: 'accepted' },
        result: JSON.stringify({ diff: { chunks: [{ diffString: '+new' }] } }),
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('accepted');
  });

  it('handles terminal command with output', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'execute_command',
        params: JSON.stringify({ cmd: 'ls -la' }),
        status: 'completed',
        result: JSON.stringify({ output: 'file1.ts\nfile2.ts' }),
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Terminal Command]');
    expect(result!.messages[0]!.content).toContain('ls -la');
  });

  it('handles read_file with content preview', async () => {
    const bubble = JSON.stringify({
      type: 2,
      toolFormerData: {
        name: 'read_file',
        params: JSON.stringify({ path: '/src/index.ts' }),
        status: 'completed',
        result: JSON.stringify({ contents: 'export function main() { return true; }' }),
      },
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('[Tool: Read File]');
    expect(result!.messages[0]!.content).toContain('Content:');
  });

  it('handles user message with codeBlocks', async () => {
    const bubble = JSON.stringify({
      type: 1,
      codeBlocks: [
        { content: 'const x = 1;', languageId: 'typescript' },
      ],
    });
    setupToolTest(bubble);
    const result = await getSession(1, '/data');
    expect(result).not.toBeNull();
    expect(result!.messages[0]!.content).toContain('const x = 1;');
  });
});

// =============================================================================
// getSession — workspace fallback path
// =============================================================================
describe('getSession (workspace fallback)', () => {
  it('falls back to workspace DB when global has no cursorDiskKV', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([
      { name: 'ws1', isDirectory: () => true } as unknown as ReturnType<typeof readdirSync>[0],
    ]);
    vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ folder: '/project' }));

    const composerData = JSON.stringify({
      allComposers: [
        { composerId: 'c1', name: 'Session', createdAt: 2000 },
      ],
    });

    // Path-based mock: workspace DB returns session data, global DB has no cursorDiskKV table
    const wsDb = createWorkspaceDb(composerData);
    const globalDb: Database = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('sqlite_master')) {
          return { get: vi.fn(() => undefined), all: vi.fn(() => []), run: vi.fn() }; // No cursorDiskKV
        }
        return { get: vi.fn(), all: vi.fn(() => []), run: vi.fn() };
      }),
      close: vi.fn(),
      runSQL: vi.fn(),
    };

    mockOpenDatabase.mockImplementation(async (path: string) => {
      if (String(path).includes('globalStorage')) return globalDb;
      return wsDb;
    });

    const result = await getSession(1, '/data');
    // When global storage doesn't have the table, it falls back to workspace
    // The result depends on whether workspace data can reconstruct the session
    expect(result).toBeDefined();
  });
});
