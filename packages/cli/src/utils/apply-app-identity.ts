import * as fs from 'node:fs';
import * as path from 'node:path';

export type IAppIdentity = {
  readonly nativeAppName: string;
  readonly bundleId: string;
};

// Every native/ + js/<framework>/app.json template file hardcodes the placeholder identity
// "Canary" / "com.canary" (see templates/native/README.md) — this walks the ALREADY-SCAFFOLDED
// tree (never templates/ itself) and substitutes the real identity in place. Case-sensitive: a
// bare lowercase "canary" is deliberately left alone (native/android/app/build.gradle has one in
// a code comment, and js/<fw>/index.js's header comment says "canary entry" meaning the concept —
// neither is the placeholder).
const TEXT_FILE_EXTENSIONS = new Set([
  '.plist',
  '.pbxproj',
  '.xcscheme',
  '.xcworkspacedata',
  '.storyboard',
  '.swift',
  '.kt',
  '.java',
  '.gradle',
  '.xml',
  '.json',
  '.js', // detox.config.js references the Canary.app/.xcworkspace/scheme identity
  '', // Podfile has no extension
]);

function replaceTextContent(filePath: string, identity: IAppIdentity): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const replaced = content
    .split('com.canary')
    .join(identity.bundleId)
    .split('Canary')
    .join(identity.nativeAppName);
  if (replaced !== content) fs.writeFileSync(filePath, replaced);
}

function walkTextFiles(dir: string, identity: IAppIdentity): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTextFiles(entryPath, identity);
      continue;
    }
    if (TEXT_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      replaceTextContent(entryPath, identity);
    }
  }
}

// Renames every filesystem entry named "Canary" or "Canary.<ext>" (ios/Canary,
// ios/Canary.xcodeproj, ios/Canary.xcworkspace, .../xcschemes/Canary.xcscheme). Depth-first so a
// parent rename never invalidates a child path still being visited.
function renameCanaryPaths(dir: string, nativeAppName: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory())
      renameCanaryPaths(path.join(dir, entry.name), nativeAppName);
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.name.startsWith('Canary')) continue;
    const from = path.join(dir, entry.name);
    const to = path.join(dir, entry.name.replace('Canary', nativeAppName));
    fs.renameSync(from, to);
  }
}

// The Android package directory is a STRUCTURAL move, not a substring rename: the template's
// java/com/canary becomes java/<bundleId-as-path> (e.g. java/com/example/myapp), which can add or
// remove path segments entirely depending on the chosen bundle id.
function moveAndroidPackageDir(javaSrcDir: string, bundleId: string): void {
  const oldDir = path.join(javaSrcDir, 'com', 'canary');
  if (!fs.existsSync(oldDir)) return;

  const newDir = path.join(javaSrcDir, ...bundleId.split('.'));
  fs.mkdirSync(path.dirname(newDir), { recursive: true });
  fs.renameSync(oldDir, newDir);

  const oldTopDir = path.join(javaSrcDir, 'com');
  if (fs.existsSync(oldTopDir) && fs.readdirSync(oldTopDir).length === 0) {
    fs.rmdirSync(oldTopDir);
  }
}

export function applyAppIdentity(root: string, identity: IAppIdentity): void {
  walkTextFiles(root, identity);

  const iosDir = path.join(root, 'ios');
  if (fs.existsSync(iosDir)) renameCanaryPaths(iosDir, identity.nativeAppName);

  const androidAppSrc = path.join(root, 'android', 'app', 'src');
  if (fs.existsSync(androidAppSrc)) {
    for (const sourceSet of fs.readdirSync(androidAppSrc)) {
      moveAndroidPackageDir(
        path.join(androidAppSrc, sourceSet, 'java'),
        identity.bundleId,
      );
    }
  }
}
