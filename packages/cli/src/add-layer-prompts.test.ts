import { describe, expect, it } from 'vitest';
import {
  buildAddLayerOptions,
  dropAlreadyAdded,
  resolveAddLayers,
  resolveAddOverwrite,
} from './add-layer-prompts.js';
import { CliUsageError } from './errors.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';
import { useNonInteractiveTerminal } from './non-interactive-terminal.test-helper.js';

const NO_FLAGS = {
  hasExpoModules: false,
  hasNavigation: false,
  hasTesting: false,
  hasSlider: false,
  hasSplashScreen: false,
  hasReanimated: false,
};

const EVERY_CORE_LAYER = [
  'navigation',
  'expo-modules',
  'testing',
  'slider',
  'splash-screen',
  'reanimated',
] as const;

describe('add prompts in a non-interactive terminal', () => {
  useNonInteractiveTerminal();

  // `add --testing` on an app with detox.config.js cannot pop a confirm prompt in CI
  // It must default to the safe choice, skip instead of clobbering, rather than hang or overwrite
  it('resolveAddOverwrite without --force skips (resolves false) with no prompt', async () => {
    await expect(resolveAddOverwrite(false, 'Overwrite?')).resolves.toBe(false);
  });

  it('resolveAddOverwrite with --force always resolves true, interactive or not', async () => {
    await expect(resolveAddOverwrite(true, 'Overwrite?')).resolves.toBe(true);
  });

  // No layer flags and no terminal to ask in fails fast, but only when something is left to add
  it('resolveAddLayers with no flags and remaining layers fails fast, non-interactively', async () => {
    await expect(resolveAddLayers(NO_FLAGS, new Set())).rejects.toThrow(
      CliUsageError,
    );
  });

  it('resolveAddLayers names --reanimated among the flags that would have skipped the ask', async () => {
    await expect(resolveAddLayers(NO_FLAGS, new Set())).rejects.toThrow(
      /--reanimated/,
    );
  });

  it('resolveAddLayers with no flags and nothing left to add resolves to an empty list, no prompt', async () => {
    await expect(
      resolveAddLayers(
        NO_FLAGS,
        new Set([
          ...EVERY_CORE_LAYER,
          ...EXPO_PACKAGE_LAYERS.map(layer => layer.id),
        ]),
      ),
    ).resolves.toEqual([]);
  });
});

// Explicit flags short-circuit `resolveAddLayers` before it needs a terminal
// So they sit outside the non-interactive block above, as interactivity is irrelevant here
describe('resolveAddLayers with explicit flags', () => {
  // An explicit --navigation on an app that has navigation must not re-render its App,
  // MenuScreen and DetailsScreen, as that would blow away the developer's own customization
  it('drops an explicitly-flagged layer that is already added, without --force', async () => {
    await expect(
      resolveAddLayers(
        { ...NO_FLAGS, hasNavigation: true, hasTesting: true },
        new Set(['navigation']),
        false,
      ),
    ).resolves.toEqual(['testing']);
  });

  // --force is the escape hatch for resetting a layer's files back to the template defaults
  it('re-applies an already-added layer when --force is passed', async () => {
    await expect(
      resolveAddLayers(
        { ...NO_FLAGS, hasNavigation: true, hasTesting: true },
        new Set(['navigation']),
        true,
      ),
    ).resolves.toEqual(['navigation', 'testing']);
  });

  it('includes splash-screen when explicitly flagged', async () => {
    await expect(
      resolveAddLayers(
        { ...NO_FLAGS, hasSplashScreen: true },
        new Set(),
        false,
      ),
    ).resolves.toEqual(['splash-screen']);
  });

  it('includes reanimated when explicitly flagged', async () => {
    await expect(
      resolveAddLayers({ ...NO_FLAGS, hasReanimated: true }, new Set(), false),
    ).resolves.toEqual(['reanimated']);
  });

  it('drops reanimated when it is already added and --force is absent', async () => {
    await expect(
      resolveAddLayers(
        { ...NO_FLAGS, hasReanimated: true },
        new Set(['reanimated']),
        false,
      ),
    ).resolves.toEqual([]);
  });

  it('returns empty when every explicitly-flagged layer is already added and not forced', async () => {
    await expect(
      resolveAddLayers(
        { ...NO_FLAGS, hasNavigation: true },
        new Set(['navigation']),
        false,
      ),
    ).resolves.toEqual([]);
  });

  // An Expo-package flag (--battery) implies `expo-modules`, so the developer never passes both
  // It is the same shape as the implication `resolveFeatures` makes for "new"
  it('implies expo-modules from an explicit Expo-package flag', async () => {
    await expect(
      resolveAddLayers(
        { ...NO_FLAGS, expoPackages: new Set(['battery']) },
        new Set(),
        false,
      ),
    ).resolves.toEqual(['battery', 'expo-modules']);
  });

  it('does not duplicate expo-modules when it is already explicitly flagged too', async () => {
    await expect(
      resolveAddLayers(
        {
          ...NO_FLAGS,
          hasExpoModules: true,
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
        { ...NO_FLAGS, expoPackages: new Set(['battery']) },
        new Set(['expo-modules']),
        false,
      ),
    ).resolves.toEqual(['battery', 'expo-modules']);
  });
});

// An already-added layer stays in the multiselect, disabled with a reason, not vanishing
// A menu that shrinks for no visible reason looks like a bug, not a filter

// Grouped under "Core layers" and "Expo packages" by clack's `groupMultiselect`
// The Expo packages outnumber every other layer, so a flat list would bury "Navigation"
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

  it('offers reanimated with the package it installs as the hint', () => {
    const groups = buildAddLayerOptions(new Set());
    expect(findOption(groups, 'reanimated')).toMatchObject({
      label: 'Reanimated',
      hint: '@symbiote-native/reanimated',
    });
  });

  it('groups the 6 hand-named layers under "Core layers" and every Expo package under "Expo packages"', () => {
    const groups = buildAddLayerOptions(new Set());
    expect(groups['Core layers']).toHaveLength(6);
    expect(groups['Expo packages']).toHaveLength(EXPO_PACKAGE_LAYERS.length);
  });

  it('lists every layer regardless of what is already added, nothing is filtered out', () => {
    const groups = buildAddLayerOptions(new Set(EVERY_CORE_LAYER));
    expect(Object.values(groups).flat()).toHaveLength(
      6 + EXPO_PACKAGE_LAYERS.length,
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

// clack's `groupMultiselect` never enforces `disabled`, it reads only `option.group` on toggle
// So an already-added layer looks disabled but stays checkable, and this drop is the real gate
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
