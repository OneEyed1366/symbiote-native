import * as fs from 'node:fs';
import * as path from 'node:path';
import type { IFramework } from '../types.js';
import { renderTemplate } from './render-template.js';

// The base native/ template ships react-native-bootsplash wired to REACT's own logo, under fixed
// filenames the storyboard and Contents.json already reference — a same-name byte-swap fixes the
// branding without touching either. iOS shows BootSplash.storyboard as the launch screen
// unconditionally (Info.plist), regardless of --splash-screen, so this must run for every
// scaffold. React needs no overlay — it already is the base.
export function applyBootsplashLogo(
  root: string,
  templatesRoot: string,
  framework: IFramework,
): void {
  const overlayRoot = path.join(
    templatesRoot,
    'native',
    'bootsplash-logo',
    framework,
  );
  if (fs.existsSync(overlayRoot)) renderTemplate(overlayRoot, root);
}
