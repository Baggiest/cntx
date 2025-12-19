/**
 * Storage discovery and database access for Cursor chat history
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import Database from 'better-sqlite3';
import type {
  Workspace,
  ChatSession,
  ChatSessionSummary,
  ListOptions,
  SearchOptions,
  SearchResult,
} from './types.js';
import { getCursorDataPath, contractPath } from '../lib/platform.js';
import { parseChatData, getSearchSnippets, type CursorChatBundle } from './parser.js';

/**
 * Known SQLite keys for chat data (in priority order)
 */
const CHAT_DATA_KEYS = [
  'composer.composerData', // New Cursor format
  'workbench.panel.aichat.view.aichat.chatdata', // Legacy format
  'workbench.panel.chat.view.chat.chatdata', // Legacy format
];

/**
 * Keys for prompts and generations (new Cursor format)
 */
const PROMPTS_KEY = 'aiService.prompts';
const GENERATIONS_KEY = 'aiService.generations';

/**
 * Get the global Cursor storage path
 */
function getGlobalStoragePath(): string {
  const platform = process.platform;
  const home = homedir();

  if (platform === 'win32') {
    return join(process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage');
  } else if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
  } else {
    return join(home, '.config', 'Cursor', 'User', 'globalStorage');
  }
}

/**
 * Open a SQLite database file
 */
export function openDatabase(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true });
}

/**
 * Read workspace.json to get the original workspace path
 */
