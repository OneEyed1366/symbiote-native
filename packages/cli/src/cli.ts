import { CliUsageError } from './errors.js';
import {
  EXPO_PACKAGE_LAYERS,
  isExpoPackageLayerName,
  type IExpoPackageLayerName,
} from './expo-package-layers.js';
import type {
  IFramework,
  IPackageManager,
  IStylingOption,
  IVueFlavor,
} from './types.js';
import { findClosestMatch } from './utils/suggest.js';

export type IParsedCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | {
      readonly kind: 'new';
      readonly appName: string | undefined;
      readonly framework: IFramework | undefined;
      readonly vueFlavor: IVueFlavor | undefined;
      readonly isJavascript: boolean;
      readonly hasForce: boolean;
      readonly bundleId: string | undefined;
      readonly hasExpoModules: boolean;
      readonly hasNavigation: boolean;
      readonly hasTesting: boolean;
      readonly hasSplashScreen: boolean;
      readonly hasSlider: boolean;
      readonly expoPackages: ReadonlySet<IExpoPackageLayerName>;
      readonly styling: IStylingOption | undefined;
      readonly packageManager: IPackageManager | undefined;
    }
  | {
      readonly kind: 'add';
      readonly framework: IFramework | undefined;
      readonly vueFlavor: IVueFlavor | undefined;
      readonly hasExpoModules: boolean;
      readonly hasNavigation: boolean;
      readonly hasTesting: boolean;
      readonly hasSplashScreen: boolean;
      readonly hasSlider: boolean;
      readonly expoPackages: ReadonlySet<IExpoPackageLayerName>;
      readonly hasForce: boolean;
      readonly packageManager: IPackageManager | undefined;
    };

// Typed as ReadonlySet<string>, not ReadonlySet<IFramework>, so the membership check below
// takes a plain `string` — the `value is IFramework` return annotation is what does the
// actual narrowing, with no `as` cast needed anywhere in this function.
const FRAMEWORKS: ReadonlySet<string> = new Set([
  'react',
  'vue',
  'angular',
  'solid',
  'svelte',
]);
const VUE_FLAVORS: ReadonlySet<string> = new Set(['tsx', 'sfc']);
const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(['npm', 'pnpm', 'yarn']);
const STYLING_OPTIONS: ReadonlySet<string> = new Set([
  'css',
  'scss',
  'less',
  'stylus',
  'css-modules',
  'stylesheet',
]);

const KNOWN_FLAGS = [
  '--javascript',
  '--force',
  '--expo-modules',
  '--navigation',
  '--testing',
  '--splash-screen',
  '--slider',
  '--framework',
  '--bundle-id',
  '--styling',
  '--vue-flavor',
  '--pm',
  ...EXPO_PACKAGE_LAYERS.map(layer => `--${layer.id}`),
];

function isFramework(value: string): value is IFramework {
  return FRAMEWORKS.has(value);
}

function isVueFlavor(value: string): value is IVueFlavor {
  return VUE_FLAVORS.has(value);
}

function isPackageManager(value: string): value is IPackageManager {
  return PACKAGE_MANAGERS.has(value);
}

function isStylingOption(value: string): value is IStylingOption {
  return STYLING_OPTIONS.has(value);
}

// `--framework=react` (git/npm's own convention) alongside the space-separated `--framework
// react` form — splits only the FIRST `=`, so a value that itself contains one (an edge case for
// --bundle-id) survives intact.
function splitInlineFlag(token: string): {
  name: string;
  inlineValue: string | undefined;
} {
  const eqIndex = token.startsWith('--') ? token.indexOf('=') : -1;
  if (eqIndex === -1) return { name: token, inlineValue: undefined };
  return {
    name: token.slice(0, eqIndex),
    inlineValue: token.slice(eqIndex + 1),
  };
}

function assertNoInlineValue(
  flagName: string,
  inlineValue: string | undefined,
): void {
  if (inlineValue !== undefined) {
    throw new CliUsageError(
      `"${flagName}" doesn't take a value — just "${flagName}".`,
    );
  }
}

function usageErrorFor(
  kind: 'command' | 'flag',
  input: string,
  candidates: readonly string[],
): CliUsageError {
  const suggestion = findClosestMatch(input, candidates);
  const noun = kind === 'command' ? 'command' : 'flag';
  return new CliUsageError(
    `Unknown ${noun} "${input}"${suggestion ? ` — did you mean "${suggestion}"?` : '.'} ` +
      'Run "@symbiote-native/cli --help" for usage.',
  );
}

// Takes the raw value alongside the flag so a missing/invalid value errors immediately instead
// of silently falling through to the positional-appName branch below (the bug this replaces:
// `--framework jquery` used to leave `framework` unset AND get re-read as the app name).
function requireEnumValue<TValue extends string>(
  flag: string,
  rawValue: string | undefined,
  isValid: (value: string) => value is TValue,
  validValues: readonly string[],
): TValue {
  if (rawValue === undefined || rawValue.startsWith('--')) {
    throw new CliUsageError(
      `"${flag}" needs a value. Valid values: ${validValues.join(', ')}.`,
    );
  }
  if (!isValid(rawValue)) {
    throw new CliUsageError(
      `"${flag} ${rawValue}" is invalid. Valid values: ${validValues.join(', ')}.`,
    );
  }
  return rawValue;
}

