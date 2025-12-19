/**
 * Show command - display a single chat session in detail
 */

import type { Command } from 'commander';
import { getSession, listSessions } from '../../core/storage.js';
import { formatSessionDetail, formatSessionJson } from '../formatters/index.js';
import { SessionNotFoundError, handleError } from '../../lib/errors.js';
import { expandPath } from '../../lib/platform.js';

interface ShowCommandOptions {
  json?: boolean;
  dataPath?: string;
}

/**
 * Register the show command
 */
export function registerShowCommand(program: Command): void {
  program
    .command('show <index>')
    .description('Show a chat session by index')
    .action(async (indexArg: string, options: ShowCommandOptions, command: Command) => {
      const globalOptions = command.parent?.opts() as { json?: boolean; dataPath?: string };
      const useJson = options.json ?? globalOptions?.json ?? false;
      const customPath = options.dataPath ?? globalOptions?.dataPath;

      const index = parseInt(indexArg, 10);

      if (isNaN(index) || index < 1) {
        handleError(new Error(`Invalid index: ${indexArg}. Must be a positive number.`));
      }

      try {
        const session = getSession(index, customPath ? expandPath(customPath) : undefined);

        if (!session) {
          // Get max index for error message
          const sessions = listSessions(
            { limit: 0, all: true },
            customPath ? expandPath(customPath) : undefined
          );
          throw new SessionNotFoundError(index, sessions.length);
        }

        if (useJson) {
          console.log(formatSessionJson(session, session.workspacePath));
        } else {
          console.log(formatSessionDetail(session, session.workspacePath));
        }
      } catch (error) {
        handleError(error);
      }
    });
}
