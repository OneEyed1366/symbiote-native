import * as clack from '@clack/prompts';
import { detectPackageManagerFromUserAgent } from './detect-package-manager.js';
import {
  EXPO_PACKAGE_LAYERS,
  isExpoPackageLayerName,
  type IExpoPackageLayerName,
} from './expo-package-layers.js';
import type {
  IAddLayerName,
  IFramework,
  IPackageManager,
  IStylingOption,
  IVueFlavor,
} from './types.js';
import { CliUsageError } from './errors.js';
import { defaultBundleId, isValidBundleId } from './utils/native-identity.js';

// clack resolves a cancelled prompt (Ctrl+C) to its own sentinel symbol rather than
// rejecting — an assertion function lets every call site below narrow away that symbol
// without an `as` cast, unlike a plain boolean-returning "exitOnCancel(answer)" helper,
// whose narrowing can't cross the function boundary back to the caller's `answer`.
function assertNotCancelled<TValue>(
  answer: TValue | symbol,
): asserts answer is TValue {
  if (clack.isCancel(answer)) {
    clack.cancel('Cancelled.');
    process.exit(1);
  }
}

// Piped stdin (CI, a Docker build, `... | npx @symbiote-native/cli new`) is not a real terminal —
// a clack prompt reading from it just hangs forever instead of erroring, since nothing ever
// answers. Every resolver below checks this before it would otherwise prompt, and either falls
// back to its documented default or fails fast naming the flag that would have skipped the ask.
function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

export async function resolveAppName(
  appName: string | undefined,
): Promise<string> {
  if (appName !== undefined) return appName;
  if (!isInteractive()) {
    throw new CliUsageError(
      'No app name given and not running in an interactive terminal — pass it as the first argument, e.g. "new my-app".',
    );
  }

  const answer = await clack.text({
    message: 'App name?',
    placeholder: 'my-app',
  });
  assertNotCancelled(answer);
  return answer;
}

export async function resolveFramework(
  framework: IFramework | undefined,
): Promise<IFramework> {
  if (framework !== undefined) return framework;
  if (!isInteractive()) {
    throw new CliUsageError(
      'No --framework given and not running in an interactive terminal — pass --framework react|vue|angular|solid|svelte.',
    );
  }

  const answer = await clack.select({
    message: 'Which framework?',
    options: [
      { value: 'react', label: 'React' },
      { value: 'vue', label: 'Vue' },
      { value: 'angular', label: 'Angular' },
      { value: 'solid', label: 'Solid' },
      { value: 'svelte', label: 'Svelte' },
    ],
  });
  assertNotCancelled(answer);
  return answer;
}

export async function resolveVueFlavor(
  vueFlavor: IVueFlavor | undefined,
): Promise<IVueFlavor> {
  if (vueFlavor !== undefined) return vueFlavor;
  if (!isInteractive()) {
    throw new CliUsageError(
      'No --vue-flavor given and not running in an interactive terminal — pass --vue-flavor tsx|sfc.',
    );
  }

  const answer = await clack.select({
    message: 'Vue: TSX or SFC (.vue) components?',
    options: [
      { value: 'sfc', label: 'SFC (.vue single-file components)' },
      { value: 'tsx', label: 'TSX (JSX-flavored, no .vue files)' },
    ],
  });
  assertNotCancelled(answer);
  return answer;
}

export async function resolveBundleId(
  bundleId: string | undefined,
  nativeAppName: string,
): Promise<string> {
  if (bundleId !== undefined) {
    if (!isValidBundleId(bundleId)) {
      throw new Error(
        `Invalid --bundle-id "${bundleId}": reverse-DNS only (letters, digits, underscores, dots) — e.g. "com.example.app".`,
      );
    }
    return bundleId;
  }
  const computedDefault = defaultBundleId(nativeAppName);
  if (!isInteractive()) return computedDefault;

  const answer = await clack.text({
    message: 'Bundle identifier (iOS + Android)?',
    initialValue: computedDefault,
    validate: value =>
      isValidBundleId(value ?? '')
        ? undefined
        : 'Reverse-DNS only: letters, digits, underscores, dots — e.g. "com.example.app".',
  });
  assertNotCancelled(answer);
  return answer;
}

export async function resolveOverwrite(
  targetDir: string,
  force: boolean,
): Promise<boolean> {
  if (force) return true;
  if (!isInteractive()) {
    throw new CliUsageError(
      `"${targetDir}" already exists and is not empty, and not running in an interactive ` +
        'terminal — pass --force to overwrite it, or scaffold into an empty directory.',
    );
  }

  const answer = await clack.confirm({
    message: `"${targetDir}" already exists and is not empty. Empty it and continue?`,
    initialValue: false,
  });
  assertNotCancelled(answer);
  return answer;
}

