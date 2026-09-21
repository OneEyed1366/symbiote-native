import * as fs from 'node:fs';
import * as path from 'node:path';
import { findIosAppDir } from './find-ios-app-dir.js';

const CUSTOMIZE_OPEN =
  /override func customize\(_ rootView: RCTRootView\) \{\n/;

// Every RN AppDelegate.swift imports React — a stable anchor to insert the RNBootSplash import
// next to, independent of whatever else the app has already added above or below it.
const REACT_IMPORT = 'import React\n';

export function applySplashScreenAppDelegate(root: string): void {
  const iosAppDir = findIosAppDir(root);
  if (iosAppDir === undefined) return;
  const appDelegatePath = path.join(iosAppDir, 'AppDelegate.swift');
  if (!fs.existsSync(appDelegatePath)) return;

  const source = fs.readFileSync(appDelegatePath, 'utf8');
  if (source.includes('RNBootSplash.initWithStoryboard(')) return; // idempotent
  if (!source.includes(REACT_IMPORT)) return; // unrecognized shape, don't guess

  const updated = source.includes('import RNBootSplash')
    ? source
    : source.replace(REACT_IMPORT, `${REACT_IMPORT}import RNBootSplash\n`);

  const withInit = CUSTOMIZE_OPEN.test(updated)
    ? updated.replace(
        CUSTOMIZE_OPEN,
        match =>
          `${match}    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)\n`,
      )
    : updated.replace(
        /class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate \{\n/,
        match =>
          `${match}  override func customize(_ rootView: RCTRootView) {\n` +
          '    super.customize(rootView)\n' +
          '    RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)\n' +
          '  }\n\n',
      );

  fs.writeFileSync(appDelegatePath, withInit);
}
