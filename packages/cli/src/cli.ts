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

export const COMMAND_NEW = 'new';
export const COMMAND_ADD = 'add';
export const COMMAND_GRANT = 'grant';

export type IParsedCommand =
  | { readonly kind: 'help' }
  | { readonly kind: 'version' }
  | {
      readonly kind: typeof COMMAND_NEW;
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
      readonly hasReanimated: boolean;
      readonly expoPackages: ReadonlySet<IExpoPackageLayerName>;
      readonly styling: IStylingOption | undefined;
      readonly packageManager: IPackageManager | undefined;
    }
  | {
      readonly kind: typeof COMMAND_ADD;
      readonly framework: IFramework | undefined;
      readonly vueFlavor: IVueFlavor | undefined;
      readonly hasExpoModules: boolean;
      readonly hasNavigation: boolean;
      readonly hasTesting: boolean;
      readonly hasSplashScreen: boolean;
      readonly hasSlider: boolean;
      readonly hasReanimated: boolean;
      readonly expoPackages: ReadonlySet<IExpoPackageLayerName>;
      readonly hasForce: boolean;
      readonly packageManager: IPackageManager | undefined;
    }
  | {
      readonly kind: typeof COMMAND_GRANT;
      // Free-form: which packages offer a bundle is read from the app's node_modules at run time
      // See `discoverOptionalBundles` in grant.ts
      readonly layer: string | undefined;
    };

type IScaffoldCommand = typeof COMMAND_NEW | typeof COMMAND_ADD;

const FRAMEWORK_LIST = [
  'react',
  'vue',
  'angular',
  'solid',
  'svelte',
] as const satisfies readonly IFramework[];
const VUE_FLAVOR_LIST = ['tsx', 'sfc'] as const satisfies readonly IVueFlavor[];
const PACKAGE_MANAGER_LIST = [
  'npm',
  'pnpm',
  'yarn',
] as const satisfies readonly IPackageManager[];
const STYLING_LIST = [
  'css',
  'scss',
  'less',
  'stylus',
  'css-modules',
  'stylesheet',
] as const satisfies readonly IStylingOption[];

// Typed as sets of `string`, so a membership check takes a plain string and the guards below do
// the narrowing with no `as` cast
const FRAMEWORKS: ReadonlySet<string> = new Set(FRAMEWORK_LIST);
const VUE_FLAVORS: ReadonlySet<string> = new Set(VUE_FLAVOR_LIST);
const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(PACKAGE_MANAGER_LIST);
const STYLING_OPTIONS: ReadonlySet<string> = new Set(STYLING_LIST);

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

function isScaffoldCommand(value: string): value is IScaffoldCommand {
  return value === COMMAND_NEW || value === COMMAND_ADD;
}

type IParseState = {
  appName: string | undefined;
  framework: IFramework | undefined;
  vueFlavor: IVueFlavor | undefined;
  bundleId: string | undefined;
  styling: IStylingOption | undefined;
  packageManager: IPackageManager | undefined;
  isJavascript: boolean;
  hasForce: boolean;
  hasExpoModules: boolean;
  hasNavigation: boolean;
  hasTesting: boolean;
  hasSplashScreen: boolean;
  hasSlider: boolean;
  hasReanimated: boolean;
  expoPackages: Set<IExpoPackageLayerName>;
};

function createParseState(): IParseState {
  return {
    appName: undefined,
    framework: undefined,
    vueFlavor: undefined,
    bundleId: undefined,
    styling: undefined,
    packageManager: undefined,
    isJavascript: false,
    hasForce: false,
    hasExpoModules: false,
    hasNavigation: false,
    hasTesting: false,
    hasSplashScreen: false,
    hasSlider: false,
    hasReanimated: false,
    expoPackages: new Set(),
  };
}

// A flag that only switches something on, one setter per flag
const BOOLEAN_FLAGS = new Map<string, (state: IParseState) => void>([
  ['--javascript', state => void (state.isJavascript = true)],
  ['--force', state => void (state.hasForce = true)],
  ['--expo-modules', state => void (state.hasExpoModules = true)],
  ['--navigation', state => void (state.hasNavigation = true)],
  ['--testing', state => void (state.hasTesting = true)],
  ['--splash-screen', state => void (state.hasSplashScreen = true)],
  ['--slider', state => void (state.hasSlider = true)],
  ['--reanimated', state => void (state.hasReanimated = true)],
]);

// `--framework react` and `--framework=react` both land here with the raw value, so a missing
// or invalid value errors at once instead of the next token being read as the app name
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

function requireBundleId(flag: string, rawValue: string | undefined): string {
  if (rawValue === undefined || rawValue.startsWith('--')) {
    throw new CliUsageError(`"${flag}" needs a value, e.g. "com.example.app".`);
  }
  return rawValue;
}

type IValueSetter = (
  state: IParseState,
  flag: string,
  rawValue: string | undefined,
) => void;

