import { readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';

// ADR 0026 (folder-as-module): a module's files — the base implementation, its
// .ios/.android platform variants, and its co-located test — live together, either
// all flat in the parent folder or all inside one dedicated X/ subfolder. Never split.
// This is the mistake the rule catches: a leftover flat file (often a stale test) sitting
// next to a same-named subfolder that already owns that module, e.g.
// core/engine/src/node.ts + core/engine/src/__tests__/node.test.ts, or
// core/components/src/state/scroll-routing-handle.ts duplicating scroll-routing-handle/.
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|svelte|vue)$/;
const TEST_SUFFIX = /\.(smoke\.test|test|spec|detox)$/;
const PLATFORM_SUFFIX = /\.(ios|android)$/;
const IGNORE_DIRS = new Set([
  'node_modules',
  'build',
  'dist',
  'build-ngc',
  'codegen-specs',
]);

function logicalName(filename) {
  if (!SOURCE_EXT.test(filename) || filename.endsWith('.d.ts'))
    return undefined;
  let name = filename.slice(0, filename.length - extname(filename).length);
  name = name.replace(TEST_SUFFIX, '').replace(PLATFORM_SUFFIX, '');
  return name;
}

// Recursively collects every source file's logical name under `dir`, one bucket per
// module folder. `index` is excluded on purpose — every folder-module has its own
// index.ts by design (ADR 0026), so it repeats across sibling module folders and would
// otherwise collide with itself on every single one of them.
function collectLogicalNames(dir, names = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return names;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        collectLogicalNames(join(dir, entry.name), names);
      }
      continue;
    }
    const name = logicalName(entry.name);
    if (name && name !== 'index')
      names.push({ name, file: join(dir, entry.name) });
  }
  return names;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "flag a module's files split across the parent folder and a same-named subfolder",
      recommended: true,
    },
    messages: {
      splitAcrossFolders:
        'Module "{{name}}" has files split across different folders — per ADR 0026 they ' +
        'must all live together, either flat here or entirely inside one X/ subfolder: {{files}}',
    },
    schema: [],
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename;
        if (!filename || filename === '<input>') return;

        const base = basename(filename);
        const name = logicalName(base);
        if (!name || name === 'index') return;

        const dir = dirname(filename);
        let siblings;
        try {
          siblings = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }

        const buckets = new Map(); // bucket label -> [{name, file}]
        for (const entry of siblings) {
          if (entry.isDirectory()) {
            if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith('.'))
              continue;
            const nested = collectLogicalNames(join(dir, entry.name));
            if (nested.length > 0) buckets.set(entry.name, nested);
          } else {
            const flatName = logicalName(entry.name);
            if (!flatName || flatName === 'index') continue;
            if (!buckets.has('.')) buckets.set('.', []);
            buckets
              .get('.')
              .push({ name: flatName, file: join(dir, entry.name) });
          }
        }

        const matchingBuckets = new Set();
        const matches = [];
        for (const [bucket, files] of buckets) {
          for (const entry of files) {
            if (entry.name === name) {
              matchingBuckets.add(bucket);
              matches.push(entry.file);
            }
          }
        }
        if (matchingBuckets.size < 2) return;

        context.report({
          loc: node.loc,
          messageId: 'splitAcrossFolders',
          data: {
            name,
            files: matches
              .map(f => relative(context.cwd ?? process.cwd(), f))
              .sort()
              .join(', '),
          },
        });
      },
    };
  },
};
