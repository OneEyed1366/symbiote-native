import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliUsageError } from './errors.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';
import {
  buildAddLayerOptions,
  dropAlreadyAdded,
  resolveAddLayers,
  resolveAddOverwrite,
  resolveAppName,
  resolveBundleId,
  resolveFeatures,
  resolveFramework,
  resolveOverwrite,
  resolvePackageManager,
  resolveStyling,
  resolveVueFlavor,
} from './prompts.js';
import { defaultBundleId } from './utils/native-identity.js';

// Every resolver below already returns synchronously when its value is explicit — these tests
// cover the OTHER escape hatch: no value given, but nothing to prompt on (piped stdin, CI, a
// Docker build). Forcing `isTTY` off proves the resolver never reaches `clack.*` — if it did,
// the prompt would hang the test runner forever waiting on a stdin that never answers.
describe('prompts in a non-interactive terminal', () => {
  const originalIsTTY = process.stdin.isTTY;

  const originalUserAgent = process.env.npm_config_user_agent;

  beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    });
    // The test runner itself was invoked through pnpm, which sets this env var — clear it so
    // resolvePackageManager's own detection doesn't short-circuit before the fallback under test.
    delete process.env.npm_config_user_agent;
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    if (originalUserAgent !== undefined)
      process.env.npm_config_user_agent = originalUserAgent;
  });

  it('resolveAppName fails fast — no default app name exists', async () => {
    await expect(resolveAppName(undefined)).rejects.toThrow(CliUsageError);
  });

  it('resolveFramework fails fast — no default framework exists', async () => {
    await expect(resolveFramework(undefined)).rejects.toThrow(CliUsageError);
  });

  it('resolveVueFlavor fails fast — no default flavor exists', async () => {
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
    await expect(
      resolveFeatures('react', {
        isJavascript: false,
        hasNavigation: false,
        hasExpoModules: false,
        hasTesting: false,
        hasSplashScreen: false,
        hasSlider: false,
        expoPackages: new Set(),
      }),
    ).resolves.toEqual({
      hasTypescript: true,
      hasNavigation: false,
      hasExpoModules: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages: new Set(),
    });
  });

  // Picking an Expo-backed package (e.g. --battery) implies the autolinking wiring — the
  // developer never separately ticks/passes "Expo-modules autolinking" too.
  it('resolveFeatures implies hasExpoModules from an explicit Expo-package flag', async () => {
    await expect(
      resolveFeatures('react', {
        isJavascript: false,
        hasNavigation: false,
        hasExpoModules: false,
        hasTesting: false,
        hasSplashScreen: false,
        hasSlider: false,
        expoPackages: new Set(['battery']),
      }),
    ).resolves.toEqual({
      hasTypescript: true,
      hasNavigation: false,
      hasExpoModules: true,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      expoPackages: new Set(['battery']),
    });
  });

  // Angular's AOT pipeline has no plain-JS mode — resolveFeatures silently forces TypeScript on
  // regardless of --javascript. That's the right call when TypeScript is merely unspecified, but
  // an EXPLICIT, contradicted --javascript should error rather than vanish with no feedback, same
  // as any other flag combination this CLI rejects instead of silently picking a side.
  it('resolveFeatures rejects --javascript together with --framework angular', async () => {
    await expect(
      resolveFeatures('angular', {
        isJavascript: true,
        hasNavigation: false,
        hasExpoModules: false,
        hasTesting: false,
        hasSplashScreen: false,
        hasSlider: false,
        expoPackages: new Set(),
      }),
    ).rejects.toThrow(CliUsageError);
    await expect(
      resolveFeatures('angular', {
        isJavascript: true,
        hasNavigation: false,
        hasExpoModules: false,
        hasTesting: false,
        hasSplashScreen: false,
        hasSlider: false,
        expoPackages: new Set(),
      }),
    ).rejects.toThrow(/angular.*requires TypeScript/i);
  });

  // `add --testing` on an app that already has detox.config.js can't pop a confirm prompt in CI —
  // it must default to the SAFE choice (skip, don't clobber) rather than hang or silently overwrite.
  it('resolveAddOverwrite without --force skips (resolves false) with no prompt', async () => {
    await expect(resolveAddOverwrite(false, 'Overwrite?')).resolves.toBe(false);
  });

  it('resolveAddOverwrite with --force always resolves true, interactive or not', async () => {
    await expect(resolveAddOverwrite(true, 'Overwrite?')).resolves.toBe(true);
  });

  // No layer flags and no interactive terminal to ask in — same fail-fast shape as
  // resolveFramework/resolveAppName above, but only when there's actually something left to add.
  it('resolveAddLayers with no flags and remaining layers fails fast, non-interactively', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: false,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: false,
        },
        new Set(),
      ),
    ).rejects.toThrow(CliUsageError);
  });

  it('resolveAddLayers with no flags and nothing left to add resolves to an empty list, no prompt', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: false,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: false,
        },
        new Set([
          'navigation',
          'expo-modules',
          'testing',
          'slider',
          'splash-screen',
          ...EXPO_PACKAGE_LAYERS.map(layer => layer.id),
        ]),
      ),
    ).resolves.toEqual([]);
  });
});

