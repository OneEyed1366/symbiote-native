// A structural guard, not a behavior test: it parses every `.svelte` source this repo ships
// A handler reaches a host element through the `p={bag}` property, never an attribute or a spread

// A spread (`<view {...bag}>`) hits three bug classes at once, and none of them throws
// An `on`-prefixed prop (`onTintColor` on a Switch) is eaten as an event listener, an object
// `style` is stringified, and a forwarded `{@attach}` runs twice, so `tsc` cannot see any of it

// An individual `on*` attribute compiles to `$.event(...)` and is safe, as `text` and `value`
// ride the event as a field (`bare-tag-authored.test.ts`)

// Spreading onto a component stays legal, as its props are plain values that end up in a bag
// The same holds for an individual `on*` prop on a component

// Parsed with the real Svelte compiler, as a regex cannot tell an element from a same-named
// component and would trip over a comment that spells the forbidden shape out

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'svelte/compiler';
import { COMPONENT_DESCRIPTORS } from '@symbiote-native/components';

// Derived from the engine's tag to Fabric-component table, never hand-listed
// Covers every intrinsic, public and internal alike, as the hazard does not tell them apart
const HOST_TAG_NAMES = new Set(Object.keys(COMPONENT_DESCRIPTORS));
const PROP_BAG_ATTRIBUTE = 'p';
const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'build',
  'build-ngc',
  'dist',
]);

const REPO_ROOT = join(__dirname, '..', '..', '..');

type IViolation = {
  readonly file: string;
  readonly tag: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function svelteFilesUnder(directory: string, extension = '.svelte'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    // A native project can carry a broken symlink inside Pods or build artifacts, and `stat` throws
    // Neither `ios` nor `android` holds `.svelte` sources, so both are skipped outright
    if (entry === 'ios' || entry === 'android') continue;
    let isDirectory: boolean;
    try {
      isDirectory = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) {
      found.push(...svelteFilesUnder(path, extension));
    } else if (entry.endsWith(extension)) {
      found.push(path);
    }
  }
  return found;
}

// The adapter's own components, every package that ships a Svelte entry, and the canary
// `examples/svelte` is in scope, as a screen writes `<text-input>` or `<pressable>` directly
function scannedFiles(): string[] {
  const roots = [
    join(REPO_ROOT, 'adapters', 'svelte', 'src'),
    join(REPO_ROOT, 'examples', 'svelte'),
  ];
  const packagesDir = join(REPO_ROOT, 'packages');
  for (const pkg of readdirSync(packagesDir)) {
    const svelteDir = join(packagesDir, pkg, 'src', 'svelte');
    try {
      if (statSync(svelteDir).isDirectory()) roots.push(svelteDir);
    } catch {
      // no Svelte entry in this package
    }
  }
  // Not `roots.flatMap(svelteFilesUnder)`, as the index would land in its `extension` parameter
  return roots.flatMap(root => svelteFilesUnder(root));
}

function hasAttributeOfType(attributes: unknown, type: string): boolean {
  if (!Array.isArray(attributes)) return false;
  return attributes.some(
    attribute => isRecord(attribute) && attribute.type === type,
  );
}

function hasNamedAttribute(attributes: unknown, name: string): boolean {
  if (!Array.isArray(attributes)) return false;
  return attributes.some(
    attribute =>
      isRecord(attribute) &&
      attribute.type === 'Attribute' &&
      attribute.name === name,
  );
}

// The modern Svelte AST nests child nodes under these fields, besides a fragment's `nodes`
const CHILD_FIELDS = [
  'fragment',
  'consequent',
  'alternate',
  'body',
  'fallback',
  'pending',
  'then',
  'catch',
] as const;

function walkAst(
  node: unknown,
  visit: (element: Record<string, unknown>) => void,
): void {
  if (!isRecord(node)) return;
  if (node.type === 'RegularElement' || node.type === 'SvelteElement')
    visit(node);
  const { nodes } = node;
  if (Array.isArray(nodes)) {
    for (const child of nodes) walkAst(child, visit);
  }
  for (const field of CHILD_FIELDS) walkAst(node[field], visit);
}

// A host tag, or a dynamic element, that carries a spread attribute
function spreadOnHostTag(element: Record<string, unknown>): string | undefined {
  if (!hasAttributeOfType(element.attributes, 'SpreadAttribute'))
    return undefined;
  if (element.type === 'SvelteElement') return 'svelte:element';
  const name = element.name;
  return typeof name === 'string' && HOST_TAG_NAMES.has(name)
    ? name
    : undefined;
}