export async function resolveExpoModules(
  hasExpoModules: boolean,
): Promise<boolean> {
  if (hasExpoModules) return true;
  if (!isInteractive()) return false;

  const answer = await clack.confirm({
    message:
      'Add Expo-modules autolinking (@symbiote-native/expo-modules-link)?',
    initialValue: false,
  });
  assertNotCancelled(answer);
  return answer;
}

export async function resolveStyling(
  styling: IStylingOption | undefined,
): Promise<IStylingOption> {
  if (styling !== undefined) return styling;
  if (!isInteractive()) return 'css';

  const answer = await clack.select<IStylingOption>({
    message: 'How should the app style itself?',
    options: [
      { value: 'css', label: 'CSS classes', hint: 'plain .css, recommended' },
      {
        value: 'css-modules',
        label: 'CSS Modules',
        hint: 'scoped .module.css classes',
      },
      { value: 'scss', label: 'SCSS' },
      { value: 'less', label: 'LESS' },
      { value: 'stylus', label: 'Stylus' },
      {
        value: 'stylesheet',
        label: 'StyleSheet.create',
        hint: 'JS style objects',
      },
    ],
    initialValue: 'css',
  });
  assertNotCancelled(answer);
  return answer;
}

// Single checkbox section instead of four back-to-back yes/no prompts — a developer picks
// everything at once instead of clicking through a step per boolean flag.
export type IFeatureFlags = {
  hasTypescript: boolean;
  hasNavigation: boolean;
  hasExpoModules: boolean;
  hasTesting: boolean;
  hasSplashScreen: boolean;
  hasSlider: boolean;
  expoPackages: ReadonlySet<IExpoPackageLayerName>;
};

export async function resolveFeatures(
  framework: IFramework,
  flags: {
    isJavascript: boolean;
    hasNavigation: boolean;
    hasExpoModules: boolean;
    hasTesting: boolean;
    hasSplashScreen: boolean;
    hasSlider: boolean;
    expoPackages: ReadonlySet<IExpoPackageLayerName>;
  },
): Promise<IFeatureFlags> {
  // Angular's AOT pipeline (ngtsc) compiles templates as a TypeScript-compiler extension —
  // there is no plain-JS mode for it. Every other framework's compiler accepts untyped JS fine.
  // An explicit, contradicted --javascript errors rather than silently losing to the forced
  // default — the alternative is the flag vanishing with no feedback at all.
  if (framework === 'angular' && flags.isJavascript) {
    throw new CliUsageError(
      '--framework angular requires TypeScript — drop --javascript.',
    );
  }
  const typescriptForced =
    framework === 'angular' ? true : flags.isJavascript ? false : undefined;

  const options = [
    ...(typescriptForced === undefined
      ? [{ value: 'typescript' as const, label: 'TypeScript' }]
      : []),
    ...(flags.hasNavigation
      ? []
      : [
          {
            value: 'navigation' as const,
            label: 'Navigation',
            hint: '@symbiote-native/navigation',
          },
        ]),
    ...(flags.hasExpoModules
      ? []
      : [
          {
            value: 'expo-modules' as const,
            label: 'Expo-modules autolinking',
            hint: '@symbiote-native/expo-modules-link',
          },
        ]),
    ...(flags.hasTesting
      ? []
      : [{ value: 'testing' as const, label: 'E2E testing', hint: 'Detox' }]),
    ...(flags.hasSplashScreen
      ? []
      : [
          {
            value: 'splash-screen' as const,
            label: 'Splash screen',
            hint: '@symbiote-native/splash-screen',
          },
        ]),
    ...(flags.hasSlider
      ? []
      : [
          {
            value: 'slider' as const,
            label: 'Slider',
            hint: '@symbiote-native/slider',
          },
        ]),
    ...EXPO_PACKAGE_LAYERS.filter(
      layer => !flags.expoPackages.has(layer.id),
    ).map(layer => ({
      value: layer.id,
      label: layer.label,
      hint: layer.symbiotePackage,
    })),
  ];

  if (options.length === 0 || !isInteractive()) {
    return {
      hasTypescript: typescriptForced ?? true,
      hasNavigation: flags.hasNavigation,
      // Picking any Expo-backed package implies the autolinking wiring it needs — no separate
      // "Expo-modules autolinking" tick required (see resolveExpoModules's own prompt, still
      // offered on its own for a third-party Expo package this CLI doesn't wrap).
      hasExpoModules: flags.hasExpoModules || flags.expoPackages.size > 0,
      hasTesting: flags.hasTesting,
      hasSplashScreen: flags.hasSplashScreen,
      hasSlider: flags.hasSlider,
      expoPackages: flags.expoPackages,
    };
  }

  const answer = await clack.multiselect({
    message: 'Which features?',
    options,
    initialValues:
      typescriptForced === undefined ? (['typescript'] as const) : [],
    required: false,
  });
  assertNotCancelled(answer);

  const selected = new Set<string>(answer);
  const expoPackages = new Set<IExpoPackageLayerName>([
    ...flags.expoPackages,
    ...EXPO_PACKAGE_LAYERS.filter(layer => selected.has(layer.id)).map(
      layer => layer.id,
    ),
  ]);
  return {
    hasTypescript: typescriptForced ?? selected.has('typescript'),
    hasNavigation: flags.hasNavigation || selected.has('navigation'),
    hasExpoModules:
      flags.hasExpoModules ||
      selected.has('expo-modules') ||
      expoPackages.size > 0,
    hasTesting: flags.hasTesting || selected.has('testing'),
    hasSplashScreen: flags.hasSplashScreen || selected.has('splash-screen'),
    hasSlider: flags.hasSlider || selected.has('slider'),
    expoPackages,
  };
}

