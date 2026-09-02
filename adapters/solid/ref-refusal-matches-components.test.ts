// The `ref` refusal list, re-derived from the component sources rather than trusted.
//
// `INTRINSICS_WITHOUT_PUBLIC_REF` decides whether lowering a primitive would ADD a capability the
// component does not offer — the one thing a lowering transform must never do. It is a hand-written
// list of adapter members, and this month three of those went stale in exactly the same way: a list
// written before a member existed cannot report the member it does not contain
// (`.claude/rules/adapter-parity-audit.md`, "Check Solid last and separately"). So it is checked
// against the source of truth instead: whether the component's own props type declares `ref`.
//
// It is deliberately NOT a field on the shared spec. Whether a primitive exposes a ref is a fact
// about THIS adapter's props type, and a correct adapter may answer differently — Vue refuses on
// every primitive, because a Vue template ref yields the component instance rather than the host
// node whatever the component declares.
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require_ = createRequire(import.meta.url);
const { HOST_PRIMITIVES } = require_(
  '@symbiote-native/components/host-primitives',
);
const { INTRINSICS_YIELDING_HOST_REF } = require_(
  './babel-lower-host-primitives.cjs',
);

// `ref?: …` inside the exported props interface. A component that forwards a ref has to declare it
// to be callable from TS at all, so the declaration is the observable fact — not the plumbing.
// NOT "is a ref declared" — that was a PROXY, and it held only while View, Text and Pressable were
// the whole set. The question is whether lowering hands the app the SAME thing the component does,
// so what matters is the ref's TYPE: `Ref<IHostInstance>` is exactly what a lowered element yields,
// anything else is a different object. TextInput is what exposed the proxy — it declares
// `ref?: Ref<ITextInputHandle>`, so the old check said "lower", and a lowered `<TextInput ref>`
// silently dropped `clear`, `isFocused` and `setSelection`.
const HOST_INSTANCE_REF = /^\s*ref\?: Ref<IHostInstance>;/m;

// The component file is found by what it EXPORTS, never derived from the primitive's name.
//
// It used to be `./src/components/${name.toLowerCase()}.tsx`, which worked while every primitive
// was one word with a .tsx file — `view`, `text`, `pressable`. `TextInput` broke it on BOTH counts
// at once: the file is `text-input`, not `textinput`, and it is `.ts`, not `.tsx`. So a kebab-case
// fix would have failed on the extension, and the convention was holding on two coincidences while
// reading as one rule. Worse, the failure arrived as ENOENT — an error about the harness, which
// cannot be told apart from the finding this test exists to report.
//
// Scanning for the export cannot go stale on a rename, a move, or an extension, and when a
// primitive genuinely has no component the message says so.
function componentSources(): Map<string, string> {
  const dir = new URL('./src/components/', import.meta.url);
  const found = new Map<string, string>();
  const walk = (at: URL): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), at);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.'))
        continue;
      const source = readFileSync(child, 'utf8');
      // BOTH declaration shapes, because the sample was coincidence-shaped a third time: `View`,
      // `Text`, `Pressable` and `TextInput` are all `export function`, and `Image` is
      // `export const Image = Object.assign(ImageComponent, imageStatics)` — a component that has
      // to be a const because RN's statics (`getSize`, `prefetch`, …) hang off it. The miss came
      // back as "no component exports `Image`", an error about the harness rather than the finding.
      for (const [, name] of source.matchAll(
        /^export (?:function|const) ([A-Z][A-Za-z0-9]*)\s*[(:=]/gm,
      )) {
        if (!found.has(name)) found.set(name, source);
      }
    }
  };
  walk(dir);
  return found;
}

const SOURCES = componentSources();

// The second way a component yields the host node, and it is not visible in a props type at all.
// A component that renders through `descriptorToSolid` hands its whole bag to `spread`, and spread
// CALLS a `ref` found in that bag with the node it built (`descriptor-to-solid.ts`, buildNode) — so
// a caller's `ref` reaches the engine node exactly as a lowered tag's would, whether or not the
// props type ever mentions one. `Image` is the first primitive in that shape.
//
// Matching on the render path rather than on a hand-written exception keeps this derived: a
// component that stops using the bridge stops matching, and the row moves on its own.
const DESCRIPTOR_BRIDGE = /descriptorToSolid\(/;

// …but ONLY when the component declares no ref of its own. `TextInput` renders through the bridge
// AND declares `ref?: Ref<ITextInputHandle>`, and the declared handle is what an app actually gets —
// so reading the bridge alone flipped it to "yields the host instance", which is the exact proxy
// failure this file was rewritten to close. A declared ref always decides; the bridge only answers
// the case where nothing is declared.
const DECLARES_ANY_REF = /^\s*ref\?:/m;

function yieldsHostInstanceRef(component: string): boolean {
  const source = SOURCES.get(component);
  if (source === undefined)
    throw new Error(
      `no component exports \`${component}\` under src/components — the spec lists it as a lowerable primitive`,
    );
  if (HOST_INSTANCE_REF.test(source)) return true;
  if (DECLARES_ANY_REF.test(source)) return false;
  return DESCRIPTOR_BRIDGE.test(source);
}

const PRIMITIVES = Object.entries<{ intrinsic: string }>(HOST_PRIMITIVES).map(
  ([name, spec]) => ({ component: name, ...spec }),
);

describe('the ref-refusal list against the components it describes', () => {
  // The oracle's own break-test. The comparison below is only meaningful if `declaresPublicRef`
  // can return BOTH answers; a regex that silently stopped matching would make every row agree
  // with an empty list and the suite would stay green while the refusal disappeared.
  it('reads both answers out of the component sources', () => {
    expect(yieldsHostInstanceRef('View')).toBe(true);
    expect(yieldsHostInstanceRef('Text')).toBe(true);
    // No ref at all — lowering would ADD one.
    expect(yieldsHostInstanceRef('Pressable')).toBe(false);
    // A ref, but a DIFFERENT handle — lowering would swap it. The case the old proxy got wrong.
    expect(yieldsHostInstanceRef('TextInput')).toBe(false);
  });

  it('describes every lowerable primitive and nothing else', () => {
    const intrinsics = new Set(PRIMITIVES.map(p => p.intrinsic));
    for (const listed of INTRINSICS_YIELDING_HOST_REF) {
      expect(
        intrinsics.has(listed),
        `${listed} is not a lowerable primitive`,
      ).toBe(true);
    }
  });

  // The list is an ALLOWLIST since 2026-09-01: a primitive absent from it refuses a `ref`, so the
  // new-member-falls-out failure now costs coverage rather than correctness. This row is what turns
  // that default back into a decision — it fails for a primitive that should have been listed, with
  // the component's own source as the authority.
  it.each(PRIMITIVES)(
    '$component: host-ref list agrees with the declared props',
    ({ component, intrinsic }) => {
      expect(INTRINSICS_YIELDING_HOST_REF.has(intrinsic)).toBe(
        yieldsHostInstanceRef(component),
      );
    },
  );
});
