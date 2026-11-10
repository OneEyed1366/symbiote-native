import { describe, expect, it } from 'vitest';
import { parseArgv } from './cli.js';
import { CliUsageError } from './errors.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';

const NEW_DEFAULTS = {
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
  hasSlider: false,
  hasReanimated: false,
  expoPackages: new Set(),
  styling: undefined,
  packageManager: undefined,
};

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
      ...NEW_DEFAULTS,
      framework: 'vue',
      vueFlavor: 'sfc',
      hasNavigation: true,
    });
  });

  it('parses --force', () => {
    expect(parseArgv(['new', 'my-app', '--force'])).toEqual({
      ...NEW_DEFAULTS,
      hasForce: true,
    });
  });

  it('parses --splash-screen', () => {
    expect(parseArgv(['new', 'my-app', '--splash-screen'])).toEqual({
      ...NEW_DEFAULTS,
      hasSplashScreen: true,
    });
  });

  it('parses --slider', () => {
    expect(parseArgv(['new', 'my-app', '--slider'])).toEqual({
      ...NEW_DEFAULTS,
      hasSlider: true,
    });
  });

  it('parses --reanimated', () => {
    expect(parseArgv(['new', 'my-app', '--reanimated'])).toEqual({
      ...NEW_DEFAULTS,
      hasReanimated: true,
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
      ...NEW_DEFAULTS,
      framework: 'vue',
      vueFlavor: 'sfc',
      bundleId: 'com.example.app',
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

  // "=" is a legal bundle-id character, so only the first "=" splits the flag from its value
  it('a bundle id value that itself contains "=" is preserved verbatim', () => {
    expect(
      parseArgv(['new', 'my-app', '--bundle-id=com.example.a=b']),
    ).toMatchObject({ bundleId: 'com.example.a=b' });
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
      hasReanimated: false,
      expoPackages: new Set(),
      hasForce: false,
      packageManager: undefined,
    });
  });

  // "add" once dropped --slider, as only the "new" branch carried the field
  it('"add" carries --slider through, same as "new"', () => {
    expect(parseArgv(['add', '--slider'])).toMatchObject({ hasSlider: true });
  });

  it('"add" carries --reanimated through, same as "new"', () => {
    expect(parseArgv(['add', '--reanimated'])).toMatchObject({
      hasReanimated: true,
    });
  });

  // --force lets a non-interactive "add" overwrite an already-generated testing layer file
  it('"add" accepts --force', () => {
    expect(parseArgv(['add', '--force'])).toMatchObject({ hasForce: true });
  });

  // "add" takes no positional at all, as it wires into the CURRENT project
  // A stray one was once ignored silently, which hides a typo like "add my-app"
  it('rejects a stray positional argument on "add"', () => {
    expect(() => parseArgv(['add', 'my-app'])).toThrow(CliUsageError);
    expect(() => parseArgv(['add', 'my-app'])).toThrow(
      /"add" doesn't take a positional argument/,
    );
  });

  // "new" takes exactly one positional, the app name, and a second one used to vanish silently
  it('rejects a second positional argument on "new"', () => {
    expect(() => parseArgv(['new', 'my-app', 'extra-arg'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['new', 'my-app', 'extra-arg'])).toThrow(
      /Unexpected argument "extra-arg"/,
    );
  });

  // Every EXPO_PACKAGE_LAYERS entry gets its own `--<id>` boolean flag, derived from the registry
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

  // "grant" with no argument offers every bundle of every installed package
  // The layer is only known once `runGrant` scans node_modules, so `parseArgv` cannot validate it
  it('parses "grant" with no layer', () => {
    expect(parseArgv(['grant'])).toEqual({ kind: 'grant', layer: undefined });
  });

  it('parses "grant <layer>" as a free-form filter, not a fixed enum', () => {
    expect(parseArgv(['grant', 'location'])).toEqual({
      kind: 'grant',
      layer: 'location',
    });
    expect(parseArgv(['grant', 'not-a-real-package'])).toEqual({
      kind: 'grant',
      layer: 'not-a-real-package',
    });
  });

  it('rejects a second positional argument to "grant"', () => {
    expect(() => parseArgv(['grant', 'location', 'extra'])).toThrow(
      CliUsageError,
    );
    expect(() => parseArgv(['grant', 'location', 'extra'])).toThrow(
      /"grant" takes at most one layer/,
    );
  });
});
