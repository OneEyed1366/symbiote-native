import * as fs from 'node:fs';
import * as path from 'node:path';

// Verbatim from templates/layers/splash-screen's own styles.xml — colors.xml and the
// drawable-*/bootsplash_logo.png assets this references ship in the BASE native template
// unconditionally (see templates/layers/README.md), so they're already present in any app `new`
// scaffolded, with or without --splash-screen.
const BOOT_THEME_STYLE = `    <style name="BootTheme" parent="Theme.BootSplash">
        <item name="bootSplashBackground">@color/bootsplash_background</item>
        <item name="bootSplashLogo">@drawable/bootsplash_logo</item>
        <item name="postBootSplashTheme">@style/AppTheme</item>
    </style>
`;

export function applySplashScreenStyles(root: string): void {
  const stylesPath = path.join(
    root,
    'android/app/src/main/res/values/styles.xml',
  );
  if (!fs.existsSync(stylesPath)) return;

  const styles = fs.readFileSync(stylesPath, 'utf8');
  if (styles.includes('name="BootTheme"')) return; // idempotent
  if (!styles.includes('</resources>')) return; // unrecognized shape, don't guess

  fs.writeFileSync(
    stylesPath,
    styles.replace('</resources>', `${BOOT_THEME_STYLE}</resources>`),
  );
}