// A safe-by-default confirm, not resolveOverwrite's fail-fast shape: skipping an already-present
// testing layer file is harmless (nothing was requested that didn't already exist), so a
// non-interactive "add" degrades to "do nothing" instead of erroring.
export async function resolveAddOverwrite(
  hasForce: boolean,
  message: string,
): Promise<boolean> {
  if (hasForce) return true;
  if (!isInteractive()) return false;

  const answer = await clack.confirm({ message, initialValue: false });
  assertNotCancelled(answer);
  return answer;
}

export type IAddLayerFlags = {
  hasExpoModules: boolean;
  hasNavigation: boolean;
  hasTesting: boolean;
  hasSlider: boolean;
  hasSplashScreen: boolean;
  // Optional (default: none) so every existing call site that only knows the 5 hand-named layers
  // keeps compiling — most callers never touch an Expo-backed package at all.
  expoPackages?: ReadonlySet<IExpoPackageLayerName>;
};

// `satisfies`, not a type annotation: clack's `Option<Value>` is a conditional type that
// DISTRIBUTES over a union `Value`, so each array element must keep its own literal `value` type
// (`'navigation'`, not the widened `IAddLayerName`) for `clack.multiselect<IAddLayerName>` below
// to structurally match it — an explicit `ReadonlyArray<{ value: IAddLayerName; … }>` annotation
// widens every element's `value` and breaks that match.
const ADD_LAYER_OPTIONS = [
  {
    value: 'navigation',
    label: 'Navigation',
    hint: '@symbiote-native/navigation',
  },
  {
    value: 'expo-modules',
    label: 'Expo-modules autolinking',
    hint: '@symbiote-native/expo-modules-link',
  },
  { value: 'testing', label: 'E2E testing', hint: 'Detox' },
  {
    value: 'splash-screen',
    label: 'Splash screen',
    hint: '@symbiote-native/splash-screen',
  },
  { value: 'slider', label: 'Slider', hint: '@symbiote-native/slider' },
  ...EXPO_PACKAGE_LAYERS.map(layer => ({
    value: layer.id,
    label: layer.label,
    hint: layer.symbiotePackage,
  })),
] as const satisfies ReadonlyArray<{
  readonly value: IAddLayerName;
  readonly label: string;
  readonly hint: string;
}>;

export function explicitLayersFromFlags(
  flags: IAddLayerFlags,
): IAddLayerName[] {
  const explicit: IAddLayerName[] = [];
  if (flags.hasNavigation) explicit.push('navigation');
  if (flags.hasExpoModules) explicit.push('expo-modules');
  if (flags.hasTesting) explicit.push('testing');
  if (flags.hasSplashScreen) explicit.push('splash-screen');
  if (flags.hasSlider) explicit.push('slider');
  explicit.push(...(flags.expoPackages ?? []));
  return explicit;
}

