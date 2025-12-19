/**
 * Table/text output formatter for CLI with color support
 */

import pc from 'picocolors';
import type { ChatSessionSummary, Workspace, ChatSession, SearchResult } from '../../core/types.js';

/**
 * Check if output supports colors
 */
export function supportsColor(): boolean {
  // Respect NO_COLOR environment variable
  if (process.env['NO_COLOR'] !== undefined) {
    return false;
  }

  // Check if stdout is a TTY
  return process.stdout.isTTY === true;
}

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Pad string to fixed width
 */
function padRight(str: string, width: number): string {
  return str.padEnd(width);
}

/**
 * Format sessions list as table
 */
export function formatSessionsTable(sessions: ChatSessionSummary[]): string {
  if (sessions.length === 0) {
    return pc.yellow('No chat sessions found.');
  }

  const lines: string[] = [];

  // Header
  lines.push(
    pc.bold(
      `${padRight('#', 4)} ${padRight('Date', 12)} ${padRight('Messages', 8)} ${padRight('Workspace', 30)} Preview`
    )
  );
  lines.push(pc.dim('─'.repeat(100)));

  // Rows
  for (const session of sessions) {
    const idx = pc.cyan(padRight(String(session.index), 4));
    const date = padRight(formatDate(session.createdAt), 12);
    const msgs = padRight(String(session.messageCount), 8);
    const workspace = pc.dim(padRight(truncate(session.workspacePath, 30), 30));
    const preview = truncate(session.preview, 40);

    lines.push(`${idx} ${date} ${msgs} ${workspace} ${preview}`);
  }

  lines.push('');
  lines.push(pc.dim(`Showing ${sessions.length} session(s). Use "show <#>" to view details.`));

  return lines.join('\n');
}

/**
 * Format workspaces list as table
 */
export function formatWorkspacesTable(workspaces: Workspace[]): string {
  if (workspaces.length === 0) {
    return pc.yellow('No workspaces with chat history found.');
  }

  const lines: string[] = [];

  // Header
  lines.push(pc.bold(`${padRight('Sessions', 10)} Path`));
  lines.push(pc.dim('─'.repeat(80)));

  // Rows
  for (const workspace of workspaces) {
    const count = pc.cyan(padRight(String(workspace.sessionCount), 10));
    const path = workspace.path;
    lines.push(`${count} ${path}`);
  }

  lines.push('');
  lines.push(pc.dim(`Found ${workspaces.length} workspace(s) with chat history.`));

  return lines.join('\n');
}

/**
 * Check if content is a tool call (formatted by storage layer)
 */
function isToolCall(content: string): boolean {
  return content.startsWith('[Tool:');
}

/**
 * Format tool call content with nice styling
 */
function formatToolCallDisplay(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (line.startsWith('[Tool:')) {
      // Tool header
      const toolName = line.replace('[Tool:', '').replace(']', '').trim();
      result.push(pc.magenta(pc.bold(`🔧 ${toolName}`)));
    } else if (line.startsWith('File:') || line.startsWith('Directory:') || line.startsWith('Command:') || line.startsWith('Target:')) {
      // Target line
      result.push(pc.cyan('   ' + line));
    } else if (line.startsWith('Content:')) {
      // Content preview
      const preview = line.replace('Content:', '').trim();
      result.push(pc.dim('   Content: ') + pc.gray(preview.slice(0, 100) + (preview.length > 100 ? '...' : '')));
    } else {
      result.push('   ' + line);
    }
  }

  return result.join('\n');
}

/**
 * Format a single session with full messages
 */
