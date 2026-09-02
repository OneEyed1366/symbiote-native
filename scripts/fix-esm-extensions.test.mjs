// Runs under root `pnpm test:node` discovery. Uses node:test so it stays self-contained in
// scripts/ (Vitest owns the TypeScript/component suites) with zero extra dependency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  rewriteEsmSpecifiers,
  fixEsmExtensions,
} from './fix-esm-extensions.mjs';

// A resolver stand-in: every relative spec gains `.js` unless it's the sentinel unresolved one.
const addJs = spec => (spec === './missing' ? null : spec + '.js');

test('rewrites a real static import specifier', () => {
  const { code, importsFixed, unresolved } = rewriteEsmSpecifiers(
    `import { x } from './x';`,
    addJs,
  );
  assert.equal(code, `import { x } from './x.js';`);
  assert.equal(importsFixed, 1);
  assert.deepEqual(unresolved, []);
});

test('rewrites a real re-export specifier', () => {
  const { code } = rewriteEsmSpecifiers(`export { y } from '../y';`, addJs);
  assert.equal(code, `export { y } from '../y.js';`);
});

test('rewrites a real dynamic import specifier', () => {
  const { code, importsFixed } = rewriteEsmSpecifiers(
    `const m = import('./y');`,
    addJs,
  );
  assert.equal(code, `const m = import('./y.js');`);
  assert.equal(importsFixed, 1);
});

test('rewrites a dynamic import with surrounding whitespace', () => {
  const { code } = rewriteEsmSpecifiers(`await import(  './y'  )`, addJs);
  assert.equal(code, `await import(  './y.js'  )`);
});

test('leaves a specifier inside a line comment untouched and unreported', () => {
  const src = `// resolution picks it up for import styles from './Card.module.css' without a separate\nconst a = 1;`;
  const { code, importsFixed, unresolved } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, src);
  assert.equal(importsFixed, 0);
  assert.deepEqual(unresolved, []);
});

test('leaves a specifier inside a block/JSDoc comment untouched', () => {
  const src = `/**\n * @example import styles from './missing'\n */\nconst a = 1;`;
  const { code, unresolved } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, src);
  assert.deepEqual(unresolved, []);
});

test('leaves a specifier inside a double-quoted string untouched (emitted JS-as-string)', () => {
  const src = `const emitted = "import x from './z.css'";`;
  const { code, importsFixed, unresolved } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, src);
  assert.equal(importsFixed, 0);
  assert.deepEqual(unresolved, []);
});

test('leaves a specifier inside a template literal untouched', () => {
  const src = "const emitted = `export { a } from './missing'`;";
  const { code, unresolved } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, src);
  assert.deepEqual(unresolved, []);
});

test('leaves a specifier inside an escaped single-quoted string untouched', () => {
  const src = `const emitted = 'import x from \\'./z.css\\'';`;
  const { code, unresolved } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, src);
  assert.deepEqual(unresolved, []);
});

test('reports a genuinely unresolved real import and leaves it in place', () => {
  const { code, importsFixed, unresolved } = rewriteEsmSpecifiers(
    `import { z } from './missing';`,
    addJs,
  );
  assert.equal(code, `import { z } from './missing';`);
  assert.equal(importsFixed, 0);
  assert.deepEqual(unresolved, ['./missing']);
});

test('a quote inside a regex literal does not desync the scanner', () => {
  const src = `const re = /['"]/g;\nexport { z } from './z';`;
  const { code, importsFixed } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, `const re = /['"]/g;\nexport { z } from './z.js';`);
  assert.equal(importsFixed, 1);
});

test('a // inside a string URL is not treated as a comment', () => {
  const src = `const u = 'https://example.com/a'; export { m } from './m';`;
  const { code } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(
    code,
    `const u = 'https://example.com/a'; export { m } from './m.js';`,
  );
});

test('division is not mistaken for a regex', () => {
  const src = `const r = width / 2; export { n } from './n';`;
  const { code, importsFixed } = rewriteEsmSpecifiers(src, addJs);
  assert.equal(code, `const r = width / 2; export { n } from './n.js';`);
  assert.equal(importsFixed, 1);
});

test('a bare (non-relative) import is left alone', () => {
  const src = `import React from 'react';`;
  const { code, importsFixed, unresolved } = rewriteEsmSpecifiers(src, () => {
    throw new Error('resolve must not be called for a non-relative specifier');
  });
  assert.equal(code, src);
  assert.equal(importsFixed, 0);
  assert.deepEqual(unresolved, []);
});

// A side-effect import has no `from` and no parenthesis, so it is a third specifier position and
// was silently left extensionless until 2026-08-23. Real case: `adapters/vue/src/index.ts`'s
// `import './register';`, which cannot be written as a re-export without going lazy under Metro's
// inlineRequires. Metro resolves an extensionless specifier; Node ESM does not.
test('a bare side-effect import gets its extension', () => {
  const { code, importsFixed, unresolved } = rewriteEsmSpecifiers(
    `import './register';`,
    spec => `${spec}.js`,
  );
  assert.equal(code, `import './register.js';`);
  assert.equal(importsFixed, 1);
  assert.deepEqual(unresolved, []);
});

