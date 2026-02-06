import { describe, it, expect, vi, afterEach } from 'vitest';
import { debugLog } from '../../src/core/database/debug.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('debugLog', () => {
  it('writes to stderr when DEBUG is set', () => {
    vi.stubEnv('DEBUG', 'cntx:*');
    vi.stubEnv('CNTX_DEBUG', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugLog('test message');
    expect(spy).toHaveBeenCalledWith('[cntx:sqlite] test message');
  });

  it('writes to stderr when CNTX_DEBUG is set', () => {
    vi.stubEnv('DEBUG', '');
    vi.stubEnv('CNTX_DEBUG', '1');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugLog('test message');
    expect(spy).toHaveBeenCalled();
  });

  it('does not write when neither env is set', () => {
    vi.stubEnv('DEBUG', '');
    vi.stubEnv('CNTX_DEBUG', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    debugLog('test message');
    expect(spy).not.toHaveBeenCalled();
  });
});