// Hand-rolled, no argv-parsing dependency — mirrors create-vue's own zero-runtime-deps CLI
// (see build.config.ts / package.json devDependencies for the full precedent).
export function parseArgv(argv: readonly string[]): IParsedCommand {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    return { kind: 'help' };
  }
  if (command === '--version' || command === '-v') {
    return { kind: 'version' };
  }
  if (command !== 'new' && command !== 'add') {
    throw usageErrorFor('command', command, ['new', 'add']);
  }

  let appName: string | undefined;
  let framework: IFramework | undefined;
  let vueFlavor: IVueFlavor | undefined;
  let isJavascript = false;
  let hasForce = false;
  let bundleId: string | undefined;
  let hasExpoModules = false;
  let hasNavigation = false;
  let hasTesting = false;
  let hasSplashScreen = false;
  let hasSlider = false;
  const expoPackages = new Set<IExpoPackageLayerName>();
  let styling: IStylingOption | undefined;
  let packageManager: IPackageManager | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const { name: token, inlineValue } = splitInlineFlag(rest[index]);

    if (token === '--javascript') {
      assertNoInlineValue(token, inlineValue);
      isJavascript = true;
      continue;
    }

    if (token === '--force') {
      assertNoInlineValue(token, inlineValue);
      hasForce = true;
      continue;
    }

    if (token === '--expo-modules') {
      assertNoInlineValue(token, inlineValue);
      hasExpoModules = true;
      continue;
    }

    if (token === '--navigation') {
      assertNoInlineValue(token, inlineValue);
      hasNavigation = true;
      continue;
    }

    if (token === '--testing') {
      assertNoInlineValue(token, inlineValue);
      hasTesting = true;
      continue;
    }

    if (token === '--splash-screen') {
      assertNoInlineValue(token, inlineValue);
      hasSplashScreen = true;
      continue;
    }

    if (token === '--slider') {
      assertNoInlineValue(token, inlineValue);
      hasSlider = true;
      continue;
    }

    // One `--<id>` flag per EXPO_PACKAGE_LAYERS entry, generically — the alternative is a
    // hand-written `if` per package, 21 times over, for a flag that only ever sets a boolean.
    const expoPackageId = token.startsWith('--') ? token.slice(2) : '';
    if (isExpoPackageLayerName(expoPackageId)) {
      assertNoInlineValue(token, inlineValue);
      expoPackages.add(expoPackageId);
      continue;
    }

    if (token === '--framework') {
      const rawValue = inlineValue ?? rest[index + 1];
      framework = requireEnumValue(token, rawValue, isFramework, [
        ...FRAMEWORKS,
      ]);
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (token === '--bundle-id') {
      const value = inlineValue ?? rest[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliUsageError(
          `"${token}" needs a value, e.g. "com.example.app".`,
        );
      }
      bundleId = value;
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (token === '--styling') {
      const rawValue = inlineValue ?? rest[index + 1];
      styling = requireEnumValue(token, rawValue, isStylingOption, [
        ...STYLING_OPTIONS,
      ]);
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (token === '--vue-flavor') {
      const rawValue = inlineValue ?? rest[index + 1];
      vueFlavor = requireEnumValue(token, rawValue, isVueFlavor, [
        ...VUE_FLAVORS,
      ]);
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (token === '--pm') {
      const rawValue = inlineValue ?? rest[index + 1];
      packageManager = requireEnumValue(token, rawValue, isPackageManager, [
        ...PACKAGE_MANAGERS,
      ]);
      if (inlineValue === undefined) index += 1;
      continue;
    }

    if (token.startsWith('--')) {
      throw usageErrorFor('flag', token, KNOWN_FLAGS);
    }

    if (command === 'add') {
      throw new CliUsageError(
        `"add" doesn't take a positional argument — got "${token}".`,
      );
    }

    if (appName === undefined) {
      appName = token;
      continue;
    }

    throw new CliUsageError(
      `Unexpected argument "${token}" — "new" takes one app name.`,
    );
  }

  if (command === 'new') {
    return {
      kind: 'new',
      appName,
      framework,
      vueFlavor,
      isJavascript,
      hasForce,
      bundleId,
      hasExpoModules,
      hasNavigation,
      hasTesting,
      hasSplashScreen,
      hasSlider,
      expoPackages,
      styling,
      packageManager,
    };
  }

  return {
    kind: 'add',
    framework,
    vueFlavor,
    hasExpoModules,
    hasNavigation,
    hasTesting,
    hasSplashScreen,
    hasSlider,
    expoPackages,
    hasForce,
    packageManager,
  };
}
