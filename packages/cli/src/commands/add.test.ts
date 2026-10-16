import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IParsedCommand } from '../cli.js';
import { CliUsageError } from '../errors.js';
import type { IFramework } from '../types.js';

vi.mock('../detect-framework.js', () => ({
  detectSymbioteFrameworkFromDependencies: vi.fn(),
  readCwdDependencies: vi.fn(),
}));
vi.mock('../detect-added-layers.js', () => ({
  detectAddedLayers: vi.fn(),
}));
// `explicitLayersFromFlags` stays real, being pure and trivial, so only the resolvers are replaced
vi.mock('../add-layer-prompts.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../add-layer-prompts.js')>()),
  resolveAddLayers: vi.fn(),
  resolveAddOverwrite: vi.fn(),
}));
vi.mock('../prompts.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../prompts.js')>()),
  resolveGrantSelection: vi.fn(),
  resolvePackageManager: vi.fn(),
}));
vi.mock('../add-layers.js', () => ({
  addLayersToApp: vi.fn(),
}));
// `discoveredBundlesFromLayers` stays real for the same reason, and only `applyBundle` writes files
vi.mock('../grant-bundles.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../grant-bundles.js')>()),
  applyBundle: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
}));

const clack = await import('@clack/prompts');
const { detectSymbioteFrameworkFromDependencies, readCwdDependencies } =
  await import('../detect-framework.js');
const { detectAddedLayers } = await import('../detect-added-layers.js');
const { resolveAddLayers, resolveAddOverwrite } =
  await import('../add-layer-prompts.js');
const { resolveGrantSelection, resolvePackageManager } =
  await import('../prompts.js');
const { addLayersToApp } = await import('../add-layers.js');
const { applyBundle } = await import('../grant-bundles.js');
const { NotSymbioteAppError } = await import('../errors.js');
const { resolveFrameworkForAdd, runAdd } = await import('./add.js');

type IAddCommand = Extract<IParsedCommand, { kind: 'add' }>;

const BASE_PARSED: IAddCommand = {
  kind: 'add',
  framework: undefined,
  vueFlavor: undefined,
  hasExpoModules: false,
  hasNavigation: false,
  hasTesting: false,
  hasSplashScreen: false,
  hasSlider: false,
  hasReanimated: false,
  expoPackages: new Set(),
  hasForce: false,
  packageManager: 'npm',
};

function outroText(): string {
  return vi
    .mocked(clack.outro)
    .mock.calls.map(([message]) => message)
    .join('\n');
}

// `resolveFrameworkForAdd` is the eligibility guard of `add`, which extends an EXISTING
// @symbiote-native/* app and does not bootstrap one into plain RN, so it refuses instead of
// falling back to an interactive framework picker
describe('resolveFrameworkForAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotSymbioteAppError when no @symbiote-native/<adapter> dependency is found', () => {
    vi.mocked(readCwdDependencies).mockReturnValue({});
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue(
      undefined,
    );

    expect(() => resolveFrameworkForAdd(undefined, '/fake')).toThrow(
      NotSymbioteAppError,
    );
  });

  it('returns the detected framework when none is given explicitly', () => {
    vi.mocked(readCwdDependencies).mockReturnValue({
      '@symbiote-native/vue': '1.0.0',
    });
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue('vue');

    expect(resolveFrameworkForAdd(undefined, '/fake')).toBe('vue');
  });

  it('accepts an explicit --framework that matches the detected adapter', () => {
    vi.mocked(readCwdDependencies).mockReturnValue({
      '@symbiote-native/react': '1.0.0',
    });
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue('react');

    expect(resolveFrameworkForAdd('react', '/fake')).toBe('react');
  });

  // A flag that disagrees with what is installed reads as a typo or a stale command
  // That is far likelier than an intent to override reality, so it is refused
  it('rejects an explicit --framework that disagrees with the detected adapter', () => {
    vi.mocked(readCwdDependencies).mockReturnValue({
      '@symbiote-native/react': '1.0.0',
    });
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue('react');

    expect(() => resolveFrameworkForAdd('vue', '/fake')).toThrow(CliUsageError);
  });
});