// A flag that takes a value, one setter per flag
const VALUE_FLAGS = new Map<string, IValueSetter>([
  [
    '--framework',
    (state, flag, raw) => {
      state.framework = requireEnumValue(
        flag,
        raw,
        isFramework,
        FRAMEWORK_LIST,
      );
    },
  ],
  [
    '--bundle-id',
    (state, flag, raw) => {
      state.bundleId = requireBundleId(flag, raw);
    },
  ],
  [
    '--styling',
    (state, flag, raw) => {
      state.styling = requireEnumValue(
        flag,
        raw,
        isStylingOption,
        STYLING_LIST,
      );
    },
  ],
  [
    '--vue-flavor',
    (state, flag, raw) => {
      state.vueFlavor = requireEnumValue(
        flag,
        raw,
        isVueFlavor,
        VUE_FLAVOR_LIST,
      );
    },
  ],
  [
    '--pm',
    (state, flag, raw) => {
      state.packageManager = requireEnumValue(
        flag,
        raw,
        isPackageManager,
        PACKAGE_MANAGER_LIST,
      );
    },
  ],
]);

const KNOWN_FLAGS = [
  ...BOOLEAN_FLAGS.keys(),
  ...VALUE_FLAGS.keys(),
  ...EXPO_PACKAGE_LAYERS.map(layer => `--${layer.id}`),
];

// `--framework=react` (git and npm's own convention) next to `--framework react`
// Only the first `=` splits, so a value that holds one, like a `--bundle-id`, survives
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
  const hint = suggestion ? ` — did you mean "${suggestion}"?` : '.';
  return new CliUsageError(
    `Unknown ${kind} "${input}"${hint} Run "@symbiote-native/cli --help" for usage.`,
  );
}

function applyPositional(
  state: IParseState,
  command: IScaffoldCommand,
  token: string,
): void {
  if (token.startsWith('--')) throw usageErrorFor('flag', token, KNOWN_FLAGS);
  if (command === COMMAND_ADD) {
    throw new CliUsageError(
      `"add" doesn't take a positional argument — got "${token}".`,
    );
  }
  if (state.appName !== undefined) {
    throw new CliUsageError(
      `Unexpected argument "${token}" — "new" takes one app name.`,
    );
  }
  state.appName = token;
}

type IToken = {
  readonly token: string;
  readonly inlineValue: string | undefined;
  readonly nextToken: string | undefined;
};

// True when the flag took the NEXT token as its value
function applyToken(
  state: IParseState,
  command: IScaffoldCommand,
  { token, inlineValue, nextToken }: IToken,
): boolean {
  const setBoolean = BOOLEAN_FLAGS.get(token);
  if (setBoolean) {
    assertNoInlineValue(token, inlineValue);
    setBoolean(state);
    return false;
  }
  // One `--<id>` flag per EXPO_PACKAGE_LAYERS entry, found by id, not written out per package
  const expoPackageId = token.startsWith('--') ? token.slice(2) : '';
  if (isExpoPackageLayerName(expoPackageId)) {
    assertNoInlineValue(token, inlineValue);
    state.expoPackages.add(expoPackageId);
    return false;
  }
  const setValue = VALUE_FLAGS.get(token);
  if (setValue) {
    setValue(state, token, inlineValue ?? nextToken);
    return inlineValue === undefined;
  }
  applyPositional(state, command, token);
  return false;
}

function parseFlags(
  command: IScaffoldCommand,
  tokens: readonly string[],
): IParseState {
  const state = createParseState();
  for (let index = 0; index < tokens.length; index += 1) {
    const { name, inlineValue } = splitInlineFlag(tokens[index]);
    const tookNext = applyToken(state, command, {
      token: name,
      inlineValue,
      nextToken: tokens[index + 1],
    });
    if (tookNext) index += 1;
  }
  return state;
}

function parseGrant(rest: readonly string[]): IParsedCommand {
  const [layer, ...extra] = rest;
  if (extra.length > 0) {
    throw new CliUsageError(
      `"grant" takes at most one layer — got "${layer}" and "${extra[0]}".`,
    );
  }
  return { kind: COMMAND_GRANT, layer };
}

// What `new` and `add` both read: the framework choice and every layer switch
function layerFields(state: IParseState) {
  return {
    framework: state.framework,
    vueFlavor: state.vueFlavor,
    hasForce: state.hasForce,
    hasExpoModules: state.hasExpoModules,
    hasNavigation: state.hasNavigation,
    hasTesting: state.hasTesting,
    hasSplashScreen: state.hasSplashScreen,
    hasSlider: state.hasSlider,
    hasReanimated: state.hasReanimated,
    expoPackages: state.expoPackages,
    packageManager: state.packageManager,
  };
}

function toNewCommand(state: IParseState): IParsedCommand {
  return {
    kind: COMMAND_NEW,
    ...layerFields(state),
    appName: state.appName,
    isJavascript: state.isJavascript,
    bundleId: state.bundleId,
    styling: state.styling,
  };
}

function toAddCommand(state: IParseState): IParsedCommand {
  return { kind: COMMAND_ADD, ...layerFields(state) };
}

// Hand-rolled, no argv-parsing dependency, like create-vue's own zero-runtime-deps CLI
export function parseArgv(argv: readonly string[]): IParsedCommand {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    return { kind: 'help' };
  }
  if (command === '--version' || command === '-v') {
    return { kind: 'version' };
  }
  if (command === COMMAND_GRANT) return parseGrant(rest);
  if (!isScaffoldCommand(command)) {
    throw usageErrorFor('command', command, [
      COMMAND_NEW,
      COMMAND_ADD,
      COMMAND_GRANT,
    ]);
  }

  const state = parseFlags(command, rest);
  return command === COMMAND_NEW ? toNewCommand(state) : toAddCommand(state);
}
