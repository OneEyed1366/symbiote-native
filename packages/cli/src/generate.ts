import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveJsTemplateDir } from './template-dir.js';
import type {
  IFramework,
  IPackageManager,
  IStylingOption,
  IVueFlavor,
} from './types.js';
import { applyAppIdentity } from './utils/apply-app-identity.js';
import { applyBootsplashLogo } from './utils/apply-bootsplash-logo.js';
import { applyExpoModulesAndroidManifest } from './utils/apply-expo-modules-manifest.js';
import { applyExpoModulesPodfileAutolinking } from './utils/apply-expo-modules-podfile-autolinking.js';
import { applyExpoModulesPodfilePlatform } from './utils/apply-expo-modules-podfile.js';
import { applyExpoModulesXcodeDeploymentTarget } from './utils/apply-expo-modules-xcode-deployment-target.js';
import { applySplashScreenAppHide } from './utils/apply-splash-screen-hide.js';
import { applyStyling } from './utils/apply-styling.js';
import type { IExpoPackageLayerName } from './expo-package-layers.js';
import { sanitizeNativeAppName } from './utils/native-identity.js';
import { toValidPackageName } from './utils/package-name.js';
import { renderTemplate } from './utils/render-template.js';

export type IScaffoldOptions = {
  readonly appName: string;
  readonly framework: IFramework;
  readonly vueFlavor: IVueFlavor | undefined;
  readonly hasTypescript: boolean;
  readonly bundleId: string;
  readonly hasExpoModules: boolean;
  readonly hasNavigation: boolean;
  readonly hasTesting: boolean;
  readonly hasSplashScreen: boolean;
  readonly hasSlider: boolean;
  // Optional (default: none) so every existing call site that only knows the 5 hand-named
  // features keeps compiling unchanged.
  readonly expoPackages?: ReadonlySet<IExpoPackageLayerName>;
  readonly styling: IStylingOption;
  readonly packageManager: IPackageManager;
};

export class TargetDirNotEmptyError extends Error {
  constructor(public readonly targetDir: string) {
    super(`"${targetDir}" already exists and is not empty.`);
    this.name = 'TargetDirNotEmptyError';
  }
}

// Two real runtime layouts put this file at a different depth from templates/: `tsc --build`
// (dev) emits build/generate.js one level under the package root, same depth as src/generate.ts
// — `../templates` from there. The published/`npm link`ed artifact is the rolldown bundle.js
// (build.config.ts), which sits AT the package root as bundle.js's own sibling to templates/ (see
// package.json's `files`) — `./templates` from there. Checking which one exists on disk is
// simpler and more robust than threading a build-mode flag through.
function resolveTemplatesRoot(): string {
  const packageDir = path.dirname(fileURLToPath(import.meta.url));
  const sibling = path.join(packageDir, 'templates');
  return fs.existsSync(sibling)
    ? sibling
    : path.resolve(packageDir, '../templates');
}

// Exported for reuse by add-layers.ts: `add` overlays the same templates/layers/* content onto
// an already-existing app, not a freshly scaffolded one.
export const templatesRoot = resolveTemplatesRoot();