// The word `import` inside a STRING must not make the next specifier look like a bare import — the
// scanner's code-only mirror is what keeps that apart, and this pins it.
test('the word import inside a string does not create a false position', () => {
  const src = `const doc = 'import ';\nconst path = './register';`;
  const { code, importsFixed } = rewriteEsmSpecifiers(src, () => {
    throw new Error('resolve must not be called outside a specifier position');
  });
  assert.equal(code, src);
  assert.equal(importsFixed, 0);
});

test('an already-extensioned specifier is skipped via the resolver', () => {
  // Mirrors fixEsmExtensions' EXT_RE guard: `.js`/`.json` specifiers resolve to 'skip'.
  const skipExt = spec => (/\.(js|json)$/.test(spec) ? 'skip' : spec + '.js');
  const { code, importsFixed } = rewriteEsmSpecifiers(
    `import a from './a.js';\nimport b from './b.json';`,
    skipExt,
  );
  assert.equal(code, `import a from './a.js';\nimport b from './b.json';`);
  assert.equal(importsFixed, 0);
});

// adapters/solid builds with `jsx: 'preserve'`, so tsc emits `.jsx` beside `.js` and both are real
// emitted output. Without .jsx support a `build/index.js` importing a `.tsx`-derived sibling reports
// UNRESOLVED and fails the publish gate — invisible in-repo, since in-repo resolution goes through
// Metro/Vitest against src/, never build/.
test('fixEsmExtensions resolves and scans .jsx output (jsx: preserve packages)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-esm-jsx-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'View.jsx'),
      `export { helper } from './helper';`,
    );
    fs.writeFileSync(path.join(dir, 'helper.js'), 'export const helper = 1;');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'index.jsx'), 'export const s = 1;');

    fs.writeFileSync(
      path.join(dir, 'entry.js'),
      [
        `export { View } from './View';`, // → ./View.jsx (a .jsx-only target)
        `import { s } from './sub';`, // → ./sub/index.jsx (dir with only a .jsx index)
        `import v from './View.jsx';`, // → skipped, already extensioned (EXT_RE covers jsx)
      ].join('\n'),
    );

    const { importsFixed, unresolved } = fixEsmExtensions(dir);

    const entry = fs.readFileSync(path.join(dir, 'entry.js'), 'utf8');
    assert.match(entry, /from '\.\/View\.jsx'/);
    assert.match(entry, /from '\.\/sub\/index\.jsx'/);

    // The .jsx file itself is scanned, not just resolved to.
    assert.match(
      fs.readFileSync(path.join(dir, 'View.jsx'), 'utf8'),
      /from '\.\/helper\.js'/,
    );

    assert.equal(importsFixed, 3); // View + sub in entry.js, helper in View.jsx
    assert.deepEqual(unresolved, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- fs-level pipeline: exercises resolveSpecifier, platform-sibling skip, dir/index resolution ---
test('fixEsmExtensions over a real build dir: rewrite, skip platform-split, report unresolved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-esm-'));
  try {
    fs.writeFileSync(path.join(dir, 'b.js'), 'export const b = 1;');
    // Platform-split target: base + .ios sibling → must stay extensionless.
    fs.writeFileSync(path.join(dir, 'plat.js'), 'export const p = 0;');
    fs.writeFileSync(path.join(dir, 'plat.ios.js'), 'export const p = 1;');
    // A directory target resolves to /index.js.
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'index.js'), 'export const s = 1;');

    const entry = [
      `export { b } from './b';`, // → ./b.js
      `import { p } from './plat';`, // → skipped (platform sibling)
      `import { s } from './sub';`, // → ./sub/index.js
      `import a from './a.js';`, // → skipped (already .js, but a.js doesn't exist — EXT guard wins)
      `const bad = import('./missing');`, // → unresolved
      `// import ignored from './comment-only'`, // comment false-positive → ignored
      `const emitted = "from './string-only'";`, // string false-positive → ignored
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'entry.js'), entry);

    const { filesChanged, importsFixed, unresolved } = fixEsmExtensions(dir);

    const rewritten = fs.readFileSync(path.join(dir, 'entry.js'), 'utf8');
    assert.match(rewritten, /from '\.\/b\.js'/);
    assert.match(rewritten, /from '\.\/plat'/); // still extensionless
    assert.match(rewritten, /from '\.\/sub\/index\.js'/);
    assert.match(rewritten, /from '\.\/a\.js'/); // untouched
    assert.match(rewritten, /import\('\.\/missing'\)/); // untouched
    assert.match(rewritten, /'\.\/comment-only'/); // comment intact, not rewritten
    assert.match(rewritten, /"from '\.\/string-only'"/); // string intact, not rewritten

    assert.equal(filesChanged, 1);
    assert.equal(importsFixed, 2); // b + sub only
    assert.equal(unresolved.length, 1);
    assert.match(unresolved[0], /-> \.\/missing$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
