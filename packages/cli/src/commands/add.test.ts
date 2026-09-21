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
  resolvePackageManager: vi.fn(),
}));
vi.mock('../add-layers.js', () => ({
  addLayersToApp: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
}));

const clack = await import('@clack/prompts');
const { detectSymbioteFrameworkFromDependencies, readCwdDependencies } =
  await import('../detect-framework.js');
const { detectAddedLayers } = await import('../detect-added-layers.js');
const { resolveAddLayers, resolveAddOverwrite, resolvePackageManager } =
  await import('../prompts.js');
const { addLayersToApp } = await import('../add-layers.js');
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