// One of each construct that nests elements, a spread inside every one
// A walk that misses a nesting field would silently stop guarding it
const NESTING_CONSTRUCTS = [
  '<script>const bag = {};</script>',
  '{#if a}<view {...bag} />{:else if b}<view {...bag} />{:else}<view {...bag} />{/if}',
  '{#each xs as x}<view {...bag} />{:else}<view {...bag} />{/each}',
  '{#await p}<view {...bag} />{:then v}<view {...bag} />{:catch e}<view {...bag} />{/await}',
  '{#key k}<view {...bag} />{/key}',
  '{#snippet s()}<view {...bag} />{/snippet}',
  '<svelte:boundary><view {...bag} /></svelte:boundary>',
  '<Card><view {...bag} /></Card>',
  '<view><view {...bag} /></view>',
].join('\n');
const NESTED_SPREAD_COUNT = 13;

function collectViolations(
  check: (element: Record<string, unknown>) => string | undefined,
): {
  violations: IViolation[];
  fileCount: number;
} {
  const violations: IViolation[] = [];
  const files = scannedFiles();
  for (const file of files) {
    const ast = parse(readFileSync(file, 'utf8'), {
      modern: true,
      filename: file,
    });
    walkAst(ast, element => {
      const tag = check(element);
      if (tag !== undefined)
        violations.push({ file: file.slice(REPO_ROOT.length + 1), tag });
    });
  }
  return { violations, fileCount: files.length };
}

describe('the AST walk behind the guard', () => {
  it('reaches an element inside every construct that nests elements', () => {
    const found: string[] = [];
    walkAst(parse(NESTING_CONSTRUCTS, { modern: true }), element => {
      const tag = spreadOnHostTag(element);
      if (tag !== undefined) found.push(tag);
    });

    expect(found).toHaveLength(NESTED_SPREAD_COUNT);
  });
});

describe('host-tag invariants across every shipped .svelte source', () => {
  // The rule that keeps the three spread bug classes unreachable
  // It holds over the whole tree, as one file reopens all three and looks ordinary in review
  it('never spreads props onto a host element', () => {
    const { violations, fileCount } = collectViolations(spreadOnHostTag);

    // A scan that silently found nothing to read would pass this file forever
    expect(
      fileCount,
      'the scan reached the shipped .svelte sources',
    ).toBeGreaterThan(0);
    expect(
      violations,
      'use a single `p={bag}` property instead of a spread',
    ).toEqual([]);
  });

  // No shared prop type may declare an `on[A-Z]` callback whose first parameter is a bare primitive
  // That shape crashes Svelte's `target_handler` once an app writes the attribute individually
  // Nothing type-checks a test file, so a textual scan is the only enforcer
  it('never declares an on*-prefixed prop whose first argument is a bare primitive', () => {
    const DANGEROUS_SHAPE =
      /\bon[A-Z]\w*\??:\s*\(\s*\w+\s*:\s*(string|boolean|number)\s*[,)]/g;
    const roots = [
      join(REPO_ROOT, 'core', 'components', 'src', 'state'),
      join(REPO_ROOT, 'core', 'components', 'src', 'view'),
    ];
    const violations: { file: string; shape: string }[] = [];
    let fileCount = 0;
    for (const root of roots) {
      for (const file of svelteFilesUnder(root, '.ts')) {
        if (file.endsWith('.test.ts')) continue;
        fileCount += 1;
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(DANGEROUS_SHAPE)) {
          violations.push({
            file: file.slice(REPO_ROOT.length + 1),
            shape: match[0],
          });
        }
      }
    }

    expect(
      fileCount,
      'the scan reached the shared prop-type files',
    ).toBeGreaterThan(0);
    expect(
      violations,
      "a bare-primitive-first callback crashes Svelte's target_handler on an individual " +
        'attribute — carry the value as a field on the event object instead',
    ).toEqual([]);
  });

  // A dynamic tag (`<svelte:element this={...}>`) compiles through the generic attribute codegen
  // So `p={bag}` written there is set as an attribute and never reaches the engine
  // The working route is `{@attach hostProps(bag)}`, which is handed the raw node
  it('never passes the prop bag as an attribute on a dynamic tag', () => {
    const { violations } = collectViolations(element => {
      if (element.type !== 'SvelteElement') return undefined;
      return hasNamedAttribute(element.attributes, PROP_BAG_ATTRIBUTE)
        ? 'svelte:element'
        : undefined;
    });

    expect(
      violations,
      'pass the bag through `{@attach hostProps(bag)}` instead',
    ).toEqual([]);
  });
});
