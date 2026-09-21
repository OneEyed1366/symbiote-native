import { describe, expect, it } from 'vitest';
import { isValidPackageName, toValidPackageName } from './package-name.js';

describe('isValidPackageName', () => {
  it('accepts a plain lowercase-hyphenated name', () => {
    expect(isValidPackageName('my-app')).toBe(true);
  });

  it('accepts a scoped name', () => {
    expect(isValidPackageName('@scope/my-app')).toBe(true);
  });

  it('rejects uppercase letters', () => {
    expect(isValidPackageName('MyApp')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(isValidPackageName('my app')).toBe(false);
  });

  it('rejects a leading dot or underscore', () => {
    expect(isValidPackageName('.my-app')).toBe(false);
    expect(isValidPackageName('_my-app')).toBe(false);
  });
});

describe('toValidPackageName', () => {
  it('leaves an already-valid name untouched', () => {
    expect(toValidPackageName('my-app')).toBe('my-app');
  });

  it('lowercases and hyphenates spaces', () => {
    expect(toValidPackageName('My Cool App')).toBe('my-cool-app');
  });

  it('strips a leading dot or underscore', () => {
    expect(toValidPackageName('.my-app')).toBe('my-app');
    expect(toValidPackageName('_my-app')).toBe('my-app');
  });

  it('collapses any other invalid character run to a single hyphen', () => {
    expect(toValidPackageName('my@app!!!name')).toBe('my-app-name');
  });

  it('always produces a name isValidPackageName accepts, for a pathological input', () => {
    const result = toValidPackageName('  ../../etc/PASSWD!! ');
    expect(isValidPackageName(result)).toBe(true);
  });
});
