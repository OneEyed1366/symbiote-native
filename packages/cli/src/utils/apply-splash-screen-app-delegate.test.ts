import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySplashScreenAppDelegate } from './apply-splash-screen-app-delegate.js';

const APP_DELEGATE_NO_CUSTOMIZE = `import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }
}
`;

const APP_DELEGATE_WITH_CUSTOMIZE = `import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func customize(_ rootView: RCTRootView) {
    super.customize(rootView)
    print("hello from a real app's own customization")
  }
}
`;

describe('applySplashScreenAppDelegate', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setup(content: string, appDirName = 'RealApp'): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-appdelegate-'),
    );
    tmpDirs.push(root);
    const dir = path.join(root, 'ios', appDirName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'AppDelegate.swift'), content);
    return root;
  }

  function read(root: string, appDirName = 'RealApp'): string {
    return fs.readFileSync(
      path.join(root, 'ios', appDirName, 'AppDelegate.swift'),
      'utf8',
    );
  }

  it('adds a whole new customize() override when ReactNativeDelegate has none', () => {
    const root = setup(APP_DELEGATE_NO_CUSTOMIZE);
    applySplashScreenAppDelegate(root);
    const source = read(root);
    expect(source).toContain('import RNBootSplash');
    expect(source).toContain(
      'RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)',
    );
    expect(source).toContain(
      'override func customize(_ rootView: RCTRootView)',
    );
  });

  // A real app is more likely than a fresh scaffold to already override customize() for its own
  // reasons — the init call must be inserted into it, not replace it (Swift doesn't allow
  // declaring the same override twice).
  it("inserts into an EXISTING customize() override without disturbing the developer's own code", () => {
    const root = setup(APP_DELEGATE_WITH_CUSTOMIZE);
    applySplashScreenAppDelegate(root);
    const source = read(root);
    expect(source).toContain(
      'RNBootSplash.initWithStoryboard("BootSplash", rootView: rootView)',
    );
    expect(source).toContain(
      'print("hello from a real app\'s own customization")',
    );
    expect(source.match(/override func customize/g)?.length).toBe(1);
  });

  it('finds AppDelegate.swift under the real, non-"Canary" app directory', () => {
    const root = setup(APP_DELEGATE_NO_CUSTOMIZE, 'SomeOtherAppName');
    applySplashScreenAppDelegate(root);
    expect(read(root, 'SomeOtherAppName')).toContain(
      'RNBootSplash.initWithStoryboard(',
    );
  });

  it('is idempotent — applying twice does not duplicate the init call or the import', () => {
    const root = setup(APP_DELEGATE_NO_CUSTOMIZE);
    applySplashScreenAppDelegate(root);
    applySplashScreenAppDelegate(root);
    const source = read(root);
    expect(source.split('RNBootSplash.initWithStoryboard(').length - 1).toBe(1);
    expect(source.split('import RNBootSplash').length - 1).toBe(1);
  });

  it('does nothing when there is no AppDelegate.swift at all', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-splash-appdelegate-'),
    );
    tmpDirs.push(root);
    expect(() => applySplashScreenAppDelegate(root)).not.toThrow();
  });
});
