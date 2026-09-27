import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IParsedCommand } from '../cli.js';
import { CliUsageError } from '../errors.js';
import type { IExpoPackageLayerName } from '../expo-package-layers.js';

vi.mock('../generate.js', () => ({
  isEmptyDir: vi.fn(() => true),
  scaffoldApp: vi.fn(() => '/fake/my-app'),
}));
vi.mock('../prompts.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../prompts.js')>()),
  resolveAppName: vi.fn(),
  resolveBundleId: vi.fn(),
  resolveFeatures: vi.fn(),
  resolveFramework: vi.fn(),
  resolveGitInit: vi.fn(),
  resolveGrantSelection: vi.fn(),
  resolveOverwrite: vi.fn(),
  resolvePackageManager: vi.fn(),
  resolveStyling: vi.fn(),
  resolveVueFlavor: vi.fn(),
}));
// discoveredBundlesFromLayers stays real (pure, trivial) — only applyBundle needs mocking, since
// it writes files.
vi.mock('../grant-bundles.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../grant-bundles.js')>()),
  applyBundle: vi.fn(),
}));
vi.mock('../utils/git-init.js', () => ({
  tryGitInit: vi.fn(),
}));
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
}));
vi.mock('node:fs', async importOriginal => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn(() => true),
}));

const clack = await import('@clack/prompts');
const fs = await import('node:fs');
const { scaffoldApp } = await import('../generate.js');
const {
  resolveAppName,
  resolveBundleId,
  resolveFeatures,
  resolveFramework,
  resolveGitInit,
  resolveGrantSelection,
  resolveOverwrite,
  resolvePackageManager,
  resolveStyling,
} = await import('../prompts.js');
const { applyBundle } = await import('../grant-bundles.js');
const { tryGitInit } = await import('../utils/git-init.js');
const { runNew } = await import('./new.js');

type INewCommand = Extract<IParsedCommand, { kind: 'new' }>;

const BASE_PARSED: INewCommand = {
  kind: 'new',
  appName: 'my-app',
  framework: undefined,
  vueFlavor: undefined,
  isJavascript: false,
  hasForce: false,
  bundleId: undefined,
  hasExpoModules: false,
  hasNavigation: false,
  hasTesting: false,
  hasSplashScreen: false,
  hasSlider: false,
  expoPackages: new Set(),
  styling: undefined,
  packageManager: undefined,
};

function mockHappyPath(
  expoPackages: readonly IExpoPackageLayerName[] = [],
): void {
  vi.mocked(resolveAppName).mockResolvedValue('my-app');
  vi.mocked(resolveFramework).mockResolvedValue('react');
  vi.mocked(resolveBundleId).mockResolvedValue('com.example.myapp');
  vi.mocked(resolveFeatures).mockResolvedValue({
    hasTypescript: true,
    hasNavigation: false,
    hasExpoModules: expoPackages.length > 0,
    hasTesting: false,
    hasSplashScreen: false,
    hasSlider: false,
    expoPackages: new Set(expoPackages),
  });
  vi.mocked(resolveStyling).mockResolvedValue('css');
  vi.mocked(resolvePackageManager).mockResolvedValue('npm');
  vi.mocked(resolveOverwrite).mockResolvedValue(true);
  vi.mocked(scaffoldApp).mockReturnValue('/fake/my-app');
}

describe('runNew', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // why: a developer who just scaffolded a new app with --audio won't know it also offers an
  // optional, policy-sensitive Android bundle unless `new` OFFERS it right there — same reason
  // `add` asks interactively rather than only printing a command to run later.
  it('offers to grant a bundle for a scaffolded package that has one, and applies what was picked', async () => {
    mockHappyPath(['audio']);
    const bundle = {
      id: 'recording',
      label: 'Background audio recording',
      warning: 'w',
      nextSteps: 'n',
    };
    vi.mocked(resolveGrantSelection).mockResolvedValue([
      { packageName: '@symbiote-native/audio', bundle },
    ]);

    await runNew(BASE_PARSED);

    expect(applyBundle).toHaveBeenCalledWith('/fake/my-app', bundle);
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

  it('applies nothing when the developer declines every offered bundle', async () => {
    mockHappyPath(['audio']);
    vi.mocked(resolveGrantSelection).mockResolvedValue([]);

    await runNew(BASE_PARSED);

    expect(applyBundle).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).not.toContain('grant');
  });

  // why: same non-interactive fallback as `add` — a piped/CI `new` can't pop a multiselect, so it
  // falls back to the printed hint instead of aborting the whole scaffold.
  it('falls back to a printed hint when resolveGrantSelection cannot ask (non-interactive)', async () => {
    mockHappyPath(['audio']);
    vi.mocked(resolveGrantSelection).mockRejectedValue(
      new CliUsageError('not interactive'),
    );

    await runNew(BASE_PARSED);

    expect(applyBundle).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).toContain('@symbiote-native/cli grant audio');
  });

  it('does not ask or hint at `grant` for a package with no optional manifest bundle', async () => {
    mockHappyPath(['battery']);

    await runNew(BASE_PARSED);

    expect(resolveGrantSelection).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).not.toContain('grant');
  });

  it('does not ask or hint at `grant` when no Expo package was selected', async () => {
    mockHappyPath([]);

    await runNew(BASE_PARSED);

    expect(resolveGrantSelection).not.toHaveBeenCalled();
    const outroText = vi
      .mocked(clack.outro)
      .mock.calls.map(([message]) => message)
      .join('\n');
    expect(outroText).not.toContain('grant');
  });

  // why: `new` never runs `git init` unasked — the developer might already have their own git
  // workflow (a monorepo, a template they'll copy in by hand) that a silent init would surprise.
  describe('git init offer', () => {
    it('does not ask when the scaffold is already a git repository', async () => {
      mockHappyPath();
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await runNew(BASE_PARSED);

      expect(resolveGitInit).not.toHaveBeenCalled();
      expect(tryGitInit).not.toHaveBeenCalled();
    });

    // why: `new` never commits on the developer's behalf (their call what goes in, what message)
    // — only the repository itself gets created.
    it('initializes git and reports it when accepted, without committing', async () => {
      mockHappyPath();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(resolveGitInit).mockResolvedValue(true);
      vi.mocked(tryGitInit).mockReturnValue(true);

      await runNew(BASE_PARSED);

      expect(tryGitInit).toHaveBeenCalledWith('/fake/my-app');
      const outroText = vi
        .mocked(clack.outro)
        .mock.calls.map(([message]) => message)
        .join('\n');
      expect(outroText).not.toContain('git add -A');
    });

    it('does not init and keeps the manual instructions when declined', async () => {
      mockHappyPath();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(resolveGitInit).mockResolvedValue(false);

      await runNew(BASE_PARSED);

      expect(tryGitInit).not.toHaveBeenCalled();
      const outroText = vi
        .mocked(clack.outro)
        .mock.calls.map(([message]) => message)
        .join('\n');
      expect(outroText).toContain('git init && git add -A');
    });

    // why: a missing `git` binary must fall back to the manual instructions, not report success
    // for a repository that was never actually created.
    it('falls back to the manual instructions when the accepted git init itself fails', async () => {
      mockHappyPath();
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(resolveGitInit).mockResolvedValue(true);
      vi.mocked(tryGitInit).mockReturnValue(false);

      await runNew(BASE_PARSED);

      const outroText = vi
        .mocked(clack.outro)
        .mock.calls.map(([message]) => message)
        .join('\n');
      expect(outroText).toContain('git init && git add -A');
    });
  });
});
