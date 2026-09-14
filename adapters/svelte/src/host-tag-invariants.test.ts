// A STRUCTURAL guard, not a behavior test: it parses every `.svelte` source this repo ships and
// fails if one breaks the rule the whole adapter rests on — a HANDLER reaches a host element
// through the `p={bag}` property, never through an individual attribute or a spread.
//
// Why it is worth a test of its own. Three separate Svelte-side bug classes are impossible here
// only because of that rule:
//   - a SPREAD (`<view {...bag}>`) hits three at once — an `on`-prefixed PROP (`onTintColor` on a
//     Switch) is eaten as an event listener, an object `style` is stringified to
//     "[object Object]" (`set_custom_element_data` excludes `style` and stringifies scalars —
//     dom-shim/element.ts's header), and a forwarded `{@attach}` is invoked TWICE, once by
//     Svelte's own spread path and once by `createAttachmentsSync`.
// None of these throws — style and spread-attach both fail silently — so `tsc` cannot see them
// and the invariant needs an enforcer.
//
// A FOURTH class lived here until 2026-09-10 and is now CLOSED rather than banned: an individual
// `on*`-prefixed attribute (`<text-input onValueChange={fn}>`) compiles to `$.event(...)`, which
// hands the shim Svelte's own wrapped listener (`create_event`'s `target_handler`), never the
// app's function. `target_handler` always calls with exactly one argument, a real object, and
// mutates it internally — safe for `onPress`/`onFocus`/responder callbacks, whose sole argument
// already IS the event, but fatal for the old `onValueChange(text, event)` contract, where a bare
// string landed in that slot and `handle_event_propagation` threw
// `Object.defineProperty() called on non-object`. The fix moved `text`/`value` onto the event
// object as a FIELD (`ITextInputChangeEvent`/`ISwitchChangeEvent`,
// `core/components/src/state/text-input.ts` / `core/components/src/view/render-switch.ts`), so
// the sole argument is always a real object again and the individual-attribute form is safe on
// every current primitive — see `bare-tag-authored.test.ts`'s two positive cases. What survives
// below is a narrower, durable guard against the same SHAPE recurring on a future primitive.
//
// Spreading onto a COMPONENT stays legal and is used widely (`<Pressable {...rest}>`,
// `<VirtualizedList {...attachments}>`) — a component's props are plain values that end up in a
// bag downstream, and none of Svelte's attribute machinery runs on them. Same for an individual
// `on*` prop on a COMPONENT: it arrives as an ordinary value, never through `$.event(...)`.
//
// Parsed with the real Svelte compiler rather than matched with a regex: a text scan cannot tell
// an element from a same-named component, and would trip over any comment or doc block that spells
// the forbidden shape out (this file's own header does).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'svelte/compiler';
import { COMPONENT_DESCRIPTORS } from '@symbiote-native/components';

// Derived from the engine's own tag -> Fabric-component table, never hand-listed — the same
// discipline `adapterNames()` applies to the adapter roster. Covers every intrinsic, public and
// internal alike: the hazard is in the SHIM, which does not distinguish the two.
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
    // A native project (`examples/svelte/ios`, `.../android`) can carry a broken symlink inside
    // Pods/build artifacts — stat throws rather than lying, and neither directory holds `.svelte`
    // sources anyway, so skip both outright rather than tolerating the throw.
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

// The adapter's own components, every package that ships a Svelte entry (navigation, slider, ...),
// and the canary. `examples/svelte` used to be out of scope on the theory that app code never
// authors a host tag — false since primitives became public intrinsic tags (2026-09-07): a screen
// writes `<text-input>`/`<switch>`/`<pressable>` directly, so it is exactly where this hazard was
// found on device.
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
  // NOT `roots.flatMap(svelteFilesUnder)` — flatMap calls its callback with (item, index, array),
  // and the index would otherwise land in `svelteFilesUnder`'s new `extension` parameter.
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

// A generic deep walk rather than a per-node-type visitor: the Svelte AST nests element children
// under half a dozen differently-named fields (`fragment.nodes`, `body`, `consequent`, each block's
// own shape), and this guard only cares about two node types wherever they sit.
function walkAst(
  node: unknown,
  visit: (element: Record<string, unknown>) => void,
): void {
  if (Array.isArray(node)) {
    for (const item of node) walkAst(item, visit);
    return;
  }
  if (!isRecord(node)) return;
  if (node.type === 'RegularElement' || node.type === 'SvelteElement')
    visit(node);
  for (const value of Object.values(node)) walkAst(value, visit);
}

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

describe('host-tag invariants across every shipped .svelte source', () => {
  // why: the rule that makes the on-prefixed-prop, stringified-style and double-attachment bug
  // classes unreachable. Enforced over the whole tree because it only takes one file to reopen
  // all three, and the one that does it will look perfectly ordinary in review.
  it('never spreads props onto a host element', () => {
    const { violations, fileCount } = collectViolations(element => {
      if (!hasAttributeOfType(element.attributes, 'SpreadAttribute'))
        return undefined;
      if (element.type === 'SvelteElement') return 'svelte:element';
      const name = element.name;
      if (typeof name === 'string' && HOST_TAG_NAMES.has(name)) return name;
      return undefined;
    });

    // A scan that silently found nothing to read would pass this file forever.
    expect(
      fileCount,
      'the scan reached the shipped .svelte sources',
    ).toBeGreaterThan(0);
    expect(
      violations,
      'use a single `p={bag}` property instead of a spread',
    ).toEqual([]);
  });

  // why: the narrowed guard from the header. A blanket ban on every individual on*-prefixed
  // attribute is no longer earned — `onPress`/`onFocus`/every real Fabric event was never at risk
  // (their sole argument already IS the event object), and `onValueChange` is fixed at the source
  // now that its contract hands the app an event object with the value carried as a FIELD. What
  // is still worth enforcing is the SHAPE that caused it: no shared prop type may declare an
  // `on[A-Z]…` callback whose first parameter is a bare string/boolean/number — that shape is
  // exactly what crashes Svelte's `target_handler` the moment an app writes the attribute
  // individually, and nothing here is type-checked (`tsc --build` never reads a `*.test.ts`, and
  // vitest itself erases types without checking them —
  // `.claude/rules/test-harness-false-greens.md` §32), so a textual scan is the only enforcer.
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

    expect(
      violations,
      'pass the bag through `{@attach hostProps(bag)}` instead',
    ).toEqual([]);
  });
});
