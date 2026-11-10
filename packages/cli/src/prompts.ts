import * as clack from '@clack/prompts';
import { detectPackageManagerFromUserAgent } from './detect-package-manager.js';
import { CORE_LAYERS } from './core-layers.js';
import {
  EXPO_PACKAGE_LAYERS,
  type IExpoPackageLayerName,
} from './expo-package-layers.js';
import type { IDiscoveredBundle } from './grant-bundles.js';
import { assertNotCancelled, isInteractive } from './prompt-helpers.js';
import {
  ANGULAR_FRAMEWORK,
  type IFramework,
  type IPackageManager,
  type IStylingOption,
  type IVueFlavor,
} from './types.js';
import { CliUsageError } from './errors.js';
import { defaultBundleId, isValidBundleId } from './utils/native-identity.js';

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

// Only asked when `new` finds no `.git` directory already, see `runNew`
// There is no flag to short-circuit it, as the prompt itself is the whole feature
export async function resolveGitInit(): Promise<boolean> {
  if (!isInteractive()) return false;

  const answer = await clack.confirm({
    message: 'Initialize a git repository?',
    initialValue: true,
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

// One checkbox section instead of a yes/no prompt per flag, so everything is picked at once
export type IFeatureFlags = {
  hasTypescript: boolean;
  hasNavigation: boolean;
  hasExpoModules: boolean;
  hasTesting: boolean;
  hasSplashScreen: boolean;
  hasSlider: boolean;
  hasReanimated: boolean;
  expoPackages: ReadonlySet<IExpoPackageLayerName>;
};

type IFeatureInput = Omit<IFeatureFlags, 'hasTypescript'> & {
  isJavascript: boolean;
};

const TYPESCRIPT_FEATURE = 'typescript';

// Angular's AOT pipeline (ngtsc) is a TypeScript-compiler extension, so it has no plain-JS mode
// An explicit `--javascript` against it errors, as it would otherwise vanish without feedback
function forcedTypescript(
  framework: IFramework,
  isJavascript: boolean,
): boolean | undefined {
  if (framework === ANGULAR_FRAMEWORK) {
    if (isJavascript) {
      throw new CliUsageError(
        '--framework angular requires TypeScript — drop --javascript.',
      );
    }
    return true;
  }
  return isJavascript ? false : undefined;
}

// Whatever a flag already switched on is left out of the prompt
function featureOptions(flags: IFeatureInput, hasTypescriptChoice: boolean) {
  return [
    ...(hasTypescriptChoice
      ? [{ value: TYPESCRIPT_FEATURE, label: 'TypeScript' }]
      : []),
    ...CORE_LAYERS.filter(layer => !flags[layer.flag]),
    ...EXPO_PACKAGE_LAYERS.filter(
      layer => !flags.expoPackages.has(layer.id),
    ).map(layer => ({
      value: layer.id,
      label: layer.label,
      hint: layer.symbiotePackage,
    })),
  ];
}

// Picking any Expo-backed package implies the autolinking it needs, with no separate tick
function featuresFrom(
  flags: IFeatureInput,
  typescriptForced: boolean | undefined,
  selected: ReadonlySet<string>,
): IFeatureFlags {
  const expoPackages = new Set<IExpoPackageLayerName>([
    ...flags.expoPackages,
    ...EXPO_PACKAGE_LAYERS.filter(layer => selected.has(layer.id)).map(
      layer => layer.id,
    ),
  ]);
  return {
    hasTypescript: typescriptForced ?? selected.has(TYPESCRIPT_FEATURE),
    hasNavigation: flags.hasNavigation || selected.has('navigation'),
    hasExpoModules:
      flags.hasExpoModules ||
      selected.has('expo-modules') ||
      expoPackages.size > 0,
    hasTesting: flags.hasTesting || selected.has('testing'),
    hasSplashScreen: flags.hasSplashScreen || selected.has('splash-screen'),
    hasSlider: flags.hasSlider || selected.has('slider'),
    hasReanimated: flags.hasReanimated || selected.has('reanimated'),
    expoPackages,
  };
}

export async function resolveFeatures(
  framework: IFramework,
  flags: IFeatureInput,
): Promise<IFeatureFlags> {
  const typescriptForced = forcedTypescript(framework, flags.isJavascript);
  const options = featureOptions(flags, typescriptForced === undefined);

  // No prompt: TypeScript on, and nothing beyond what the flags asked for
  if (options.length === 0 || !isInteractive()) {
    return featuresFrom(flags, typescriptForced, new Set([TYPESCRIPT_FEATURE]));
  }

  // The explicit `<string>` is needed, as clack's `Option<Value>` distributes over `Value`
  // With a union this large TS stops matching the registry-derived options against it
  const answer = await clack.multiselect<string>({
    message: 'Which features?',
    options,
    initialValues: typescriptForced === undefined ? [TYPESCRIPT_FEATURE] : [],
    required: false,
  });
  assertNotCancelled(answer);
  return featuresFrom(flags, typescriptForced, new Set(answer));
}

// Granting a bundle requests a permission that triggers a Play Console review
// That has no safe default, unlike the "css" fallback, so a piped stdin fails fast
export async function resolveGrantSelection(
  candidates: readonly IDiscoveredBundle[],
): Promise<IDiscoveredBundle[]> {
  if (!isInteractive()) {
    throw new CliUsageError(
      'Not running in an interactive terminal — "grant" needs a real choice for each ' +
        'policy-sensitive bundle, so it cannot run non-interactively.',
    );
  }

  const answer = await clack.multiselect<string>({
    message: 'Which policy-sensitive capabilities should this app request?',
    options: candidates.map((entry, index) => ({
      value: String(index),
      label: entry.bundle.label,
      hint: entry.packageName,
    })),
    required: false,
  });
  assertNotCancelled(answer);

  const selectedIndexes = new Set(answer);
  return candidates.filter((_entry, index) =>
    selectedIndexes.has(String(index)),
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
