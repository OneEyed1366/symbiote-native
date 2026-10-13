import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyExpoModulesLayer } from './add-expo-modules-layer.js';
import { applySplashScreenLayer } from './add-splash-screen-layer.js';
import { templatesRoot } from './templates-root.js';
import {
  ANGULAR_FRAMEWORK,
  type IAddLayerName,
  type IFramework,
} from './types.js';
import { applyReanimatedLayer } from './utils/apply-reanimated-layer.js';
import { mergeLayerFragment } from './utils/merge-layer-fragment.js';
import { renderTemplate } from './utils/render-template.js';

const TESTING_LAYER = 'testing' satisfies IAddLayerName;
const REANIMATED_LAYER = 'reanimated' satisfies IAddLayerName;

export type IAddLayersOptions = {
  readonly root: string;
  readonly framework: IFramework;
  readonly layers: readonly IAddLayerName[];
  // Injected, so this module stays file-system logic that tests without mocking clack
  // The policy (TTY confirm, --force, non-interactive skip) lives in commands/add.ts
  readonly confirmTestingOverwrite: () => Promise<boolean>;
};

export type IAddLayersResult = {
  readonly appliedLayers: readonly IAddLayerName[];
  readonly skippedLayers: readonly IAddLayerName[];
  // True when the app's babel config had no plugins list to put the worklets plugin in
  readonly hasManualBabelStep: boolean;
};

// detox.config.js and e2e/* are new files, but a developer may customize them after the first add
// So a second `add --testing` must not clobber them, and this says whether it wrote anything
async function applyTestingLayer(
  root: string,
  framework: IFramework,
  confirmOverwrite: () => Promise<boolean>,
): Promise<boolean> {
  const testingLayerRoot = path.join(templatesRoot, 'layers', TESTING_LAYER);
  const fragmentName = framework === ANGULAR_FRAMEWORK ? 'angular' : 'base';
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

// Every layer but `testing` and `reanimated` is wired by its fragment or its own text splices
function applyPlainLayer(
  root: string,
  framework: IFramework,
  layer: IAddLayerName,
): void {
  if (layer === 'expo-modules') applyExpoModulesLayer(root);
  else if (layer === 'splash-screen') applySplashScreenLayer(root, framework);
  else mergeLayerFragment(root, layer);
}

export async function addLayersToApp(
  options: IAddLayersOptions,
): Promise<IAddLayersResult> {
  // Asked once up front, so the loop below stays synchronous and keeps the order of `layers`
  const isTestingApplied = options.layers.includes(TESTING_LAYER)
    ? await applyTestingLayer(
        options.root,
        options.framework,
        options.confirmTestingOverwrite,
      )
    : false;

  const appliedLayers: IAddLayerName[] = [];
  const skippedLayers: IAddLayerName[] = [];
  let hasManualBabelStep = false;
  for (const layer of options.layers) {
    if (layer === TESTING_LAYER && !isTestingApplied) {
      skippedLayers.push(layer);
      continue;
    }
    if (layer === REANIMATED_LAYER) {
      hasManualBabelStep = !applyReanimatedLayer(options.root);
    } else if (layer !== TESTING_LAYER) {
      applyPlainLayer(options.root, options.framework, layer);
    }
    appliedLayers.push(layer);
  }

  return { appliedLayers, skippedLayers, hasManualBabelStep };
}
