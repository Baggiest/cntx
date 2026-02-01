import { describe, it, expect } from 'vitest';
import {
  NoDriverAvailableError,
  DriverNotAvailableError,
  ReadonlyDatabaseError,
} from '../../src/core/database/errors.js';

describe('NoDriverAvailableError', () => {
  it('has descriptive message', () => {
    const err = new NoDriverAvailableError();
    expect(err.message).toContain('better-sqlite3');
    expect(err.message).toContain('Node.js');
    expect(err.name).toBe('NoDriverAvailableError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('DriverNotAvailableError', () => {
  it('includes driver name and available list', () => {
    const err = new DriverNotAvailableError('node:sqlite', ['better-sqlite3']);
    expect(err.message).toContain('node:sqlite');
    expect(err.message).toContain('better-sqlite3');
    expect(err.name).toBe('DriverNotAvailableError');
  });

  it('handles empty available list', () => {
    const err = new DriverNotAvailableError('invalid', []);
    expect(err.message).toContain('invalid');
    expect(err.message).toContain('No drivers are currently available');
  });
});

describe('ReadonlyDatabaseError', () => {
  it('has correct message and name', () => {
    const err = new ReadonlyDatabaseError();
    expect(err.message).toContain('read-only');
    expect(err.name).toBe('ReadonlyDatabaseError');
    expect(err).toBeInstanceOf(Error);
  });
});
