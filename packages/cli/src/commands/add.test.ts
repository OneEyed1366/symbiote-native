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
// explicitLayersFromFlags stays real (pure, trivial) — only the resolvers that need mocking are
// replaced, via importOriginal rather than hand-duplicating its five-flag mapping here.
vi.mock('../prompts.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../prompts.js')>()),
  resolveAddLayers: vi.fn(),
  resolveAddOverwrite: vi.fn(),
  resolveGrantSelection: vi.fn(),
  resolvePackageManager: vi.fn(),
}));
vi.mock('../add-layers.js', () => ({
  addLayersToApp: vi.fn(),
}));
// discoveredBundlesFromLayers stays real (pure, trivial — same reasoning as
// explicitLayersFromFlags below) — only applyBundle needs mocking, since it writes files.
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
const {
  resolveAddLayers,
  resolveAddOverwrite,
  resolveGrantSelection,
  resolvePackageManager,
} = await import('../prompts.js');
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
  hasForce: false,
  packageManager: 'npm',
};

// resolveFrameworkForAdd is `add`'s eligibility guard — its own purpose statement (from the design
// review this redesign came out of): `add` extends an EXISTING @symbiote-native/* app, it doesn't
// bootstrap symbiote into a plain RN project, so it must refuse rather than fall back to an
// interactive framework picker (the OLD behavior, dropped along with the old "install symbiote
// into any RN app" scope).
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

  // An explicit flag that disagrees with what's actually installed reads as a typo or a stale
  // command far more often than genuine intent to override reality — refuse instead of trusting it.
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

  // The guard runs BEFORE anything else — no point resolving layers for a project `add` refuses
  // to touch.
  it('refuses on a non-symbiote project before resolving any layers', async () => {
    vi.mocked(readCwdDependencies).mockReturnValue({});
    vi.mocked(detectSymbioteFrameworkFromDependencies).mockReturnValue(
      undefined,
    );

    await expect(runAdd(BASE_PARSED)).rejects.toThrow(NotSymbioteAppError);
    expect(resolveAddLayers).not.toHaveBeenCalled();
  });

  // splash-screen's hide() JS wiring is spliced into the App source by addLayersToApp itself
  // (apply-splash-screen-hide.ts, real bug fixed 2026-09-18: 6 already-scaffolded apps never got
  // it) — `add` no longer prints manual per-framework instructions for a step it now does itself.
  it('does not print manual hide() instructions when splash-screen is applied', async () => {
    mockEligibleApp('vue');
    vi.mocked(resolveAddLayers).mockResolvedValue(['splash-screen']);
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: ['splash-screen'],
      skippedLayers: [],
    });

    await runAdd({ ...BASE_PARSED, hasSplashScreen: true });

    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).not.toContain('onMounted');
    expect(outroText).not.toContain('Call hide()');
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
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: ['navigation'],
      skippedLayers: [],
    });

    await runAdd({ ...BASE_PARSED, hasNavigation: true });

    expect(addLayersToApp).toHaveBeenCalledWith(
      expect.objectContaining({
        root: process.cwd(),
        framework: 'react',
        layers: ['navigation'],
      }),
    );
  });

  // The overwrite policy (TTY confirm / --force / non-interactive skip) lives in resolveAddOverwrite
  // — this proves runAdd actually wires the real --force flag into it rather than hardcoding a
  // choice of its own.
  //
  // why: a developer who just added `audio` won't know it also offers an optional,
  // policy-sensitive Android bundle unless `add` OFFERS it right there — printing a command to run
  // later is bad DX (the previous shape this replaces), so `add` asks interactively and applies
  // the developer's actual choice, same as `grant` itself would.
  it('offers to grant a bundle for a newly-applied package that has one, and applies what was picked', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['audio']);
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: ['audio'],
      skippedLayers: [],
    });
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
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).toContain(bundle.label);
  });

  // why: declining every offered bundle is an informed choice, not a failure — nothing should be
  // applied, and repeating a "run grant later" hint the developer just answered would be noise.
  it('applies nothing when the developer declines every offered bundle', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['audio']);
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: ['audio'],
      skippedLayers: [],
    });
    vi.mocked(resolveGrantSelection).mockResolvedValue([]);

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['audio']) });

    expect(applyBundle).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).not.toContain('grant');
  });

  // why: a piped/CI `add` can't pop an interactive multiselect — resolveGrantSelection fails fast
  // in that case (its own documented contract), and `add` must not let that abort the whole
  // command. It falls back to the printed hint so the developer still hears about it later.
  it('falls back to a printed hint when resolveGrantSelection cannot ask (non-interactive)', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['audio']);
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: ['audio'],
      skippedLayers: [],
    });
    vi.mocked(resolveGrantSelection).mockRejectedValue(
      new CliUsageError('not interactive'),
    );

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['audio']) });

    expect(applyBundle).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).toContain('@symbiote-native/cli grant audio');
  });

  // why: a package with no optional bundle (e.g. battery) has nothing to ask about — must not pop
  // an empty prompt or print a hint that leads nowhere (`grant battery` would just report
  // "nothing to grant").
  it('does not ask or hint at `grant` for a package with no optional manifest bundle', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['battery']);
    vi.mocked(addLayersToApp).mockResolvedValue({
      appliedLayers: ['battery'],
      skippedLayers: [],
    });

    await runAdd({ ...BASE_PARSED, expoPackages: new Set(['battery']) });

    expect(resolveGrantSelection).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).not.toContain('grant');
  });

  it('wires the testing-overwrite confirm through to resolveAddOverwrite with --force', async () => {
    mockEligibleApp();
    vi.mocked(resolveAddLayers).mockResolvedValue(['testing']);
    vi.mocked(resolveAddOverwrite).mockResolvedValue(true);
    vi.mocked(addLayersToApp).mockImplementation(async options => {
      await options.confirmTestingOverwrite();
      return { appliedLayers: ['testing'], skippedLayers: [] };
    });

    await runAdd({ ...BASE_PARSED, hasTesting: true, hasForce: true });

    expect(resolveAddOverwrite).toHaveBeenCalledWith(true, expect.any(String));
  });
});
