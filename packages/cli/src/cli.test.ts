import { describe, expect, it } from 'vitest';
import { parseArgv } from './cli.js';
import { CliUsageError } from './errors.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';

describe('parseArgv', () => {
  it('shows help on no args', () => {
    expect(parseArgv([])).toEqual({ kind: 'help' });
  });

  it('shows help on --help / -h', () => {
    expect(parseArgv(['--help'])).toEqual({ kind: 'help' });
    expect(parseArgv(['-h'])).toEqual({ kind: 'help' });
  });

  it('reports the version on --version / -v', () => {
    expect(parseArgv(['--version'])).toEqual({ kind: 'version' });
    expect(parseArgv(['-v'])).toEqual({ kind: 'version' });
  });

  it('rejects an unknown command with a "did you mean" suggestion', () => {
    expect(() => parseArgv(['nwe', 'my-app'])).toThrow(CliUsageError);
    expect(() => parseArgv(['nwe', 'my-app'])).toThrow(/did you mean "new"/);
  });

  it('rejects an unknown command with no close match, no suggestion', () => {
    expect(() => parseArgv(['frobnicate'])).toThrow(CliUsageError);
    expect(() => parseArgv(['frobnicate'])).not.toThrow(/did you mean/);
  });

  it('rejects an unknown flag with a "did you mean" suggestion', () => {
    expect(() => parseArgv(['new', 'my-app', '--frmaework', 'react'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['new', 'my-app', '--frmaework', 'react'])).toThrow(
      /did you mean "--framework"/,
    );
  });

  it('rejects an invalid --framework value instead of silently mis-parsing it as the app name', () => {
    expect(() => parseArgv(['new', 'my-app', '--framework', 'jquery'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['new', 'my-app', '--framework', 'jquery'])).toThrow(
      /react, vue, angular, solid, svelte/,
    );
  });

  it('rejects a value flag missing its value', () => {
    expect(() => parseArgv(['new', 'my-app', '--framework'])).toThrow(
      CliUsageError,
    );
  });

  it('rejects an invalid --styling value', () => {
    expect(() => parseArgv(['new', 'my-app', '--styling', 'tailwind'])).toThrow(
      CliUsageError,
    );
  });

  it('rejects an invalid --vue-flavor value', () => {
    expect(() => parseArgv(['new', 'my-app', '--vue-flavor', 'jsx'])).toThrow(
      CliUsageError,
    );
  });

  it('rejects an invalid --pm value', () => {
    expect(() => parseArgv(['new', 'my-app', '--pm', 'bun'])).toThrow(
      CliUsageError,
    );
  });

  it('still parses a fully valid "new" invocation', () => {
    expect(
      parseArgv([
        'new',
        'my-app',
        '--framework',
        'vue',
        '--vue-flavor',
        'sfc',
        '--navigation',
      ]),
    ).toEqual({
      kind: 'new',
      appName: 'my-app',
      framework: 'vue',
      vueFlavor: 'sfc',
      isJavascript: false,
      hasForce: false,
      bundleId: undefined,
      hasExpoModules: false,
      hasNavigation: true,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages: new Set(),
      styling: undefined,
      packageManager: undefined,
    });
  });

  it('parses --force', () => {
    expect(parseArgv(['new', 'my-app', '--force'])).toEqual({
      kind: 'new',
      appName: 'my-app',
      framework: undefined,
      vueFlavor: undefined,
      isJavascript: false,
      hasForce: true,
      bundleId: undefined,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages: new Set(),
      styling: undefined,
      packageManager: undefined,
    });
  });

  it('parses --splash-screen', () => {
    expect(parseArgv(['new', 'my-app', '--splash-screen'])).toEqual({
      kind: 'new',
      appName: 'my-app',
      framework: undefined,
      vueFlavor: undefined,
      isJavascript: false,
      hasForce: false,
      bundleId: undefined,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: true,
      hasSlider: false,
      expoPackages: new Set(),
      styling: undefined,
      packageManager: undefined,
    });
  });

  it('parses --slider', () => {
    expect(parseArgv(['new', 'my-app', '--slider'])).toEqual({
      kind: 'new',
      appName: 'my-app',
      framework: undefined,
      vueFlavor: undefined,
      isJavascript: false,
      hasForce: false,
      bundleId: undefined,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: true,
      expoPackages: new Set(),
      styling: undefined,
      packageManager: undefined,
    });
  });

  it('accepts --flag=value syntax for every value flag (git/npm convention)', () => {
    expect(
      parseArgv([
        'new',
        'my-app',
        '--framework=vue',
        '--vue-flavor=sfc',
        '--bundle-id=com.example.app',
        '--styling=scss',
        '--pm=pnpm',
      ]),
    ).toEqual({
      kind: 'new',
      appName: 'my-app',
      framework: 'vue',
      vueFlavor: 'sfc',
      isJavascript: false,
      hasForce: false,
      bundleId: 'com.example.app',
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages: new Set(),
      styling: 'scss',
      packageManager: 'pnpm',
    });
  });

  it('rejects an invalid value given via --flag=value the same way as --flag value', () => {
    expect(() => parseArgv(['new', 'my-app', '--framework=jquery'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['new', 'my-app', '--framework=jquery'])).toThrow(
      /react, vue, angular, solid, svelte/,
    );
  });

  it('rejects an unknown flag given via --flag=value with a suggestion', () => {
    expect(() => parseArgv(['new', 'my-app', '--frmaework=react'])).toThrow(
      /did you mean "--framework"/,
    );
  });

  it('rejects a value given to a boolean flag instead of silently ignoring it', () => {
    expect(() => parseArgv(['new', 'my-app', '--force=false'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['new', 'my-app', '--force=false'])).toThrow(
      /doesn't take a value/,
    );
  });

  it('a bundle id value that itself contains "=" is preserved verbatim', () => {
    // Contrived, but "=" is a legal bundle-id character per no pattern check at parse time —
    // only the first "=" should split the flag from its value.
    expect(
      parseArgv(['new', 'my-app', '--bundle-id=com.example.a=b']).kind,
    ).toBe('new');
  });

  it('still parses a fully valid "add" invocation', () => {
    expect(parseArgv(['add', '--framework', 'react', '--testing'])).toEqual({
      kind: 'add',
      framework: 'react',
      vueFlavor: undefined,
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: true,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages: new Set(),
      hasForce: false,
      packageManager: undefined,
    });
  });

  // --slider parsed into `hasSlider` for "new" but the "add" branch of parseArgv never carried the
  // field on its return object — the flag was silently dropped for "add" alone.
  it('"add" carries --slider through, same as "new"', () => {
    expect(parseArgv(['add', '--slider'])).toMatchObject({ hasSlider: true });
  });

  // --force lets a non-interactive "add" overwrite an already-generated testing layer file
  // (detox.config.js / e2e/*) instead of erroring — same flag shape "new" already has for
  // overwriting a non-empty target directory.
  it('"add" accepts --force', () => {
    expect(parseArgv(['add', '--force'])).toMatchObject({ hasForce: true });
  });

  // `add` takes no positional argument at all (it wires into the CURRENT project) — a stray one
  // used to fall through the parse loop untouched, silently ignored rather than reported. A typo
  // like "add my-app" (thinking of "new"'s shape) or a misplaced short flag then does nothing
  // instead of erroring, which is worse than a wrong guess: nothing signals the mistake at all.
  it('rejects a stray positional argument on "add"', () => {
    expect(() => parseArgv(['add', 'my-app'])).toThrow(CliUsageError);
    expect(() => parseArgv(['add', 'my-app'])).toThrow(
      /"add" doesn't take a positional argument/,
    );
  });

  // "new" takes exactly one positional (the app name) — a second one used to vanish the same way,
  // so "new my-app extra-arg" silently scaffolded "my-app" and said nothing about "extra-arg".
  it('rejects a second positional argument on "new"', () => {
    expect(() => parseArgv(['new', 'my-app', 'extra-arg'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['new', 'my-app', 'extra-arg'])).toThrow(
      /Unexpected argument "extra-arg"/,
    );
  });

  // Every EXPO_PACKAGE_LAYERS entry gets its own `--<id>` boolean flag, generically derived from
  // the registry — same shape as --slider, just for the 21 Expo-backed packages.
  it.each(EXPO_PACKAGE_LAYERS)('parses --$id for "new"', layer => {
    const parsed = parseArgv(['new', 'my-app', `--${layer.id}`]);
    if (parsed.kind !== 'new') throw new Error('expected "new"');
    expect(parsed.expoPackages).toEqual(new Set([layer.id]));
  });

  it.each(EXPO_PACKAGE_LAYERS)('parses --$id for "add"', layer => {
    const parsed = parseArgv(['add', `--${layer.id}`]);
    if (parsed.kind !== 'add') throw new Error('expected "add"');
    expect(parsed.expoPackages).toEqual(new Set([layer.id]));
  });

  it('accumulates multiple expo-package flags into one set', () => {
    const parsed = parseArgv(['new', 'my-app', '--battery', '--sensors']);
    if (parsed.kind !== 'new') throw new Error('expected "new"');
    expect(parsed.expoPackages).toEqual(new Set(['battery', 'sensors']));
  });
});