// A directory holding only a `.git` folder (the user ran `git init` before scaffolding, or
// deliberately picked an already-versioned empty target) counts as empty — mirrors create-vue's
// canSkipEmptying. Without this carve-out, scaffolding into that directory would prompt to "empty
// it" and an overwrite confirmation would rm -rf the user's existing git history along with it.
export function isEmptyDir(dir: string): boolean {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir);
  return (
    entries.length === 0 || (entries.length === 1 && entries[0] === '.git')
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

  // Seed package.json's identity before any layer merges onto it — every fragment assumes a
  // package.json already exists at the root (see renderTemplate's package.json.fragment.json
  // handling). The DIRECTORY can be named anything the filesystem accepts ("My Cool App"), but
  // package.json's own "name" is a real npm package name — sanitized the same way
  // sanitizeNativeAppName already handles the (differently-shaped) Android/iOS identifier below,
  // so `npm install` never fails on a name this same command just wrote.
  //
  // appName === "." (scaffold into the current directory, the create-vue "." idiom) is the one
  // input toValidPackageName strips down to "" — it deletes the leading dot and has nothing left.
  // Name from the resolved directory instead in that case, same as every other appName.
  const packageNameSource =
    options.appName === '.' ? path.basename(root) : options.appName;
  fs.writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(
      {
        name: toValidPackageName(packageNameSource),
        version: '0.0.1',
        private: true,
      },
      null,
      2,
    )}\n`,
  );

  renderTemplate(path.join(templatesRoot, 'native'), root, {
    hasTypescript: options.hasTypescript,
  });
  renderTemplate(path.join(templatesRoot, 'js', jsTemplateDir), root, {
    hasTypescript: options.hasTypescript,
  });
  // iOS shows BootSplash.storyboard as the launch screen unconditionally (Info.plist's
  // UILaunchStoryboardName), regardless of --splash-screen — so the logo must match the chosen
  // framework from `new` on, not just when the splash-screen layer is picked.
  applyBootsplashLogo(root, templatesRoot, options.framework);

  // Any selected Expo-backed package (battery, sensors, …) needs the same `expo`/autolinking
  // wiring `--expo-modules` provides — computed here, not trusted to every caller, so
  // `scaffoldApp` stays correct even if a future caller sets `expoPackages` without also setting
  // `hasExpoModules` (prompts.ts's resolveFeatures already does both, redundantly but harmlessly).
  const hasExpoModules =
    options.hasExpoModules || (options.expoPackages?.size ?? 0) > 0;

  if (options.hasNavigation) {
    const navigationLayerRoot = path.join(
      templatesRoot,
      'layers',
      'navigation',
    );
    // package.json.fragment.json is merged directly (not the whole layer dir) because the layer
    // also holds an `app/<framework>` subtree (a 2-screen Stack demo overwriting the base App) —
    // recursively copying the whole directory would land every framework's app/ folder onto the
    // generated root instead of just the selected one.
    renderTemplate(
      path.join(navigationLayerRoot, 'package.json.fragment.json'),
      path.join(root, 'package.json.fragment.json'),
    );
    renderTemplate(path.join(navigationLayerRoot, 'app', jsTemplateDir), root, {
      hasTypescript: options.hasTypescript,
    });
  }
  if (hasExpoModules) {
    // Whole-directory copy, not just the package.json fragment: this layer also overlays
    // ios/Canary/Info.plist with the NSFaceIDUsageDescription/NSMotionUsageDescription/
    // NSUserTrackingUsageDescription usage-description strings its bundled local-auth/sensors/
    // tracking-transparency modules need — iOS rejects those APIs without them, App Store review
    // included (see examples/expo-react/ios/CanaryExpo/Info.plist, the reference this was copied
    // from). Runs before --splash-screen below, but that layer never touches Info.plist, so the
    // ordering doesn't matter here.
    renderTemplate(path.join(templatesRoot, 'layers', 'expo-modules'), root);
  }
  if (options.hasSplashScreen) {
    const splashScreenLayerRoot = path.join(
      templatesRoot,
      'layers',
      'splash-screen',
    );
    // The base native/ios+android files ship WITHOUT react-native-bootsplash wired (see their own
    // comments) precisely so this stays optional — this overlay swaps in the with-bootsplash
    // MainActivity.kt/AndroidManifest.xml/styles.xml/AppDelegate.swift on top, and the fragment
    // adds the one dependency that makes them compile.
    renderTemplate(
      path.join(splashScreenLayerRoot, 'package.json.fragment.json'),
      path.join(root, 'package.json.fragment.json'),
    );
    renderTemplate(path.join(splashScreenLayerRoot, 'native'), root);
  }
  if (options.hasSlider) {
    // Autolinking is automatic (the package's own react-native.config.cjs + podspec, see
    // packages/slider/README.md "Packaging — one dependency, not two") — no native/ files to
    // overlay, unlike splash-screen. The dependency declaration IS the whole native wiring.
    renderTemplate(
      path.join(
        templatesRoot,
        'layers',
        'slider',
        'package.json.fragment.json',
      ),
      path.join(root, 'package.json.fragment.json'),
    );
  }
  // Every selected Expo-backed package (battery, sensors, …) is dependency-only, same shape as
  // slider above — one package.json.fragment.json merge per package, no native files. `hasExpoModules`
  // above is already folded to true whenever this set is non-empty, so the `expo`/autolinking
  // block runs alongside these regardless of what the caller passed.
  for (const layerName of options.expoPackages ?? []) {
    renderTemplate(
      path.join(
        templatesRoot,
        'layers',
        layerName,
        'package.json.fragment.json',
      ),
      path.join(root, 'package.json.fragment.json'),
    );
  }
  if (options.hasTesting) {
    const testingLayerRoot = path.join(templatesRoot, 'layers', 'testing');
    // Angular's e2e:build scripts need an `ngc` pass before Detox builds the native binary; every
    // other framework shares one generic fragment.
    const fragmentName = options.framework === 'angular' ? 'angular' : 'base';
    renderTemplate(
      path.join(
        testingLayerRoot,
        'fragment',
        fragmentName,
        'package.json.fragment.json',
      ),
      path.join(root, 'package.json.fragment.json'),
    );
    renderTemplate(
      path.join(testingLayerRoot, 'detox.config.js'),
      path.join(root, 'detox.config.js'),
    );
    // e2e/ is always TypeScript, independent of the app's own --javascript choice — it's a
    // separate ts-jest project with its own tsconfig, not part of the app bundle.
    renderTemplate(path.join(testingLayerRoot, 'e2e'), path.join(root, 'e2e'), {
      hasTypescript: true,
    });
  }

  if (hasExpoModules) {
    // Text-splice post-process, not part of the layer copy above — see that function's own
    // comment for why a third manifest overlay would silently lose --splash-screen's BootTheme
    // swap (or vice versa) depending on render order.
    applyExpoModulesAndroidManifest(root);
    // expo's own podspec requires iOS 16.4+; RN's own Podfile default (15.1) is below that and
    // `pod install` fails outright without this bump — see that function's own comment.
    applyExpoModulesPodfilePlatform(root);
    // `use_native_modules!` only autolinks RN's own modules; Expo modules need Expo's own
    // autolinking wired in — see that function's own comment for the exact build failure this
    // prevents (`'ExpoModulesCore/Platform.h' file not found`).
    applyExpoModulesPodfileAutolinking(root);
    // The Podfile's `platform :ios` line only sets CocoaPods' own target — the app's .xcodeproj
    // keeps its own (lower) deployment target unless raised here too, see that function's comment.
    applyExpoModulesXcodeDeploymentTarget(root);
  }

  // Runs after the navigation layer so a non-default styling choice overwrites the FINAL
  // (possibly nav-shaped) App/MenuScreen/DetailsScreen files, not the pre-nav base ones.
  applyStyling(root, {
    styling: options.styling,
    jsTemplateDir,
    hasNavigation: options.hasNavigation,
    hasTypescript: options.hasTypescript,
    templatesRoot,
  });

  if (options.hasSplashScreen) {
    // Runs after applyStyling: css-modules/stylesheet overlay a whole new App file, which would
    // silently erase this splice if it ran first — see that function's own comment.
    applySplashScreenAppHide(root, { framework: options.framework });
  }

  applyAppIdentity(root, {
    nativeAppName: sanitizeNativeAppName(options.appName),
    bundleId: options.bundleId,
  });

  return root;
}
