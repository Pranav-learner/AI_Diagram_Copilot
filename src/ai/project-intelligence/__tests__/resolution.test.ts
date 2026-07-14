import { describe, it, expect } from 'vitest';
import { canonicalKey } from '../util';

describe('enhanced entity resolution — normalization rules', () => {
  it('normalizes plural forms to singular forms', () => {
    // Plural forms with -s
    expect(canonicalKey('UserServices')).toBe('user service');
    expect(canonicalKey('Containers')).toBe('container');
    expect(canonicalKey('databases')).toBe('database');
    expect(canonicalKey('Users')).toBe('user');

    // Plural forms with -ies
    expect(canonicalKey('Repositories')).toBe('repository');
    expect(canonicalKey('queries')).toBe('query');

    // Plural forms with -es
    expect(canonicalKey('Processes')).toBe('process');
    expect(canonicalKey('gateways')).toBe('gateway');
  });

  it('preserves non-plural terms ending in -s, -ss, -us, -is, -as', () => {
    expect(canonicalKey('status')).toBe('status');
    expect(canonicalKey('analysis')).toBe('analysis');
    expect(canonicalKey('gas')).toBe('gas');
    expect(canonicalKey('process')).toBe('process');
    expect(canonicalKey('axis')).toBe('axis');
  });

  it('normalizes common code suffixes', () => {
    // Impl suffix
    expect(canonicalKey('UserServiceImpl')).toBe('user service');
    expect(canonicalKey('user_service_impl')).toBe('user service');

    // Base suffix
    expect(canonicalKey('UserServiceBase')).toBe('user service');

    // Interface suffix
    expect(canonicalKey('UserServiceInterface')).toBe('user service');
    
    // Multiple suffixes chained
    expect(canonicalKey('UserServiceBaseImpl')).toBe('user service');
  });

  it('does not strip suffixes if they are the only token', () => {
    expect(canonicalKey('Impl')).toBe('impl');
    expect(canonicalKey('Base')).toBe('base');
    expect(canonicalKey('Interface')).toBe('interface');
  });
});