export function formatSessionDetail(session: ChatSession, workspacePath?: string): string {
  const lines: string[] = [];

  // Header
  lines.push(pc.bold(`Chat Session #${session.index}`));
  lines.push(pc.dim('═'.repeat(60)));
  lines.push('');

  if (session.title) {
    lines.push(`${pc.bold('Title:')} ${session.title}`);
  }
  lines.push(`${pc.bold('Date:')} ${formatDate(session.createdAt)}`);
  if (workspacePath) {
    lines.push(`${pc.bold('Workspace:')} ${workspacePath}`);
  }
  lines.push(`${pc.bold('Messages:')} ${session.messageCount}`);
  lines.push('');
  lines.push(pc.dim('─'.repeat(60)));
  lines.push('');

  // Messages
  for (const message of session.messages) {
    // Check if this is a tool call
    if (isToolCall(message.content)) {
      lines.push(formatToolCallDisplay(message.content));
      lines.push('');
      lines.push(pc.dim('─'.repeat(40)));
      lines.push('');
      continue;
    }

    const roleLabel =
      message.role === 'user' ? pc.blue(pc.bold('You:')) : pc.green(pc.bold('Assistant:'));

    lines.push(roleLabel);
    lines.push('');
    lines.push(message.content);
    lines.push('');
    lines.push(pc.dim('─'.repeat(40)));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format search results
 */
export function formatSearchResultsTable(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return pc.yellow(`No results found for: "${query}"`);
  }

  const lines: string[] = [];
  const totalMatches = results.reduce((sum, r) => sum + r.matchCount, 0);

  lines.push(pc.bold(`Search results for "${query}"`));
  lines.push(pc.dim(`Found ${totalMatches} match(es) in ${results.length} session(s)`));
  lines.push('');
  lines.push(pc.dim('─'.repeat(80)));
  lines.push('');

  for (const result of results) {
    lines.push(
      `${pc.cyan(`#${result.index}`)} ${pc.dim(formatDate(result.createdAt))} ${pc.dim(result.workspacePath)}`
    );
    lines.push(`  ${pc.dim(`${result.matchCount} match(es)`)}`);

    // Show first snippet with highlighting
    if (result.snippets.length > 0) {
      const snippet = result.snippets[0]!;
      const roleLabel = snippet.messageRole === 'user' ? pc.blue('[You]') : pc.green('[AI]');

      // Highlight matches in snippet
      let highlighted = snippet.text;
      // Apply highlights in reverse order to preserve positions
      const sortedPositions = [...snippet.matchPositions].sort((a, b) => b[0] - a[0]);
      for (const [start, end] of sortedPositions) {
        const before = highlighted.slice(0, start);
        const match = highlighted.slice(start, end);
        const after = highlighted.slice(end);
        highlighted = before + pc.bgYellow(pc.black(match)) + after;
      }

      lines.push(`  ${roleLabel} ${highlighted}`);
    }

    lines.push('');
  }

  lines.push(pc.dim('Use --show <#> to view full session.'));

  return lines.join('\n');
}

/**
 * Format export success message
 */
export function formatExportSuccess(exported: { index: number; path: string }[]): string {
  const lines: string[] = [];

  lines.push(pc.green(`✓ Exported ${exported.length} session(s):`));
  for (const { index, path } of exported) {
    lines.push(`  ${pc.cyan(`#${index}`)} → ${path}`);
  }

  return lines.join('\n');
}

/**
 * Format empty state message for no history
 */
export function formatNoHistory(): string {
  const lines = [
    pc.yellow('No chat history found.'),
    '',
    'To start recording chat history:',
    '  1. Open a project in Cursor',
    '  2. Start a conversation with the AI assistant',
    '  3. Run this command again',
  ];

  return lines.join('\n');
}

/**
 * Format error message for Cursor not installed
 */
export function formatCursorNotFound(searchPath: string): string {
  const lines = [
    pc.red('Cursor data not found.'),
    '',
    `Searched in: ${searchPath}`,
    '',
    'Make sure Cursor is installed and has been used at least once.',
    '',
    'You can specify a custom path with:',
    `  ${pc.cyan('--data-path <path>')}`,
    `  ${pc.cyan('CURSOR_DATA_PATH')} environment variable`,
  ];

  return lines.join('\n');
}
