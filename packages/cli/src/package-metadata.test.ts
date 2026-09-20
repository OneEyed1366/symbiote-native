import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The CLI ships syntax (`import … with { type: 'json' }`) that's a hard SyntaxError on an old
// Node — a parse-time failure before any of our own code (including a runtime version check)
// gets to run. `engines.node` is the only lever left: npm/npx reads it BEFORE executing the
// package and prints its own "npm warn EBADENGINE" pointing at the real cause, instead of the
// developer hitting a cryptic "Unexpected identifier 'with'" three directories deep in a bundle.
describe('packages/cli own package.json', () => {
  const packageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../package.json',
  );
  const pkg: unknown = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  it('declares the Node floor its own import-attribute syntax requires', () => {
    if (typeof pkg !== 'object' || pkg === null || !('engines' in pkg)) {
      throw new Error('package.json has no "engines" field');
    }
    const engines = pkg.engines;
    if (
      typeof engines !== 'object' ||
      engines === null ||
      !('node' in engines)
    ) {
      throw new Error('package.json "engines" has no "node" field');
    }
    // Matches the floor templates/native/package.json.fragment.json already sets for every
    // SCAFFOLDED app — the CLI that runs on the developer's own machine before scaffolding even
    // happens should require no less.
    expect(engines.node).toBe('>=22.11.0');
  });
});