export function readWorkspaceJson(workspaceDir: string): string | null {
  const jsonPath = join(workspaceDir, 'workspace.json');
  if (!existsSync(jsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(jsonPath, 'utf-8');
    const data = JSON.parse(content) as { folder?: string };
    if (data.folder) {
      // Convert file:// URL to path
      return data.folder.replace(/^file:\/\//, '').replace(/%20/g, ' ');
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find all workspaces with chat history
 */
export function findWorkspaces(customDataPath?: string): Workspace[] {
  const basePath = getCursorDataPath(customDataPath);

  if (!existsSync(basePath)) {
    return [];
  }

  const workspaces: Workspace[] = [];

  try {
    const entries = readdirSync(basePath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const workspaceDir = join(basePath, entry.name);
      const dbPath = join(workspaceDir, 'state.vscdb');

      if (!existsSync(dbPath)) continue;

      const workspacePath = readWorkspaceJson(workspaceDir);
      if (!workspacePath) continue;

      // Count sessions in this workspace
      let sessionCount = 0;
      try {
        const db = openDatabase(dbPath);
        const result = getChatDataFromDb(db);
        if (result) {
          const parsed = parseChatData(result.data, result.bundle);
          sessionCount = parsed.length;
        }
        db.close();
      } catch {
        // Skip workspaces with unreadable databases
        continue;
      }

      if (sessionCount > 0) {
        workspaces.push({
          id: entry.name,
          path: workspacePath,
          dbPath,
          sessionCount,
        });
      }
    }
  } catch {
    return [];
  }

  return workspaces;
}

/**
 * Get chat data JSON from database
 * Returns both the main chat data and the bundle for new format
 */
function getChatDataFromDb(db: Database.Database): { data: string; bundle: CursorChatBundle } | null {
  let mainData: string | null = null;
  const bundle: CursorChatBundle = {};

  // Try to get the main chat data
  for (const key of CHAT_DATA_KEYS) {
    try {
      const row = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(key) as
        | { value: string }
        | undefined;
      if (row?.value) {
        mainData = row.value;
        if (key === 'composer.composerData') {
          bundle.composerData = row.value;
        }
        break;
      }
    } catch {
      continue;
    }
  }

  if (!mainData) {
    return null;
  }

  // For new format, also get prompts and generations
  try {
    const promptsRow = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(PROMPTS_KEY) as
      | { value: string }
      | undefined;
    if (promptsRow?.value) {
      bundle.prompts = promptsRow.value;
    }
  } catch {
    // Ignore
  }

  try {
    const gensRow = db.prepare('SELECT value FROM ItemTable WHERE key = ?').get(GENERATIONS_KEY) as
      | { value: string }
      | undefined;
    if (gensRow?.value) {
      bundle.generations = gensRow.value;
    }
  } catch {
    // Ignore
  }

  return { data: mainData, bundle };
}

/**
 * List chat sessions with optional filtering
 * Uses workspace storage for listing (has correct paths and complete list)
 */
export function listSessions(options: ListOptions, customDataPath?: string): ChatSessionSummary[] {
  const workspaces = findWorkspaces(customDataPath);

  // Filter by workspace if specified
  const filteredWorkspaces = options.workspacePath
    ? workspaces.filter(
        (w) => w.path === options.workspacePath || w.path.endsWith(options.workspacePath ?? '')
      )
    : workspaces;

  const allSessions: ChatSessionSummary[] = [];

  for (const workspace of filteredWorkspaces) {
    try {
      const db = openDatabase(workspace.dbPath);
      const result = getChatDataFromDb(db);
      db.close();

      if (!result) continue;

      const sessions = parseChatData(result.data, result.bundle);

      for (const session of sessions) {
        allSessions.push({
          id: session.id,
          index: 0, // Will be assigned after sorting
          title: session.title,
          createdAt: session.createdAt,
          lastUpdatedAt: session.lastUpdatedAt,
          messageCount: session.messageCount,
          workspaceId: workspace.id,
          workspacePath: contractPath(workspace.path),
          preview: session.messages[0]?.content.slice(0, 100) ?? '(Empty session)',
        });
      }
    } catch {
      continue;
    }
  }

  // Sort by most recent first
  allSessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  // Assign indexes
  allSessions.forEach((session, i) => {
    session.index = i + 1;
  });

  // Apply limit
  if (!options.all && options.limit > 0) {
    return allSessions.slice(0, options.limit);
  }

  return allSessions;
}

/**
 * List all workspaces with chat history
 */
export function listWorkspaces(customDataPath?: string): Workspace[] {
  const workspaces = findWorkspaces(customDataPath);

  // Sort by session count descending
  workspaces.sort((a, b) => b.sessionCount - a.sessionCount);

  return workspaces.map((w) => ({
    ...w,
    path: contractPath(w.path),
  }));
}

/**
 * Get a specific session by index
 * Tries global storage first for complete AI responses, falls back to workspace storage
 */
export function getSession(index: number, customDataPath?: string): ChatSession | null {
  const summaries = listSessions({ limit: 0, all: true }, customDataPath);
  const summary = summaries.find((s) => s.index === index);

  if (!summary) {
    return null;
  }

  // Try to get full session from global storage (has AI responses)
  const globalPath = getGlobalStoragePath();
  const globalDbPath = join(globalPath, 'state.vscdb');

  if (existsSync(globalDbPath)) {
    try {
      const db = openDatabase(globalDbPath);

      // Check if cursorDiskKV table exists
      const tableCheck = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'"
      ).get();

      if (tableCheck) {
        // Get all bubbles for this composer
        const bubbleRows = db
          .prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY rowid ASC")
          .all(`bubbleId:${summary.id}:%`) as { key: string; value: string }[];

        db.close();

        if (bubbleRows.length > 0) {
          const messages = bubbleRows.map((row) => {
            try {
              const data = JSON.parse(row.value) as {
                type?: number;
                createdAt?: string;
                bubbleId?: string;
              };

              const text = extractBubbleText(data);
              const role = data.type === 2 ? 'assistant' : 'user';

              return {
                id: data.bubbleId ?? row.key.split(':').pop() ?? null,
                role: role as 'user' | 'assistant',
                content: text,
                timestamp: data.createdAt ? new Date(data.createdAt) : new Date(),
                codeBlocks: [],
              };
            } catch {
              return null;
            }
          }).filter((m): m is NonNullable<typeof m> => m !== null && m.content.length > 0);

          if (messages.length > 0) {
            return {
              id: summary.id,
              index,
              title: summary.title,
              createdAt: summary.createdAt,
              lastUpdatedAt: summary.lastUpdatedAt,
              messageCount: messages.length,
              messages,
              workspaceId: summary.workspaceId,
              workspacePath: summary.workspacePath,
            };
          }
        }
      } else {
        db.close();
      }
    } catch {
      // Fall through to workspace storage
    }
  }

  // Fall back to workspace storage
  const workspaces = findWorkspaces(customDataPath);
  const workspace = workspaces.find((w) => w.id === summary.workspaceId);

  if (!workspace) {
    return null;
  }

  try {
    const db = openDatabase(workspace.dbPath);
    const result = getChatDataFromDb(db);
    db.close();

    if (!result) return null;

    const sessions = parseChatData(result.data, result.bundle);
    const session = sessions.find((s) => s.id === summary.id);

    if (!session) return null;

    return {
      ...session,
      index,
      workspaceId: workspace.id,
      workspacePath: summary.workspacePath,
    };
  } catch {
    return null;
  }
}

/**
 * Search across all chat sessions
 */
export function searchSessions(
  query: string,
  options: SearchOptions,
  customDataPath?: string
): SearchResult[] {
  const summaries = listSessions(
    { limit: 0, all: true, workspacePath: options.workspacePath },
    customDataPath
  );
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  for (const summary of summaries) {
    const session = getSession(summary.index, customDataPath);
    if (!session) continue;

    const snippets = getSearchSnippets(session.messages, lowerQuery, options.contextChars);

    if (snippets.length > 0) {
      const matchCount = snippets.reduce((sum, s) => sum + s.matchPositions.length, 0);

      results.push({
        sessionId: summary.id,
        index: summary.index,
        workspacePath: summary.workspacePath,
        createdAt: summary.createdAt,
        matchCount,
        snippets,
      });
    }
  }

  // Sort by match count descending
  results.sort((a, b) => b.matchCount - a.matchCount);

  // Apply limit
  if (options.limit > 0) {
    return results.slice(0, options.limit);
  }

  return results;
}

/**
 * List sessions from global Cursor storage (cursorDiskKV table)
 * This is where Cursor stores full conversation data including AI responses
 */
export function listGlobalSessions(): ChatSessionSummary[] {
  const globalPath = getGlobalStoragePath();
  const dbPath = join(globalPath, 'state.vscdb');

  if (!existsSync(dbPath)) {
    return [];
  }

  try {
    const db = openDatabase(dbPath);

    // Check if cursorDiskKV table exists
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'"
    ).get();

    if (!tableCheck) {
      db.close();
      return [];
    }

    // Get all composerData entries
    const composerRows = db
      .prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'")
      .all() as { key: string; value: string }[];

    const sessions: ChatSessionSummary[] = [];

    for (const row of composerRows) {
      const composerId = row.key.replace('composerData:', '');

      try {
        const data = JSON.parse(row.value) as {
          name?: string;
          title?: string;
          createdAt?: string;
          updatedAt?: string;
          workspaceUri?: string;
        };

        // Count bubbles for this composer
        const bubbleCount = db
          .prepare("SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE ?")
          .get(`bubbleId:${composerId}:%`) as { count: number };

        if (bubbleCount.count === 0) continue;

        // Get first bubble for preview
        const firstBubble = db
          .prepare("SELECT value FROM cursorDiskKV WHERE key LIKE ? ORDER BY rowid ASC LIMIT 1")
          .get(`bubbleId:${composerId}:%`) as { value: string } | undefined;

        let preview = '';
        if (firstBubble) {
          try {
            const bubbleData = JSON.parse(firstBubble.value);
            preview = extractBubbleText(bubbleData).slice(0, 100);
          } catch {
            // Ignore
          }
        }

        const createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
        const workspacePath = data.workspaceUri
          ? data.workspaceUri.replace(/^file:\/\//, '').replace(/%20/g, ' ')
          : 'Global';

        sessions.push({
          id: composerId,
          index: 0,
          title: data.name ?? data.title ?? null,
          createdAt,
          lastUpdatedAt: data.updatedAt ? new Date(data.updatedAt) : createdAt,
          messageCount: bubbleCount.count,
          workspaceId: 'global',
          workspacePath: contractPath(workspacePath),
          preview,
        });
      } catch {
        continue;
      }
    }

    db.close();

    // Sort by most recent first
    sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Assign indexes
    sessions.forEach((session, i) => {
      session.index = i + 1;
    });

    return sessions;
  } catch {
    return [];
  }
}

/**
 * Get a session from global storage by index
 */
export function getGlobalSession(index: number): ChatSession | null {
  const summaries = listGlobalSessions();
  const summary = summaries.find((s) => s.index === index);

  if (!summary) {
    return null;
  }

  const globalPath = getGlobalStoragePath();
  const dbPath = join(globalPath, 'state.vscdb');

  try {
    const db = openDatabase(dbPath);

    // Get all bubbles for this composer
    const bubbleRows = db
      .prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE ? ORDER BY rowid ASC")
      .all(`bubbleId:${summary.id}:%`) as { key: string; value: string }[];

    db.close();

    const messages = bubbleRows.map((row) => {
      try {
        const data = JSON.parse(row.value) as {
          type?: number;
          createdAt?: string;
          bubbleId?: string;
        };

        const text = extractBubbleText(data);
        const role = data.type === 2 ? 'assistant' : 'user';

        return {
          id: data.bubbleId ?? row.key.split(':').pop() ?? null,
          role: role as 'user' | 'assistant',
          content: text,
          timestamp: data.createdAt ? new Date(data.createdAt) : new Date(),
          codeBlocks: [],
        };
      } catch {
        return null;
      }
    }).filter((m): m is NonNullable<typeof m> => m !== null && m.content.length > 0);

    return {
      id: summary.id,
      index,
      title: summary.title,
      createdAt: summary.createdAt,
      lastUpdatedAt: summary.lastUpdatedAt,
      messageCount: messages.length,
      messages,
      workspaceId: 'global',
    };
  } catch {
    return null;
  }
}

/**
 * Format a tool call for display
 */
function formatToolCall(toolData: { name?: string; params?: string; result?: string }): string {
  const lines: string[] = [];
  const toolName = toolData.name ?? 'unknown';

  // Parse params to get file path or other details
  let target = '';
  try {
    const params = JSON.parse(toolData.params ?? '{}');
    target = params.targetFile ?? params.targetDirectory ?? params.command ?? '';
  } catch {
    // Ignore parse errors
  }

  // Format based on tool type
  if (toolName === 'read_file') {
    lines.push(`[Tool: Read File]`);
    if (target) lines.push(`File: ${target}`);

    // Show abbreviated content
    try {
      const result = JSON.parse(toolData.result ?? '{}');
      if (result.contents) {
        const preview = result.contents.slice(0, 300).replace(/\n/g, '\\n');
        lines.push(`Content: ${preview}${result.contents.length > 300 ? '...' : ''}`);
      }
    } catch {
      // Ignore
    }
  } else if (toolName === 'list_dir') {
    lines.push(`[Tool: List Directory]`);
    if (target) lines.push(`Directory: ${target}`);
  } else if (toolName === 'run_terminal_command') {
    lines.push(`[Tool: Terminal Command]`);
    if (target) lines.push(`Command: ${target}`);
  } else if (toolName === 'edit_file') {
    lines.push(`[Tool: Edit File]`);
    if (target) lines.push(`File: ${target}`);
  } else if (toolName === 'create_file') {
    lines.push(`[Tool: Create File]`);
    if (target) lines.push(`File: ${target}`);
  } else {
    lines.push(`[Tool: ${toolName}]`);
    if (target) lines.push(`Target: ${target}`);
  }

  return lines.join('\n');
}

/**
 * Extract text content from a bubble object
 */
function extractBubbleText(data: Record<string, unknown>): string {
  // Priority 0: Check for tool call in toolFormerData
  const toolFormerData = data['toolFormerData'] as {
    name?: string;
    params?: string;
    result?: string;
    status?: string;
  } | undefined;

  if (toolFormerData?.name && toolFormerData?.status === 'completed') {
    return formatToolCall(toolFormerData);
  }

  // Priority 1: codeBlocks content
  const codeBlocks = data['codeBlocks'] as Array<{ content?: string }> | undefined;
  if (codeBlocks && Array.isArray(codeBlocks)) {
    const parts = codeBlocks
      .map((cb) => cb.content)
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 0);
    if (parts.length > 0) {
      return parts.join('\n\n');
    }
  }

  // Priority 2: common text fields
  for (const key of ['text', 'content', 'finalText', 'message', 'markdown', 'textDescription']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  // Priority 3: find longest string with markdown features
  let best = '';
  const walk = (obj: unknown): void => {
    if (typeof obj === 'object' && obj !== null) {
      if (Array.isArray(obj)) {
        obj.forEach(walk);
      } else {
        Object.values(obj).forEach(walk);
      }
    } else if (typeof obj === 'string') {
      if (obj.length > best.length && (obj.includes('\n') || obj.includes('```') || obj.includes('# '))) {
        best = obj;
      }
    }
  };
  walk(data);

  return best;
}
