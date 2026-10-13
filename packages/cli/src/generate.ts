import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  applyScaffoldLayers,
  type IScaffoldLayerOptions,
} from './scaffold-layers.js';
import { templatesRoot } from './templates-root.js';
import { resolveJsTemplateDir } from './template-dir.js';
import type { IPackageManager, IStylingOption, IVueFlavor } from './types.js';
import { applyAppIdentity } from './utils/apply-app-identity.js';
import { applyBootsplashLogo } from './utils/apply-bootsplash-logo.js';
import { applySplashScreenAppHide } from './utils/apply-splash-screen-hide.js';
import { applyStyling } from './utils/apply-styling.js';
import { sanitizeNativeAppName } from './utils/native-identity.js';
import { toValidPackageName } from './utils/package-name.js';
import { renderTemplate } from './utils/render-template.js';

export type IScaffoldOptions = IScaffoldLayerOptions & {
  readonly appName: string;
  readonly vueFlavor: IVueFlavor | undefined;
  readonly bundleId: string;
  readonly styling: IStylingOption;
  readonly packageManager: IPackageManager;
};

export class TargetDirNotEmptyError extends Error {
  constructor(public readonly targetDir: string) {
    super(`"${targetDir}" already exists and is not empty.`);
    this.name = 'TargetDirNotEmptyError';
  }
}

// A directory holding only a `.git` folder counts as empty, like create-vue's `canSkipEmptying`
// Otherwise scaffolding there would offer to empty it, and an overwrite would delete the history
export function isEmptyDir(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir);
  return (
    entries.length === 0 || (entries.length === 1 && entries[0] === '.git')
  );
}

// Every layer merges onto this file, so it has to exist first
// The directory may be named anything, but "name" is a real npm package name, so it is sanitized
function writeSeedPackageJson(root: string, appName: string): void {
  // `toValidPackageName` strips "." (scaffold into the current directory) down to nothing
  // So that case takes its name from the directory
  const nameSource = appName === '.' ? path.basename(root) : appName;
  const seed = {
    name: toValidPackageName(nameSource),
    version: '0.0.1',
    private: true,
  };
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(seed, null, 2)}\n`,
  );
}

export function scaffoldApp(options: IScaffoldOptions): string {
  const root = path.resolve(process.cwd(), options.appName);
  const jsTemplateDir = resolveJsTemplateDir(
    options.framework,
    options.vueFlavor,
  );

  if (!isEmptyDir(root)) {
    throw new TargetDirNotEmptyError(root);
  }
  fs.mkdirSync(root, { recursive: true });
  writeSeedPackageJson(root, options.appName);

  const { hasTypescript } = options;
  renderTemplate(path.join(templatesRoot, 'native'), root, { hasTypescript });
  renderTemplate(path.join(templatesRoot, 'js', jsTemplateDir), root, {
    hasTypescript,
  });
  // iOS shows BootSplash.storyboard as the launch screen whatever `--splash-screen` says
  // So the logo has to match the framework from `new` on, not only when that layer is picked
  applyBootsplashLogo(root, templatesRoot, options.framework);

  applyScaffoldLayers(root, options, jsTemplateDir);

  // Runs after the navigation layer, so a non-default styling overwrites the final App files
  applyStyling(root, {
    styling: options.styling,
    jsTemplateDir,
    hasNavigation: options.hasNavigation,
    hasTypescript,
    templatesRoot,
  });

  if (options.hasSplashScreen) {
    // Runs after `applyStyling`, as a css-modules or stylesheet overlay replaces the whole App file
    applySplashScreenAppHide(root, { framework: options.framework });
  }

  applyAppIdentity(root, {
    nativeAppName: sanitizeNativeAppName(options.appName),
    bundleId: options.bundleId,
  });

  return root;
}
