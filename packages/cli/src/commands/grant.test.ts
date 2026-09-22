import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IParsedCommand } from '../cli.js';
import { NotSymbioteAppError } from '../errors.js';

vi.mock('@symbiote-native/expo-modules-link', () => ({
  findAppRoot: vi.fn(),
}));
vi.mock('../grant-bundles.js', () => ({
  discoverOptionalBundles: vi.fn(),
  filterBundlesForLayer: vi.fn(),
  applyBundle: vi.fn(),
}));
vi.mock('../prompts.js', () => ({
  resolveGrantSelection: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
}));

const clack = await import('@clack/prompts');
const { findAppRoot } = await import('@symbiote-native/expo-modules-link');
const { discoverOptionalBundles, filterBundlesForLayer, applyBundle } =
  await import('../grant-bundles.js');
const { resolveGrantSelection } = await import('../prompts.js');
const { runGrant } = await import('./grant.js');

type IGrantCommand = Extract<IParsedCommand, { kind: 'grant' }>;

const BASE_PARSED: IGrantCommand = { kind: 'grant', layer: undefined };

const LOCATION_BUNDLE = {
  packageName: '@symbiote-native/location',
  bundle: {
    id: 'background',
    label: 'Background location tracking',
    warning: 'Triggers Play Console review.',
    nextSteps: 'Pass foregroundService to startLocationUpdatesAsync.',
  },
};

describe('runGrant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findAppRoot).mockReturnValue('/fake/app');
    vi.mocked(filterBundlesForLayer).mockImplementation(
      (discovered: unknown) => discovered as never,
    );
  });

  // why: `grant` reads and writes the app's own AndroidManifest.xml — there is nothing for it to
  // act on outside a real React-Native-with-Android project, same eligibility guard "add" applies.
  it('refuses when run outside a React Native app, before discovering anything', async () => {
    vi.mocked(findAppRoot).mockReturnValue(null);

    await expect(runGrant(BASE_PARSED)).rejects.toThrow(NotSymbioteAppError);
    expect(discoverOptionalBundles).not.toHaveBeenCalled();
  });

  it('reports nothing to grant when no installed package declares an optional bundle', async () => {
    vi.mocked(discoverOptionalBundles).mockReturnValue([]);
    vi.mocked(filterBundlesForLayer).mockReturnValue([]);

    await runGrant(BASE_PARSED);

    expect(resolveGrantSelection).not.toHaveBeenCalled();
    expect(applyBundle).not.toHaveBeenCalled();
  });

  // why: `grant location` narrows candidates to what filterBundlesForLayer returns — a typo'd or
  // uninstalled layer must not fall back to offering everything.
  it('scopes discovery to the given layer before asking what to select', async () => {
    vi.mocked(discoverOptionalBundles).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(filterBundlesForLayer).mockReturnValue([]);

    await runGrant({ kind: 'grant', layer: 'sqlite' });

    expect(filterBundlesForLayer).toHaveBeenCalledWith(
      [LOCATION_BUNDLE],
      'sqlite',
    );
    expect(resolveGrantSelection).not.toHaveBeenCalled();
  });

  it('applies every bundle the developer selected', async () => {
    vi.mocked(discoverOptionalBundles).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(filterBundlesForLayer).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(resolveGrantSelection).mockResolvedValue([LOCATION_BUNDLE]);

    await runGrant(BASE_PARSED);

    expect(applyBundle).toHaveBeenCalledWith(
      '/fake/app',
      LOCATION_BUNDLE.bundle,
    );
  });

  // why: the whole point of the two-field bundle schema (warning + nextSteps) is that both reach
  // the developer after granting — not just a silent manifest edit. Delegated to
  // printGrantedNotes (its own clack.note callout), not folded into the outro text.
  it('opens a note box with the warning and next steps for every granted bundle', async () => {
    vi.mocked(discoverOptionalBundles).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(filterBundlesForLayer).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(resolveGrantSelection).mockResolvedValue([LOCATION_BUNDLE]);

    await runGrant(BASE_PARSED);

    expect(clack.note).toHaveBeenCalledWith(
      expect.stringContaining(LOCATION_BUNDLE.bundle.warning),
      LOCATION_BUNDLE.bundle.label,
    );
    expect(clack.note).toHaveBeenCalledWith(
      expect.stringContaining(LOCATION_BUNDLE.bundle.nextSteps),
      LOCATION_BUNDLE.bundle.label,
    );
  });

  it('does not touch the manifest when nothing was selected', async () => {
    vi.mocked(discoverOptionalBundles).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(filterBundlesForLayer).mockReturnValue([LOCATION_BUNDLE]);
    vi.mocked(resolveGrantSelection).mockResolvedValue([]);

    await runGrant(BASE_PARSED);

    expect(applyBundle).not.toHaveBeenCalled();
  });
});
