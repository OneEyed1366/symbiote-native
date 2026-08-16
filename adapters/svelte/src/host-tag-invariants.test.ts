// A STRUCTURAL guard, not a behavior test: it parses every `.svelte` source this repo ships and
// fails if one breaks the rule the whole adapter rests on — props reach a host element as ONE
// object property (`p={bag}`), never as individual attributes.
//
// Why it is worth a test of its own. Three separate Svelte-side bug classes are impossible here
// only because of that rule, and all three come back the moment a single `<symbiote-view {...bag}>`
// is written:
//   - an `on`-prefixed PROP (`onTintColor` on a Switch) is eaten as an event listener,
//   - an object `style` is stringified to "[object Object]" (`set_custom_element_data` excludes
//     `style` and stringifies scalars — dom-shim/element.ts's header),
//   - a forwarded `{@attach}` is invoked TWICE, once by Svelte's own spread path and once by
//     `createAttachmentsSync`.
// None of those throws. Each one silently paints the wrong thing on a device, and `tsc` cannot see
// any of them, so the invariant needs an enforcer rather than a comment.
//
// Spreading onto a COMPONENT stays legal and is used widely (`<Pressable {...rest}>`,
// `<VirtualizedList {...attachments}>`) — a component's props are plain values that end up in a
// bag downstream, and none of Svelte's attribute machinery runs on them.
//
// Parsed with the real Svelte compiler rather than matched with a regex: a text scan cannot tell
// an element from a same-named component, and would trip over any comment or doc block that spells
// the forbidden shape out (this file's own header does).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'svelte/compiler';

// `<symbiote-*>` is the whole intrinsic surface — hyphenated on purpose, which is what puts it on
// Svelte's custom-element codegen path in the first place (dom-shim/element.ts).
const HOST_TAG_PREFIX = 'symbiote-';
const PROP_BAG_ATTRIBUTE = 'p';
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'build', 'build-ngc', 'dist']);

const REPO_ROOT = join(__dirname, '..', '..', '..');

type IViolation = {
  readonly file: string;
  readonly tag: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function svelteFilesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...svelteFilesUnder(path));
    } else if (entry.endsWith('.svelte')) {
      found.push(path);
    }
  }
  return found;
}

// The adapter's own components plus every package that ships a Svelte entry (navigation, slider,
// ...). App code under `examples/` is out of scope by construction: it never authors a host tag.
function scannedFiles(): string[] {
  const roots = [join(REPO_ROOT, 'adapters', 'svelte', 'src')];
  const packagesDir = join(REPO_ROOT, 'packages');
  for (const pkg of readdirSync(packagesDir)) {
    const svelteDir = join(packagesDir, pkg, 'src', 'svelte');
    try {
      if (statSync(svelteDir).isDirectory()) roots.push(svelteDir);
    } catch {
      // no Svelte entry in this package
    }
  }
  return roots.flatMap(svelteFilesUnder);
}

function hasAttributeOfType(attributes: unknown, type: string): boolean {
  if (!Array.isArray(attributes)) return false;
  return attributes.some(attribute => isRecord(attribute) && attribute.type === type);
}

function hasNamedAttribute(attributes: unknown, name: string): boolean {
  if (!Array.isArray(attributes)) return false;
  return attributes.some(
    attribute => isRecord(attribute) && attribute.type === 'Attribute' && attribute.name === name,
  );
}

// A generic deep walk rather than a per-node-type visitor: the Svelte AST nests element children
// under half a dozen differently-named fields (`fragment.nodes`, `body`, `consequent`, each block's
// own shape), and this guard only cares about two node types wherever they sit.
function walkAst(node: unknown, visit: (element: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit);
    return;
  }
  if (!isRecord(node)) return;
  if (node.type === 'RegularElement' || node.type === 'SvelteElement') visit(node);
  for (const value of Object.values(node)) walkAst(value, visit);
}

function collectViolations(check: (element: Record<string, unknown>) => string | undefined): {
  violations: IViolation[];
  fileCount: number;
} {
  const violations: IViolation[] = [];
  const files = scannedFiles();
  for (const file of files) {
    const ast = parse(readFileSync(file, 'utf8'), { modern: true, filename: file });
    walkAst(ast, element => {
      const tag = check(element);
      if (tag !== undefined) violations.push({ file: file.slice(REPO_ROOT.length + 1), tag });
    });
  }
  return { violations, fileCount: files.length };
}

describe('host-tag invariants across every shipped .svelte source', () => {
  // why: the rule that makes the on-prefixed-prop, stringified-style and double-attachment bug
  // classes unreachable. Enforced over the whole tree because it only takes one file to reopen
  // all three, and the one that does it will look perfectly ordinary in review.
  it('never spreads props onto a host element', () => {
    const { violations, fileCount } = collectViolations(element => {
      if (!hasAttributeOfType(element.attributes, 'SpreadAttribute')) return undefined;
      if (element.type === 'SvelteElement') return 'svelte:element';
      const name = element.name;
      if (typeof name === 'string' && name.startsWith(HOST_TAG_PREFIX)) return name;
      return undefined;
    });

    // A scan that silently found nothing to read would pass this file forever.
    expect(fileCount, 'the scan reached the shipped .svelte sources').toBeGreaterThan(0);
    expect(violations, 'use a single `p={bag}` property instead of a spread').toEqual([]);
  });

  // why: the same failure from the other direction. A DYNAMIC tag (`<svelte:element this={...}>`)
  // compiles through Svelte's generic attribute codegen, not the custom-element property path, so
  // `p={bag}` written there is set as an attribute and silently never reaches the engine
  // (svelte-adapter-dom-shim §15). The working route is an attachment — `{@attach hostProps(bag)}`,
  // which is handed the raw element and assigns the property from plain JS.
  it('never passes the prop bag as an attribute on a dynamic tag', () => {
    const { violations } = collectViolations(element => {
      if (element.type !== 'SvelteElement') return undefined;
      return hasNamedAttribute(element.attributes, PROP_BAG_ATTRIBUTE)
        ? 'svelte:element'
        : undefined;
    });

    expect(violations, 'pass the bag through `{@attach hostProps(bag)}` instead').toEqual([]);
  });
});
