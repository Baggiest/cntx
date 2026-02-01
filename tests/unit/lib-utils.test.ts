import { describe, it, expect } from 'vitest';
import { getDefaultDataPath } from '../../src/lib/utils.js';

describe('getDefaultDataPath', () => {
  it('returns a string path', () => {
    const path = getDefaultDataPath();
    expect(typeof path).toBe('string');
    expect(path.length).toBeGreaterThan(0);
  });

  it('includes workspaceStorage in path', () => {
    const path = getDefaultDataPath();
    expect(path).toContain('workspaceStorage');
  });
});
