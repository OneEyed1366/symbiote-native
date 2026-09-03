import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const config = require(`${root}/react-native.config.cjs`) as {
  dependency: {
    platforms: {
      android: {
        sourceDir: string;
        packageImportPath: string;
        packageInstance: string;
      };
      ios: null;
    };
  };
};
const packageJson = JSON.parse(
  readFileSync(`${root}/package.json`, 'utf8'),
) as {
  files: string[];
  exports: Record<string, unknown>;
  publishConfig: { exports: Record<string, unknown> };
};
const manifest = readFileSync(
  `${root}/android/src/main/AndroidManifest.xml`,
  'utf8',
);

describe('foreground-service native package contract', () => {
  it('autolinks the Android package and has no iOS half', () => {
    expect(config.dependency.platforms).toEqual({
      android: {
        sourceDir: './android',
        packageImportPath:
          'import com.symbiote.foregroundservice.SymbioteForegroundServicePackage;',
        packageInstance: 'new SymbioteForegroundServicePackage()',
      },
      ios: null,
    });
  });

  it('packs the native source and built JS surface without development tests', () => {
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        'android',
        '!android/build',
        '!android/src/test',
        'build',
        'react-native.config.cjs',
      ]),
    );
    expect(Object.keys(packageJson.publishConfig.exports).sort()).toEqual(
      Object.keys(packageJson.exports).sort(),
    );
  });

  it('declares only the service and runtime permissions it owns', () => {
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE');
    expect(manifest).toContain('android.permission.WAKE_LOCK');
    expect(manifest).toContain(
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    );
    expect(manifest).toContain(
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    );
    expect(manifest).toContain('android:name=".SymbioteForegroundService"');
    expect(manifest).toContain(
      'android:foregroundServiceType="microphone|mediaPlayback"',
    );
    expect(manifest).toContain('android:stopWithTask="false"');
    expect(manifest).not.toContain('android.permission.RECORD_AUDIO');
    expect(manifest).not.toContain('android.permission.POST_NOTIFICATIONS');
  });
});