// Every layer stays listed — an already-added one is disabled (clack greys it out) rather than
// filtered out, so the menu doesn't shrink for no visible reason.
//
// Grouped, not flat, so 26 options have landmarks to scroll by: the 21 Expo packages alone
// outnumber the rest, so finding "Navigation" used to mean reading past all of them.
// groupMultiselect returns Value[], same as multiselect — nothing downstream needs to change.
//
// No return-type annotation: clack's `Option<Value>` distributes over `Value`, so an annotated
// (hence widened) return type stops matching it once `IAddLayerName` has 26 members — same trap
// `ADD_LAYER_OPTIONS`'s own comment documents. Left inferred, matching `resolveFeatures`'s own
// inline array.
export function buildAddLayerOptions(alreadyAdded: ReadonlySet<IAddLayerName>) {
  const withDisabledState = ADD_LAYER_OPTIONS.map(option => {
    const isAlreadyAdded = alreadyAdded.has(option.value);
    return {
      ...option,
      hint: isAlreadyAdded ? 'already added' : option.hint,
      disabled: isAlreadyAdded,
    };
  });
  return {
    'Core layers': withDisabledState.filter(
      option => !isExpoPackageLayerName(option.value),
    ),
    'Expo packages': withDisabledState.filter(option =>
      isExpoPackageLayerName(option.value),
    ),
  };
}

// A selected Expo-package layer implies the `expo-modules` autolinking layer it needs — the
// developer never has to ALSO tick "Expo-modules autolinking" by hand. Safe to always append
// (never gated on `alreadyAdded`): applying it twice is an idempotent text-splice, same as every
// other expo-modules util already documents.
function withImpliedExpoModules(
  layers: readonly IAddLayerName[],
): IAddLayerName[] {
  const needsExpoModules = layers.some(layer => isExpoPackageLayerName(layer));
  return needsExpoModules && !layers.includes('expo-modules')
    ? [...layers, 'expo-modules']
    : [...layers];
}

// Without `hasForce`, an already-added layer is dropped rather than re-applied — re-rendering
// App/MenuScreen/DetailsScreen would wipe out whatever the developer built on top since `new`
// (real-world case, 2026-09-18: a blanket `add --navigation --expo-modules --testing
// --splash-screen --slider` meant to backfill missing layers also re-applied navigation, which
// was already there). Shared between BOTH resolveAddLayers paths: `buildAddLayerOptions` marks
// an already-added option `disabled`, but clack's `groupMultiselect` (unlike plain `multiselect`)
// never actually enforces `disabled` — its render path checks it for styling only, so the option
// can still be checked and returned. This filter is what actually stops it, not the disabled flag.
export function dropAlreadyAdded(
  layers: readonly IAddLayerName[],
  alreadyAdded: ReadonlySet<IAddLayerName>,
  hasForce: boolean,
): IAddLayerName[] {
  return hasForce
    ? [...layers]
    : layers.filter(layer => !alreadyAdded.has(layer));
}

// Explicit flags win outright (same "flags mean it, prompts fill gaps" contract as every other
// resolver here). With no explicit flags, offers a grouped prompt of EVERY layer — an
// already-added one stays visible but `disabled` with an "already added" hint
// (`buildAddLayerOptions`) instead of vanishing from the list. Only skips the prompt outright
// when every single layer is already present.
export async function resolveAddLayers(
  flags: IAddLayerFlags,
  alreadyAdded: ReadonlySet<IAddLayerName>,
  hasForce = false,
): Promise<readonly IAddLayerName[]> {
  const explicit = explicitLayersFromFlags(flags);
  if (explicit.length > 0) {
    return withImpliedExpoModules(
      dropAlreadyAdded(explicit, alreadyAdded, hasForce),
    );
  }

  if (ADD_LAYER_OPTIONS.every(option => alreadyAdded.has(option.value)))
    return [];

  if (!isInteractive()) {
    throw new CliUsageError(
      'No layer flags given and not running in an interactive terminal — pass at least one of ' +
        '--navigation/--expo-modules/--testing/--splash-screen/--slider, or an Expo-package flag ' +
        'such as --battery/--sensors.',
    );
  }

  const answer = await clack.groupMultiselect({
    message: 'Which features to add?',
    options: buildAddLayerOptions(alreadyAdded),
    required: false,
  });
  assertNotCancelled(answer);
  return withImpliedExpoModules(
    dropAlreadyAdded(answer, alreadyAdded, hasForce),
  );
}

export async function resolvePackageManager(
  packageManager: IPackageManager | undefined,
): Promise<IPackageManager> {
  const detected = packageManager ?? detectPackageManagerFromUserAgent();
  if (detected !== undefined) return detected;
  if (!isInteractive()) return 'npm';

  const answer = await clack.select({
    message: 'Which package manager?',
    options: [
      { value: 'npm', label: 'npm' },
      { value: 'pnpm', label: 'pnpm' },
      { value: 'yarn', label: 'yarn' },
    ],
  });
  assertNotCancelled(answer);
  return answer;
}
