import * as fs from 'node:fs';
import * as path from 'node:path';

// Text-splice, not a third AndroidManifest.xml overlay: --expo-modules renders before
// --splash-screen in generate.ts, and renderTemplate's plain-file-copy overwrites rather than
// merges — a competing overlay would silently lose whichever layer wrote last. Runs as a
// post-process after every layer has already written its own manifest, same shape as
// applyAppIdentity's own text-splice pass, so it works no matter which manifest variant
// (base or --splash-screen's BootTheme one) ended up on disk — both share this exact text.
//
// The 4 permissions and the 2 <application> attributes are copied verbatim from
// examples/expo-react/android/app/src/main/AndroidManifest.xml, the one checked-in reference with
// a real native Android project. The backup attributes point at @xml/secure_store_* resources
// that aren't in that example's own res/xml/ — verified via /vendor (expo-secure-store's
// withSecureStore.ts config-plugin source) that those resources ship inside expo-secure-store's
// own Android library module and resolve through Gradle's cross-module resource merge, so no
// local res/xml/ copy is needed here either.
const EXPO_MODULES_PERMISSIONS = `  <uses-permission android:name="android.permission.VIBRATE" />
  <uses-permission android:name="android.permission.USE_FINGERPRINT" />
  <uses-permission android:name="android.permission.USE_BIOMETRIC" />
  <!-- @symbiote-native/brightness: setSystemBrightnessAsync/getPermissionsAsync -->
  <uses-permission android:name="android.permission.WRITE_SETTINGS" />
  <!-- @symbiote-native/cellular: getCarrierNameAsync/getIsoCountryCodeAsync/etc. -->
  <uses-permission android:name="android.permission.READ_PHONE_STATE" />`;

const EXPO_MODULES_BACKUP_ATTRS = `android:supportsRtl="true"
    android:dataExtractionRules="@xml/secure_store_data_extraction_rules"
    android:fullBackupContent="@xml/secure_store_backup_rules">`;

// Idempotent: `add --expo-modules` can run against a manifest this same function already wrote
// (a repeat invocation, or one that was previously wired through `new`) — a plain unconditional
// `.replace` would match its OWN inserted VIBRATE line on the second pass (EXPO_MODULES_PERMISSIONS
// starts with that exact line) and duplicate the whole block.
export function applyExpoModulesAndroidManifest(root: string): void {
  const manifestPath = path.join(
    root,
    'android/app/src/main/AndroidManifest.xml',
  );
  const manifest = fs.readFileSync(manifestPath, 'utf8');
  const withPermissions = manifest.includes('USE_BIOMETRIC')
    ? manifest
    : manifest.replace(
        '  <uses-permission android:name="android.permission.VIBRATE" />',
        EXPO_MODULES_PERMISSIONS,
      );
  const withBackupAttrs = withPermissions.includes('dataExtractionRules')
    ? withPermissions
    : withPermissions.replace(
        'android:supportsRtl="true">',
        EXPO_MODULES_BACKUP_ATTRS,
      );
  fs.writeFileSync(manifestPath, withBackupAttrs);
}
