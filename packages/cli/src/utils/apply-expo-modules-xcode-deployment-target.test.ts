import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyExpoModulesXcodeDeploymentTarget } from './apply-expo-modules-xcode-deployment-target.js';

// Trimmed real shape: RN's app template sets IPHONEOS_DEPLOYMENT_TARGET in 4 build
// configurations (project Debug/Release + app-target Debug/Release), all at the same value.
const BASE_PBXPROJ = `		AAAAAAAA /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
			};
		};
		BBBBBBBB /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
			};
		};
		CCCCCCCC /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
			};
		};
		DDDDDDDD /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				IPHONEOS_DEPLOYMENT_TARGET = 15.1;
			};
		};
`;

describe('applyExpoModulesXcodeDeploymentTarget', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setupApp(
    pbxprojContent: string,
    appName = 'Canary',
  ): { root: string; pbxprojPath: string } {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-pbxproj-'),
    );
    tmpDirs.push(root);
    const projDir = path.join(root, 'ios', `${appName}.xcodeproj`);
    fs.mkdirSync(projDir, { recursive: true });
    const pbxprojPath = path.join(projDir, 'project.pbxproj');
    fs.writeFileSync(pbxprojPath, pbxprojContent);
    return { root, pbxprojPath };
  }

  // why: CocoaPods' `platform :ios` line only sets the deployment target FOR PODS — the app's own
  // .xcodeproj target keeps whatever IPHONEOS_DEPLOYMENT_TARGET RN's template set, independent of
  // the Podfile, so `xcodebuild` fails against ExpoModulesCore's higher minimum unless raised here.
  it('raises every IPHONEOS_DEPLOYMENT_TARGET below 16.4 to 16.4', () => {
    const { root, pbxprojPath } = setupApp(BASE_PBXPROJ);
    applyExpoModulesXcodeDeploymentTarget(root);
    const content = fs.readFileSync(pbxprojPath, 'utf8');
    expect(content.match(/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/g)).toBeNull();
    expect(content.match(/IPHONEOS_DEPLOYMENT_TARGET = 16\.4;/g)).toHaveLength(
      4,
    );
  });

  it('is idempotent — running it twice leaves the same 4 lines at 16.4', () => {
    const { root, pbxprojPath } = setupApp(BASE_PBXPROJ);
    applyExpoModulesXcodeDeploymentTarget(root);
    applyExpoModulesXcodeDeploymentTarget(root);
    const content = fs.readFileSync(pbxprojPath, 'utf8');
    expect(content.match(/IPHONEOS_DEPLOYMENT_TARGET = 16\.4;/g)).toHaveLength(
      4,
    );
  });

  it('leaves an already-higher explicit deployment target untouched', () => {
    const higher = BASE_PBXPROJ.replaceAll(
      'IPHONEOS_DEPLOYMENT_TARGET = 15.1;',
      'IPHONEOS_DEPLOYMENT_TARGET = 18.0;',
    );
    const { root, pbxprojPath } = setupApp(higher);
    applyExpoModulesXcodeDeploymentTarget(root);
    const content = fs.readFileSync(pbxprojPath, 'utf8');
    expect(content.match(/IPHONEOS_DEPLOYMENT_TARGET = 18\.0;/g)).toHaveLength(
      4,
    );
  });

  it('finds the .xcodeproj regardless of the app name', () => {
    const { root, pbxprojPath } = setupApp(BASE_PBXPROJ, 'MyCoolApp');
    applyExpoModulesXcodeDeploymentTarget(root);
    const content = fs.readFileSync(pbxprojPath, 'utf8');
    expect(content.match(/IPHONEOS_DEPLOYMENT_TARGET = 16\.4;/g)).toHaveLength(
      4,
    );
  });

  it('does nothing when there is no ios/*.xcodeproj', () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-pbxproj-'),
    );
    tmpDirs.push(root);
    expect(() => applyExpoModulesXcodeDeploymentTarget(root)).not.toThrow();
  });
});
