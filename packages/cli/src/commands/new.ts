import * as fs from 'node:fs';
import * as path from 'node:path';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import type { IParsedCommand } from '../cli.js';
import { getCommand } from '../get-command.js';
import { isEmptyDir, scaffoldApp } from '../generate.js';
import {
  resolveAppName,
  resolveBundleId,
  resolveFeatures,
  resolveFramework,
  resolveOverwrite,
  resolvePackageManager,
  resolveStyling,
  resolveVueFlavor,
} from '../prompts.js';
import { sanitizeNativeAppName } from '../utils/native-identity.js';

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

  clack.outro(
    [
      `Scaffolded "${appName}" at ${root}.`,
      '',
      ...(appName === '.' ? [] : [pc.bold(pc.green(`  cd ${appName}`))]),
      pc.bold(pc.green(`  ${getCommand(packageManager, 'install')}`)),
      pc.bold(pc.green(`  ${getCommand(packageManager, 'dev')}`)),
      ...(hasGitDir
        ? []
        : [
            '',
            'Not a git repository yet:',
            pc.bold(
              pc.green(
                '  git init && git add -A && git commit -m "initial commit"',
              ),
            ),
          ]),
    ].join('\n'),
  );
}
