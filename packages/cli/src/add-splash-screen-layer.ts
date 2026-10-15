import { templatesRoot } from './templates-root.js';
import type { IFramework } from './types.js';
import { applyBootsplashLogo } from './utils/apply-bootsplash-logo.js';
import { applySplashScreenAppDelegate } from './utils/apply-splash-screen-app-delegate.js';
import { applySplashScreenAppHide } from './utils/apply-splash-screen-hide.js';
import { applySplashScreenMainActivity } from './utils/apply-splash-screen-main-activity.js';
import { applySplashScreenManifest } from './utils/apply-splash-screen-manifest.js';
import { applySplashScreenStyles } from './utils/apply-splash-screen-styles.js';
import { mergeLayerFragment } from './utils/merge-layer-fragment.js';

// The other layer with native files: all five splices are idempotent text splices on the real files
// The App-source `hide()` splice matches `new`'s wiring, as the native splash never hides itself
export function applySplashScreenLayer(
  root: string,
  framework: IFramework,
): void {
  mergeLayerFragment(root, 'splash-screen');
  applySplashScreenManifest(root);
  applySplashScreenStyles(root);
  applySplashScreenMainActivity(root);
  applySplashScreenAppDelegate(root);
  applySplashScreenAppHide(root, { framework });
  // Corrects the logo of an app scaffolded before generate.ts branched it by framework
  // It is the same overlay `new` applies unconditionally
  applyBootsplashLogo(root, templatesRoot, framework);
}
