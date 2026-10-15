import { describe, expect, it } from 'vitest';
import { CliUsageError } from './errors.js';
import type { IExpoPackageLayerName } from './expo-package-layers.js';
import type { IDiscoveredBundle } from './grant-bundles.js';
import { useNonInteractiveTerminal } from './non-interactive-terminal.test-helper.js';
import {
  resolveAppName,
  resolveBundleId,
  resolveFeatures,
  resolveFramework,
  resolveGitInit,
  resolveGrantSelection,
  resolveOverwrite,
  resolvePackageManager,
  resolveStyling,
  resolveVueFlavor,
} from './prompts.js';
import { defaultBundleId } from './utils/native-identity.js';

const NO_FEATURES = {
  isJavascript: false,
  hasNavigation: false,
  hasExpoModules: false,
  hasTesting: false,
  hasSplashScreen: false,
  hasSlider: false,
  hasReanimated: false,
  expoPackages: new Set<IExpoPackageLayerName>(),
};

const DEFAULT_FEATURES = {
  hasTypescript: true,
  hasNavigation: false,
  hasExpoModules: false,
  hasTesting: false,
  hasSplashScreen: false,
  hasSlider: false,
  hasReanimated: false,
  expoPackages: new Set(),
};

// Every resolver below already returns at once when its value is explicit
// These tests cover the other escape hatch: no value given, but nothing to prompt on (piped
// stdin, CI, a Docker build), so a resolver that reached `clack.*` would hang the runner
describe('prompts in a non-interactive terminal', () => {
  useNonInteractiveTerminal();

  it('resolveAppName fails fast, as no default app name exists', async () => {
    await expect(resolveAppName(undefined)).rejects.toThrow(CliUsageError);
  });

  it('resolveFramework fails fast, as no default framework exists', async () => {
    await expect(resolveFramework(undefined)).rejects.toThrow(CliUsageError);
  });

  it('resolveVueFlavor fails fast, as no default flavor exists', async () => {
    await expect(resolveVueFlavor(undefined)).rejects.toThrow(CliUsageError);
  });

  it('resolveBundleId falls back to the computed default bundle id', async () => {
    await expect(resolveBundleId(undefined, 'MyApp')).resolves.toBe(
      defaultBundleId('MyApp'),
    );
  });

  it('resolveStyling falls back to its documented default (css)', async () => {
    await expect(resolveStyling(undefined)).resolves.toBe('css');
  });

  it('resolvePackageManager falls back to npm when nothing is detected', async () => {
    await expect(resolvePackageManager(undefined)).resolves.toBe('npm');
  });

  it('resolveOverwrite without --force fails fast with guidance', async () => {
    await expect(resolveOverwrite('/tmp/whatever', false)).rejects.toThrow(
      /--force/,
    );
  });

  it('resolveOverwrite with --force skips the prompt entirely, interactive or not', async () => {
    await expect(resolveOverwrite('/tmp/whatever', true)).resolves.toBe(true);
  });

  it('resolveFeatures falls back to its default selection with no prompt', async () => {
    await expect(resolveFeatures('react', NO_FEATURES)).resolves.toEqual(
      DEFAULT_FEATURES,
    );
  });

  it('resolveFeatures keeps a feature that a flag already switched on', async () => {
    await expect(
      resolveFeatures('react', { ...NO_FEATURES, hasReanimated: true }),
    ).resolves.toEqual({ ...DEFAULT_FEATURES, hasReanimated: true });
  });

  // Picking an Expo-backed package (--battery) implies the autolinking wiring
  // The developer never also ticks "Expo-modules autolinking"
  it('resolveFeatures implies hasExpoModules from an explicit Expo-package flag', async () => {
    await expect(
      resolveFeatures('react', {
        ...NO_FEATURES,
        expoPackages: new Set(['battery']),
      }),
    ).resolves.toEqual({
      ...DEFAULT_FEATURES,
      hasExpoModules: true,
      expoPackages: new Set(['battery']),
    });
  });

  // Angular's AOT pipeline has no plain-JS mode, so TypeScript is forced on when unspecified
  // An explicit, contradicted --javascript errors instead of vanishing with no feedback
  it('resolveFeatures rejects --javascript together with --framework angular', async () => {
    const withJavascript = { ...NO_FEATURES, isJavascript: true };

    await expect(resolveFeatures('angular', withJavascript)).rejects.toThrow(
      CliUsageError,
    );
    await expect(resolveFeatures('angular', withJavascript)).rejects.toThrow(
      /angular.*requires TypeScript/i,
    );
  });

  // Piped or CI `new` cannot pop a confirm, so it resolves false instead of hanging
  // That skips git init rather than initialising a repo nobody asked for
  it('resolveGitInit skips (resolves false) with no prompt, non-interactively', async () => {
    await expect(resolveGitInit()).resolves.toBe(false);
  });

  // Granting a bundle requests a permission that triggers a Play Console policy review
  // No default can stand in for that choice, so no terminal to ask in must fail fast
  it('resolveGrantSelection fails fast, as a policy-sensitive bundle needs an interactive choice', async () => {
    const candidates: IDiscoveredBundle[] = [
      {
        packageName: '@symbiote-native/location',
        bundle: {
          id: 'background',
          label: 'Background location tracking',
          warning: 'w',
          nextSteps: 'n',
        },
      },
    ];
    await expect(resolveGrantSelection(candidates)).rejects.toThrow(
      CliUsageError,
    );
  });
});
