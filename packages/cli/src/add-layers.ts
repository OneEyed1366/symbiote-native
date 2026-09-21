import * as fs from 'node:fs';
import * as path from 'node:path';
import { templatesRoot } from './generate.js';
import type { IAddLayerName, IFramework } from './types.js';
import { applyExpoModulesAndroidManifest } from './utils/apply-expo-modules-manifest.js';
import { applyExpoModulesInfoPlist } from './utils/apply-expo-modules-plist.js';
import { applyExpoModulesPodfileAutolinking } from './utils/apply-expo-modules-podfile-autolinking.js';
import { applyExpoModulesPodfilePlatform } from './utils/apply-expo-modules-podfile.js';
import { applyExpoModulesXcodeDeploymentTarget } from './utils/apply-expo-modules-xcode-deployment-target.js';
import { applyBootsplashLogo } from './utils/apply-bootsplash-logo.js';
import { applySplashScreenAppDelegate } from './utils/apply-splash-screen-app-delegate.js';
import { applySplashScreenAppHide } from './utils/apply-splash-screen-hide.js';
import { applySplashScreenMainActivity } from './utils/apply-splash-screen-main-activity.js';
import { applySplashScreenManifest } from './utils/apply-splash-screen-manifest.js';
import { applySplashScreenStyles } from './utils/apply-splash-screen-styles.js';
import { renderTemplate } from './utils/render-template.js';

export type IAddLayersOptions = {
  readonly root: string;
  readonly framework: IFramework;
  readonly layers: readonly IAddLayerName[];
  // Injected rather than resolved in here (TTY confirm / --force / non-interactive skip) so this
  // module stays pure file-system logic, testable without mocking clack — the policy lives in
  // commands/add.ts, which is the only caller that knows about flags and the terminal.
  readonly confirmTestingOverwrite: () => Promise<boolean>;
};

export type IAddLayersResult = {
  readonly appliedLayers: readonly IAddLayerName[];
  readonly skippedLayers: readonly IAddLayerName[];
};

// Dependency-only layers: a package.json.fragment.json merge is the whole native + JS wiring
// (see templates/layers/README.md) — nothing else to touch, so nothing else to protect.
function applyDependencyOnlyLayer(root: string, layerName: string): void {
  renderTemplate(
    path.join(templatesRoot, 'layers', layerName, 'package.json.fragment.json'),
    path.join(root, 'package.json.fragment.json'),
  );
}

// The one v1 layer with native files to reconcile against an already-real, possibly customized
// app — both apply-expo-modules-* utils are idempotent text-splices, never a whole-file overlay,
// so they're safe to run against a real AndroidManifest.xml/Info.plist. Guarded by existence: an
// app with no ios/ or android/ tree at all (unusual, but not this function's job to police) is
// left alone rather than crashing on a missing path.
function applyExpoModulesLayer(root: string): void {
  applyDependencyOnlyLayer(root, 'expo-modules');
  if (
    fs.existsSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'))
  ) {
    applyExpoModulesAndroidManifest(root);
  }
  if (fs.existsSync(path.join(root, 'ios'))) {
    applyExpoModulesInfoPlist(root);
    applyExpoModulesPodfilePlatform(root);
    applyExpoModulesPodfileAutolinking(root);
    applyExpoModulesXcodeDeploymentTarget(root);
  }
}

// The one other layer with native files: all 5 splices are idempotent text-splices against the
// real files (never a whole-file overlay, same reasoning as expo-modules above) — see each
// util's own comment for the "already customized / already applied" cases it guards against.
// The App-source hide() splice matches `new`'s wiring (apply-splash-screen-hide.ts) — the native
// splash screen never hides itself, so without it a real app freezes on the splash screen forever.
function applySplashScreenLayer(root: string, framework: IFramework): void {
  applyDependencyOnlyLayer(root, 'splash-screen');
  applySplashScreenManifest(root);
  applySplashScreenStyles(root);
  applySplashScreenMainActivity(root);
  applySplashScreenAppDelegate(root);
  applySplashScreenAppHide(root, { framework });
  // Corrects the logo for an app scaffolded before generate.ts started framework-branching it
  // (or one whose `new` never picked --splash-screen, so Android's BootTheme never wired the
  // drawable in) — same overlay `new` now applies unconditionally.
  applyBootsplashLogo(root, templatesRoot, framework);
}

// detox.config.js + e2e/* are new files, not user source — but once added once, a developer may
// have customized them, so a second `add --testing` must not silently clobber them. Returns
// whether it actually wrote the files, so the caller can report skipped vs. applied.
async function applyTestingLayer(
  root: string,
  framework: IFramework,
  confirmOverwrite: () => Promise<boolean>,
): Promise<boolean> {
  const testingLayerRoot = path.join(templatesRoot, 'layers', 'testing');
  const fragmentName = framework === 'angular' ? 'angular' : 'base';
  renderTemplate(
    path.join(
      testingLayerRoot,
      'fragment',
      fragmentName,
      'package.json.fragment.json',
    ),
    path.join(root, 'package.json.fragment.json'),
  );

  const detoxConfigPath = path.join(root, 'detox.config.js');
  const e2eDirPath = path.join(root, 'e2e');
  const alreadyExists =
    fs.existsSync(detoxConfigPath) || fs.existsSync(e2eDirPath);

  if (alreadyExists && !(await confirmOverwrite())) return false;

  renderTemplate(
    path.join(testingLayerRoot, 'detox.config.js'),
    detoxConfigPath,
  );
  renderTemplate(path.join(testingLayerRoot, 'e2e'), e2eDirPath, {
    hasTypescript: true,
  });
  return true;
}

export async function addLayersToApp(
  options: IAddLayersOptions,
): Promise<IAddLayersResult> {
  const appliedLayers: IAddLayerName[] = [];
  const skippedLayers: IAddLayerName[] = [];

  for (const layer of options.layers) {
    if (layer === 'testing') {
      const applied = await applyTestingLayer(
        options.root,
        options.framework,
        options.confirmTestingOverwrite,
      );
      (applied ? appliedLayers : skippedLayers).push(layer);
      continue;
    }
    if (layer === 'expo-modules') {
      applyExpoModulesLayer(options.root);
    } else if (layer === 'splash-screen') {
      applySplashScreenLayer(options.root, options.framework);
    } else {
      applyDependencyOnlyLayer(options.root, layer);
    }
    appliedLayers.push(layer);
  }

  return { appliedLayers, skippedLayers };
}
