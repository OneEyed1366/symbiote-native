import * as path from 'node:path';
import { templatesRoot } from '../templates-root.js';
import { renderTemplate } from './render-template.js';

// A dependency-only layer: its package.json.fragment.json merge is the whole wiring
// Autolinking is automatic, so there are no native files to overlay
export function mergeLayerFragment(root: string, layerName: string): void {
  renderTemplate(
    path.join(templatesRoot, 'layers', layerName, 'package.json.fragment.json'),
    path.join(root, 'package.json.fragment.json'),
  );
}
