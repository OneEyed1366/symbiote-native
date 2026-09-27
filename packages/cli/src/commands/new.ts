import * as fs from 'node:fs';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import type { IParsedCommand } from '../cli.js';
import { CliUsageError } from '../errors.js';
import { expoPackagesWithOptionalManifestBundles } from '../expo-package-layers.js';
import { getCommand } from '../get-command.js';
import { isEmptyDir, scaffoldApp } from '../generate.js';
import {
  applyBundle,
  discoveredBundlesFromLayers,
  type IDiscoveredBundle,
} from '../grant-bundles.js';
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
} from '../prompts.js';
import { tryGitInit } from '../utils/git-init.js';
import { sanitizeNativeAppName } from '../utils/native-identity.js';
import { printGrantedNotes } from './grant-summary.js';

type INewCommand = Extract<IParsedCommand, { kind: 'new' }>;

export async function runNew(parsed: INewCommand): Promise<void> {
  clack.intro('@symbiote-native/cli new');

  const appName = await resolveAppName(parsed.appName);

  const targetDir = path.resolve(process.cwd(), appName);
  if (!isEmptyDir(targetDir)) {
    const shouldOverwrite = await resolveOverwrite(targetDir, parsed.hasForce);
    if (!shouldOverwrite) {
      clack.cancel('Cancelled.');
      process.exit(1);
    }
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  const framework = await resolveFramework(parsed.framework);
  const vueFlavor =
    framework === 'vue' ? await resolveVueFlavor(parsed.vueFlavor) : undefined;
  const bundleId = await resolveBundleId(
    parsed.bundleId,
    sanitizeNativeAppName(appName),
  );
  const {
    hasTypescript,
    hasNavigation,
    hasExpoModules,
    hasTesting,
    hasSplashScreen,
    hasSlider,
    expoPackages,
  } = await resolveFeatures(framework, parsed);
  const styling = await resolveStyling(parsed.styling);
  const packageManager = await resolvePackageManager(parsed.packageManager);

  const root = scaffoldApp({
    appName,
    framework,
    vueFlavor,
    hasTypescript,
    bundleId,
    hasExpoModules,
    hasNavigation,
    hasTesting,
    hasSplashScreen,
    hasSlider,
    expoPackages,
    styling,
    packageManager,
  });

  const hasGitDir = fs.existsSync(path.join(root, '.git'));

  const lines: string[] = [
    `Scaffolded "${appName}" at ${root}.`,
    '',
    ...(appName === '.' ? [] : [pc.bold(pc.green(`  cd ${appName}`))]),
    pc.bold(pc.green(`  ${getCommand(packageManager, 'install')}`)),
    pc.bold(pc.green(`  ${getCommand(packageManager, 'dev')}`)),
  ];
  // Never commits on the developer's behalf — only the repository itself, so what goes into the
  // first commit (and its message) stays their call. Skipped entirely (no prompt) when the target
  // is already a git repo — e.g. `new .` inside one, or the developer ran `git init` themselves
  // before scaffolding (see isEmptyDir's own carve-out for that directory shape).
  const gitInitialized =
    !hasGitDir && (await resolveGitInit()) && tryGitInit(root);
  if (gitInitialized) {
    lines.push('', pc.dim('Initialized an empty git repository.'));
  } else if (!hasGitDir) {
    lines.push(
      '',
      'Not a git repository yet:',
      pc.bold(
        pc.green('  git init && git add -A && git commit -m "initial commit"'),
      ),
    );
  }

  // Offered here — not just documented under a separate `grant` command the developer has to
  // already know about — because printing a command to run later is bad DX. applyBundle only
  // needs the app's own AndroidManifest.xml, which scaffoldApp already wrote; it doesn't need the
  // package to be installed yet, so this can apply the developer's choice immediately.
  const grantable = expoPackagesWithOptionalManifestBundles(expoPackages);
  if (grantable.length > 0) {
    const candidates = discoveredBundlesFromLayers(grantable);
    let granted: IDiscoveredBundle[] = [];
    let asked = false;
    try {
      granted = await resolveGrantSelection(candidates);
      asked = true;
    } catch (error) {
      // resolveGrantSelection's own documented contract: it fails fast when there is no terminal
      // to ask in (piped stdin, CI) — that must not abort the rest of `new`, just fall through to
      // the printed hint below so the developer still hears about it.
      if (!(error instanceof CliUsageError)) throw error;
    }

    if (granted.length > 0) {
      for (const entry of granted) applyBundle(root, entry.bundle);
      printGrantedNotes(granted);
      lines.push(
        '',
        `Granted: ${granted.map(entry => entry.bundle.label).join(', ')}.`,
      );
    } else if (!asked) {
      lines.push(
        '',
        `${grantable.map(layer => layer.label).join(', ')} also offer${grantable.length === 1 ? 's' : ''} optional, policy-sensitive Android permissions — after installing:`,
        ...grantable.map(layer =>
          pc.dim(`  npx @symbiote-native/cli grant ${layer.id}`),
        ),
      );
    }
  }

  clack.outro(lines.join('\n'));
}
