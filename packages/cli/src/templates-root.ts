import * as fs from 'node:fs';
import * as path from 'node:path';

// `tsc --build` (dev) emits build/ one level down, so templates are at `../templates`
// The published bundle.js sits AT the package root, so they are at `./templates`
// Checking which one exists is simpler than threading a build-mode flag through
function resolveTemplatesRoot(): string {
  const packageDir = import.meta.dirname;
  const sibling = path.join(packageDir, 'templates');
  return fs.existsSync(sibling)
    ? sibling
    : path.resolve(packageDir, '../templates');
}

// Shared by `new` (generate.ts) and `add` (add-layers.ts), which overlays the same layers
export const templatesRoot = resolveTemplatesRoot();
