import * as fs from 'node:fs';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import type { IParsedCommand } from '../cli.js';
import { expoPackagesWithOptionalManifestBundles } from '../expo-package-layers.js';
import { getCommand } from '../get-command.js';
import { isEmptyDir, scaffoldApp, type IScaffoldOptions } from '../generate.js';
import {
  resolveAppName,
  resolveBundleId,
  resolveFeatures,
  resolveFramework,
  resolveGitInit,
  resolveOverwrite,
  resolvePackageManager,
  resolveStyling,
  resolveVueFlavor,
} from '../prompts.js';
import { VUE_FRAMEWORK } from '../types.js';
import { tryGitInit } from '../utils/git-init.js';
import { sanitizeNativeAppName } from '../utils/native-identity.js';
import { offerGrants } from './offer-grants.js';
import { reanimatedNotes } from './reanimated-notes.js';

type INewCommand = Extract<IParsedCommand, { kind: 'new' }>;

async function clearTargetDir(
  appName: string,
  hasForce: boolean,
): Promise<void> {
  const targetDir = path.resolve(process.cwd(), appName);
  if (isEmptyDir(targetDir)) return;
  const shouldOverwrite = await resolveOverwrite(targetDir, hasForce);
  if (!shouldOverwrite) {
    clack.cancel('Cancelled.');
    process.exit(1);
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
}

async function resolveScaffoldOptions(
  appName: string,
  parsed: INewCommand,
): Promise<IScaffoldOptions> {
  const framework = await resolveFramework(parsed.framework);
  const vueFlavor =
    framework === VUE_FRAMEWORK
      ? await resolveVueFlavor(parsed.vueFlavor)
      : undefined;
  const bundleId = await resolveBundleId(
    parsed.bundleId,
    sanitizeNativeAppName(appName),
  );
  const features = await resolveFeatures(framework, parsed);
  const styling = await resolveStyling(parsed.styling);
  const packageManager = await resolvePackageManager(parsed.packageManager);
  return {
    ...features,
    appName,
    framework,
    vueFlavor,
    bundleId,
    styling,
    packageManager,
  };
}

// Never commits on the developer's behalf, it only creates the repository
// So what goes into the first commit, and its message, stays their call
// Skipped with no prompt when the target is already a repo, e.g. `new .` inside one
async function gitInitLines(root: string): Promise<string[]> {
  if (fs.existsSync(path.join(root, '.git'))) return [];
  if ((await resolveGitInit()) && tryGitInit(root)) {
    return ['', pc.dim('Initialized an empty git repository.')];
  }
  return [
    '',
    'Not a git repository yet:',
    pc.bold(
      pc.green('  git init && git add -A && git commit -m "initial commit"'),
    ),
  ];
}

export async function runNew(parsed: INewCommand): Promise<void> {
  clack.intro('@symbiote-native/cli new');

  const appName = await resolveAppName(parsed.appName);
  await clearTargetDir(appName, parsed.hasForce);
  const options = await resolveScaffoldOptions(appName, parsed);
  const root = scaffoldApp(options);

  const lines: string[] = [
    `Scaffolded "${appName}" at ${root}.`,
    '',
    ...(appName === '.' ? [] : [pc.bold(pc.green(`  cd ${appName}`))]),
    pc.bold(pc.green(`  ${getCommand(options.packageManager, 'install')}`)),
    pc.bold(pc.green(`  ${getCommand(options.packageManager, 'dev')}`)),
    ...(options.hasReanimated ? reanimatedNotes(false) : []),
    ...(await gitInitLines(root)),
    ...(await offerGrants(
      root,
      expoPackagesWithOptionalManifestBundles(options.expoPackages ?? []),
    )),
  ];
  clack.outro(lines.join('\n'));
}