describe('runAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolvePackageManager).mockResolvedValue('npm');
  });

  function mockEligibleApp(framework: IFramework = 'react'): void {
    vi.mocked(readCwdDependencies).mockReturnValue({
      [`@symbiote-native/${framework}`]: '1.0.0',
    });
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue(
      framework,
    );
    vi.mocked(detectAddedLayers).mockReturnValue(new Set());
  }

  function mockApplied(
    layers: readonly string[],
    hasManualBabelStep = false,
  ): void {
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: layers,
      skippedLayers: [],
      hasManualBabelStep,
    });
  }

  // The guard runs before anything else, as there is no point resolving layers for a project
  // `add` refuses to touch
  it('refuses on a non-symbiote project before resolving any layers', async () => {
    vi.mocked(readCwdDependencies).mockReturnValue({});
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue(
      undefined,
    );

    await expect(runAdd(BASE_PARSED)).rejects.toThrow(NotSymbioteAppError);
    expect(resolveAddLayers).not.toHaveBeenCalled();
  });

  // The `hide()` wiring for splash-screen is spliced into the App source by `addLayersToApp`
  // So `add` prints no manual per-framework instructions for a step it does itself
  it('does not print manual hide() instructions when splash-screen is applied', async () => {
    mockEligibleApp('vue');
    vi.mocked(resolveAddLayers).mockResolvedValue(['splash-screen']);
    mockApplied(['splash-screen']);

    await runAdd({ ...BASE_PARSED, hasSplashScreen: true });

    expect(outroText()).not.toContain('onMounted');
    expect(outroText()).not.toContain('Call hide()');
  });

  it('does nothing when every layer is already present and none was explicitly requested', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue([]);

    await runAdd(BASE_PARSED);

    expect(addLayersToApp).not.toHaveBeenCalled();
  });

  it('applies the resolved layers against the current working directory', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['navigation']);
    mockApplied(['navigation']);

    await runAdd({ ...BASE_PARSED, hasNavigation: true });

    expect(addLayersToApp).toHaveBeenCalledWith(
      expect.objectContaining({
        root: process.cwd(),
        framework: 'react',
        layers: ['navigation'],
      }),
    );
  });

  // Reanimated has a native half, so a developer who just added it needs the pods and a rebuild
  it('tells the developer to run pod install after reanimated is applied', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['reanimated']);
    mockApplied(['reanimated']);

    await runAdd({ ...BASE_PARSED, hasReanimated: true });

    expect(outroText()).toContain('pod install');
  });

  it('stays silent about the babel plugin when reanimated wrote it itself', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['reanimated']);
    mockApplied(['reanimated'], false);

    await runAdd({ ...BASE_PARSED, hasReanimated: true });

    expect(outroText()).not.toContain('react-native-worklets/plugin');
  });

  // An app whose babel config has no plugins list cannot be edited, so the developer is told to
  it('names the babel plugin step when the config could not take it', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['reanimated']);
    mockApplied(['reanimated'], true);

    await runAdd({ ...BASE_PARSED, hasReanimated: true });

    expect(outroText()).toContain('react-native-worklets/plugin');
  });

  it('prints no pod install note when reanimated was not part of the add', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['navigation']);
    mockApplied(['navigation']);

    await runAdd({ ...BASE_PARSED, hasNavigation: true });

    expect(outroText()).not.toContain('pod install');
  });

  // A developer who just added `audio` will not know it also offers an optional, policy-sensitive
  // Android bundle unless `add` offers it there, since a command printed for later is bad DX
  // So `add` asks interactively and applies the actual choice, as `grant` itself would
  it('offers to grant a bundle for a newly-applied package that has one, and applies what was picked', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['audio']);
    mockApplied(['audio']);
    const bundle = {
      id: 'recording',
      label: 'Background audio recording',
      warning: 'w',
      nextSteps: 'n',
    };
    vi.mocked(resolveGrantSelection).mockResolvedValue([
      { packageName: '@symbiote-native/audio', bundle },
    ]);

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['audio']) });

    expect(applyBundle).toHaveBeenCalledWith(process.cwd(), bundle);
    expect(clack.note).toHaveBeenCalledWith(
      expect.stringContaining(bundle.warning),
      bundle.label,
    );
    expect(outroText()).toContain(bundle.label);
  });

  // Declining every offered bundle is an informed choice, not a failure
  // Nothing is applied, and a "run grant later" hint would repeat what they just answered
  it('applies nothing when the developer declines every offered bundle', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['audio']);
    mockApplied(['audio']);
    vi.mocked(resolveGrantSelection).mockResolvedValue([]);

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['audio']) });

    expect(applyBundle).not.toHaveBeenCalled();
    expect(outroText()).not.toContain('grant');
  });

  // A piped or CI `add` cannot pop a multiselect, so `resolveGrantSelection` fails fast
  // That must not abort the command, which falls back to the printed hint
  it('falls back to a printed hint when resolveGrantSelection cannot ask (non-interactive)', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['audio']);
    mockApplied(['audio']);
    vi.mocked(resolveGrantSelection).mockRejectedValue(
      new CliUsageError('not interactive'),
    );

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['audio']) });

    expect(applyBundle).not.toHaveBeenCalled();
    expect(outroText()).toContain('@symbiote-native/cli grant audio');
  });

  // A package with no optional bundle (battery) has nothing to ask about
  // So there is no empty prompt and no hint, as `grant battery` would only report nothing to grant
  it('does not ask or hint at `grant` for a package with no optional manifest bundle', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['battery']);
    mockApplied(['battery']);

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['battery']) });

    expect(resolveGrantSelection).not.toHaveBeenCalled();
    expect(outroText()).not.toContain('grant');
  });

  // The overwrite policy lives in `resolveAddOverwrite`
  // This proves `runAdd` wires the real --force flag into it instead of choosing for itself
  it('wires the testing-overwrite confirm through to resolveAddOverwrite with --force', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['testing']);
    vi.mocked(resolveAddOverwrite).mockResolvedValue(true);
    vi.mocked(addLayersToApp).mockImplementation(async options => {
      await options.confirmTestingOverwrite();
      return {
        appliedLayers: ['testing'],
        skippedLayers: [],
        hasManualBabelStep: false,
      };
    });

    await runAdd({ ...BASE_PARSED, hasTesting: true, hasForce: true });

    expect(resolveAddOverwrite).toHaveBeenCalledWith(true, expect.any(String));
  });
});