// Explicit flags short-circuit resolveAddLayers before it ever needs a terminal — covered outside
// the non-interactive describe block above since interactivity is irrelevant to this path.
describe('resolveAddLayers with explicit flags', () => {
  // why: an explicit --navigation on an app that already has navigation must NOT silently
  // re-render its App/MenuScreen/DetailsScreen — that would blow away real customization the
  // developer made after `new`. Real-world bug (2026-09-18): `add --navigation --expo-modules
  // --testing --splash-screen --slider` on an app that already had navigation re-applied it
  // anyway, alongside the genuinely-missing layers.
  it('drops an explicitly-flagged layer that is already added, without --force', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: true,
          hasTesting: true,
          hasSlider: false,
          hasSplashScreen: false,
        },
        new Set(['navigation']),
        false,
      ),
    ).resolves.toEqual(['testing']);
  });

  // why: --force is the escape hatch for "yes, reset this layer's files back to the template
  // defaults" — the one case where re-applying an already-added layer is the actual intent.
  it('re-applies an already-added layer when --force is passed', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: true,
          hasTesting: true,
          hasSlider: false,
          hasSplashScreen: false,
        },
        new Set(['navigation']),
        true,
      ),
    ).resolves.toEqual(['navigation', 'testing']);
  });

  it('includes splash-screen when explicitly flagged', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: false,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: true,
        },
        new Set(),
        false,
      ),
    ).resolves.toEqual(['splash-screen']);
  });

  it('returns empty when every explicitly-flagged layer is already added and not forced', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: true,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: false,
        },
        new Set(['navigation']),
        false,
      ),
    ).resolves.toEqual([]);
  });

  // An Expo-package flag (e.g. --battery) implies `expo-modules` — the developer never has to
  // pass both. Real-world motivation: same shape as resolveFeatures' implication for "new".
  it('implies expo-modules from an explicit Expo-package flag', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: false,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: false,
          expoPackages: new Set(['battery']),
        },
        new Set(),
        false,
      ),
    ).resolves.toEqual(['battery', 'expo-modules']);
  });

  it('does not duplicate expo-modules when it is already explicitly flagged too', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: true,
          hasNavigation: false,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: false,
          expoPackages: new Set(['battery']),
        },
        new Set(),
        false,
      ),
    ).resolves.toEqual(['expo-modules', 'battery']);
  });

  it('implies expo-modules even when it is already added (idempotent re-apply)', async () => {
    await expect(
      resolveAddLayers(
        {
          hasExpoModules: false,
          hasNavigation: false,
          hasTesting: false,
          hasSlider: false,
          hasSplashScreen: false,
          expoPackages: new Set(['battery']),
        },
        new Set(['expo-modules']),
        false,
      ),
    ).resolves.toEqual(['battery', 'expo-modules']);
  });
});

// DX (2026-09-18): an already-added layer stays in the multiselect, disabled with why, instead of
// vanishing — a shrinking menu with no visible reason looked like a bug, not a filter.
//
// DX (2026-09-20): grouped under "Core layers" / "Expo packages" (clack's groupMultiselect)
// instead of one flat 26-option list — the 21 Expo packages alone outnumbered every other layer,
// so finding "Navigation" meant reading past all of them.
describe('buildAddLayerOptions', () => {
  function findOption(
    groups: ReturnType<typeof buildAddLayerOptions>,
    value: string,
  ) {
    return Object.values(groups)
      .flat()
      .find(option => option.value === value);
  }

  it('marks an already-added layer disabled, with an "already added" hint', () => {
    const groups = buildAddLayerOptions(new Set(['navigation']));
    expect(findOption(groups, 'navigation')).toMatchObject({
      disabled: true,
      hint: 'already added',
    });
  });

  it('leaves a not-yet-added layer enabled, with its normal hint', () => {
    const groups = buildAddLayerOptions(new Set());
    expect(findOption(groups, 'navigation')).toMatchObject({
      disabled: false,
      hint: '@symbiote-native/navigation',
    });
  });

  it('groups the 5 hand-named layers under "Core layers" and every Expo package under "Expo packages"', () => {
    const groups = buildAddLayerOptions(new Set());
    expect(groups['Core layers']).toHaveLength(5);
    expect(groups['Expo packages']).toHaveLength(EXPO_PACKAGE_LAYERS.length);
  });

  it('lists every layer regardless of what is already added — nothing is filtered out', () => {
    const alreadyAdded = new Set([
      'navigation',
      'expo-modules',
      'testing',
      'slider',
      'splash-screen',
    ]);
    const groups = buildAddLayerOptions(alreadyAdded);
    expect(Object.values(groups).flat()).toHaveLength(
      5 + EXPO_PACKAGE_LAYERS.length,
    );
  });

  it.each(EXPO_PACKAGE_LAYERS)(
    'marks $id disabled once already added',
    layer => {
      const groups = buildAddLayerOptions(new Set([layer.id]));
      expect(findOption(groups, layer.id)).toMatchObject({
        disabled: true,
        hint: 'already added',
      });
    },
  );
});

// why: clack's groupMultiselect never enforces `disabled` — confirmed against @clack/core
// 1.4.3's GroupMultiSelectPrompt.toggleValue (reads only `option.group`) and against
// groupMultiselect's own render path (no "disabled" branch): the option looks disabled but
// stays checkable. This is the real gate — an already-added layer is dropped unless --force,
// whatever the prompt actually returns.
describe('dropAlreadyAdded', () => {
  it('drops a layer that is already added', () => {
    expect(
      dropAlreadyAdded(
        ['navigation', 'testing'],
        new Set(['navigation']),
        false,
      ),
    ).toEqual(['testing']);
  });

  it('keeps a layer that is not already added', () => {
    expect(dropAlreadyAdded(['navigation'], new Set(), false)).toEqual([
      'navigation',
    ]);
  });

  it('keeps an already-added layer when --force is passed', () => {
    expect(
      dropAlreadyAdded(['navigation'], new Set(['navigation']), true),
    ).toEqual(['navigation']);
  });
});
