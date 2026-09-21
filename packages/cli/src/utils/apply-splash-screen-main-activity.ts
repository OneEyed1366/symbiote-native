import * as fs from 'node:fs';
import * as path from 'node:path';

// A real app's android/app/src/main/java/<package path>/ varies with its bundle id — never
// "com/canary", the one fixed path a fresh scaffold's own MainActivity.kt lives at.
function findMainActivityKt(dir: string): string | undefined {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivityKt(entryPath);
      if (found !== undefined) return found;
      continue;
    }
    if (entry.name === 'MainActivity.kt') return entryPath;
  }
  return undefined;
}

const ONCREATE_OPEN =
  /override fun onCreate\(savedInstanceState: Bundle\?\) \{\n/;

// Every RN MainActivity.kt imports ReactActivity — a stable anchor to insert the two new imports
// next to, independent of whatever else the app has already added above or below it.
const REACT_ACTIVITY_IMPORT = 'import com.facebook.react.ReactActivity\n';

export function applySplashScreenMainActivity(root: string): void {
  const javaDir = path.join(root, 'android/app/src/main/java');
  if (!fs.existsSync(javaDir)) return;

  const mainActivityPath = findMainActivityKt(javaDir);
  if (mainActivityPath === undefined) return;

  const source = fs.readFileSync(mainActivityPath, 'utf8');
  if (source.includes('RNBootSplash.init(')) return; // idempotent
  if (!source.includes(REACT_ACTIVITY_IMPORT)) return; // unrecognized shape, don't guess

  let updated = source.includes('import com.zoontek.rnbootsplash.RNBootSplash')
    ? source
    : source.replace(
        REACT_ACTIVITY_IMPORT,
        `${REACT_ACTIVITY_IMPORT}import com.zoontek.rnbootsplash.RNBootSplash\n`,
      );
  if (!updated.includes('import android.os.Bundle')) {
    updated = updated.replace(
      REACT_ACTIVITY_IMPORT,
      `import android.os.Bundle\n${REACT_ACTIVITY_IMPORT}`,
    );
  }

  updated = ONCREATE_OPEN.test(updated)
    ? updated.replace(
        ONCREATE_OPEN,
        match => `${match}    RNBootSplash.init(this, R.style.BootTheme)\n`,
      )
    : updated.replace(
        'class MainActivity : ReactActivity() {\n',
        'class MainActivity : ReactActivity() {\n\n' +
          '  override fun onCreate(savedInstanceState: Bundle?) {\n' +
          '    RNBootSplash.init(this, R.style.BootTheme)\n' +
          '    super.onCreate(savedInstanceState)\n' +
          '  }\n',
      );

  fs.writeFileSync(mainActivityPath, updated);
}
