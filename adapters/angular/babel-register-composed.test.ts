// Unit-tests babel-register-composed.cjs directly against source strings shaped like real
// ngc --compilationMode partial output (see descriptor-to-angular/index.js:125 and
// create-animated-component.js for the real multi-selector case this mirrors) — no ngc/Metro
// involved, per the angular-adapter-build skill's Stage A/B split.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { transformSync } from '@babel/core';
import plugin from './babel-register-composed.cjs';

// Mirrors metro-vue-transformer.test.ts's destructure-with-annotation pattern for a
// type-less .cjs import — no `as` cast needed.
const { PRIMITIVE_SELECTORS }: { PRIMITIVE_SELECTORS: Set<string> } = plugin;

function run(source: string): string {
  const result = transformSync(source, {
    babelrc: false,
    configFile: false,
    plugins: [plugin],
  });
  if (!result?.code) throw new Error('transformSync produced no code');
  return result.code;
}

const DESCRIPTOR_OUTLET_SNIPPET = `
import * as i0 from "@angular/core";
export class DescriptorOutlet {
    static ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "22.0.5", ngImport: i0, type: DescriptorOutlet, deps: [], target: i0.ɵɵFactoryTarget.Component });
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: DescriptorOutlet, isStandalone: true, selector: "symbiote-descriptor-outlet", inputs: { node: "node" }, usesOnChanges: true, ngImport: i0, template: '', isInline: true, changeDetection: i0.ChangeDetectionStrategy.OnPush });
}
`;

const MULTI_SELECTOR_SNIPPET = `
import * as i0 from "@angular/core";
export class AnimatedView {
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: AnimatedView, isStandalone: true, selector: "AnimatedView, symbiote-animated-view", inputs: {}, ngImport: i0, template: '', isInline: true });
}
`;

const PRIMITIVE_SNIPPET = `
import * as i0 from "@angular/core";
export class ViewHost {
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: ViewHost, isStandalone: true, selector: "symbiote-view", inputs: {}, ngImport: i0, template: '', isInline: true });
}
`;

const ALREADY_IMPORTED_SNIPPET = `
import { registerComposedComponent, other } from '@symbiote-native/angular';
import * as i0 from "@angular/core";
export class DescriptorOutlet {
    static ɵcmp = i0.ɵɵngDeclareComponent({ minVersion: "14.0.0", version: "22.0.5", type: DescriptorOutlet, isStandalone: true, selector: "symbiote-descriptor-outlet", inputs: {}, ngImport: i0, template: '', isInline: true });
}
`;

const NO_DECLARE_COMPONENT_SNIPPET = `
export function helper(x) {
  return x + 1;
}
`;

// Real shape of renderer.ts's compiled output: no @Component anywhere, defines
// registerComposedComponent itself. Confirms the plugin never rewrites its own definer.
const RENDERER_TS_SHAPE_SNIPPET = `
const ANCHOR_HOST_COMPONENTS = new Set(['ActivityIndicator']);
export function registerComposedComponent(selector) {
    ANCHOR_HOST_COMPONENTS.add(selector);
}
export class SymbioteRenderer {
    createElement(name) {
        return name;
    }
}
`;

// Babel's default generator emits double-quoted string literals — assertions match on
// substring content, not quote style, since this is intermediate machine output, not
// hand-authored source.
function importCountOf(code: string): number {
  return (code.match(/from ["']@symbiote-native\/angular["']/g) ?? []).length;
}

// This plugin has no throwing path (Program visitor either finds composed selectors or it
// doesn't — malformed input just yields selectors.size === 0, see composedSelectorsFromCall's
// defensive `[]` returns in the .cjs source). So the two groups below are "injects a
// registration call" (Positive) vs "leaves the file alone" (its own contract-accurate name,
// not "Negative" — nothing here is an error path) rather than Positive/Negative.
describe('babel-register-composed', () => {
  describe('injects a registerComposedComponent call', () => {
    // why: this plugin is what replaces the hand-written registerComposedComponent(...) calls
    // §11 of angular-adapter demands for every composed component — miss one and it silently
    // paints wrong on a real device (§11's whole point). A selector from a real ngc
    // ɵɵngDeclareComponent output must round-trip into a call + import.
    it('registers a single selector from a real ɵɵngDeclareComponent call', () => {
      const code = run(DESCRIPTOR_OUTLET_SNIPPET);
      expect(code).toMatch(
        /import \{ registerComposedComponent \} from ["']@symbiote-native\/angular["']/,
      );
      expect(code).toMatch(
        /registerComposedComponent\(["']symbiote-descriptor-outlet["']\)/,
      );
    });

    // why: a component can declare more than one selector (AnimatedView's dual
    // `AnimatedView, symbiote-animated-view` — see angular-adapter §11's ANCHOR_HOST_COMPONENTS
    // discussion). Both must reach the anchor-host registry, or the untagged one falls through
    // to createElement's raw-Fabric-view path and paints an "Unimplemented component" banner.
    it('registers each token of a comma-separated multi-selector', () => {
      const code = run(MULTI_SELECTOR_SNIPPET);
      expect(code).toMatch(/registerComposedComponent\(["']AnimatedView["']\)/);
      expect(code).toMatch(
        /registerComposedComponent\(["']symbiote-animated-view["']\)/,
      );
    });

    // why: registering a real Fabric primitive (symbiote-view, ...) as an anchor host would be
    // wrong — a primitive IS the real native view, not a composed wrapper needing an anchor. The
    // plugin must filter PRIMITIVE_SELECTORS out, not just append everything it finds.
    it('does not register a real Fabric primitive selector', () => {
      const code = run(PRIMITIVE_SNIPPET);
      expect(code).not.toContain('registerComposedComponent');
      expect(importCountOf(code)).toBe(0);
    });

    // why: Babel plugins compose in one pass over one Program — a second, redundant import of
    // the same specifier is at best noise and at worst (per the angular-adapter §11c incident)
    // a second module-resolution route that desyncs from the one the renderer reads.
    it('does not duplicate an already-present registerComposedComponent import', () => {
      const code = run(ALREADY_IMPORTED_SNIPPET);
      expect(importCountOf(code)).toBe(1);
      expect(code).toMatch(
        /registerComposedComponent\(["']symbiote-descriptor-outlet["']\)/,
      );
    });
  });

  describe('leaves non-composed source untouched', () => {
    // why: this plugin runs over EVERY file Metro bundles (not just Angular components) — a
    // plain module with no @Component metadata must pass through byte-for-byte, or every
    // unrelated file in the app pays a spurious transform cost/diff.
    it('leaves a file with no ɵɵngDeclareComponent calls untouched', () => {
      const code = run(NO_DECLARE_COMPONENT_SNIPPET);
      expect(code.trim()).toBe(NO_DECLARE_COMPONENT_SNIPPET.trim());
    });

    // why: renderer.ts is the plugin's OWN target consumer (it defines
    // registerComposedComponent and ANCHOR_HOST_COMPONENTS) but declares no @Component itself.
    // The plugin must not mistake ANCHOR_HOST_COMPONENTS.add(...) for a ɵɵngDeclareComponent
    // call and must not self-import/self-register — that would be a real require-cycle risk
    // (angular-adapter §11c already documents a build-artifact-shadow incident in this exact area).
    it('leaves renderer.ts-shaped source (no @Component, defines the helper itself) untouched', () => {
      const code = run(RENDERER_TS_SHAPE_SNIPPET);
      expect(importCountOf(code)).toBe(0);
      // the file's own definition must stay the only occurrence — no self-import/call inserted
      expect(code.match(/registerComposedComponent/g)?.length).toBe(1);
    });
  });
});

// Drift protection: the plugin can't `require()` a .ts source file (no transpile step for a
// plain Metro .cjs plugin), so PRIMITIVE_SELECTORS is a hardcoded literal mirroring
// ISymbioteIntrinsic (core/components/src/component-names/index.ios.ts). This test parses
// BOTH platform files' name tables by regex and fails loudly the moment a primitive is
// added/renamed there without the same edit landing here.
const COMPONENT_NAMES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../core/components/src/component-names',
);

function selectorsDeclaredIn(filename: string): Set<string> {
  const source = readFileSync(path.join(COMPONENT_NAMES_DIR, filename), 'utf8');
  const selectors = new Set<string>();
  for (const match of source.matchAll(/'(symbiote-[a-z-]+)':/g)) {
    const [, selector] = match;
    if (selector !== undefined) selectors.add(selector);
  }
  return selectors;
}

describe('babel-register-composed primitive-selector drift protection', () => {
  // why: PRIMITIVE_SELECTORS is a hand-maintained literal in a plain .cjs Babel plugin that
  // cannot require() the real .ts source of truth (no transpile step under Metro's plugin
  // loader — see the .cjs file's own header comment). Anyone adding/renaming a primitive in
  // core/components/src/component-names without touching this literal would silently make the
  // plugin treat a real Fabric primitive as a composed component (or vice versa) — this test
  // is the only thing that catches that drift.
  it('matches the exact union of symbiote-* selectors declared for iOS and Android', () => {
    const declared = new Set([
      ...selectorsDeclaredIn('index.ios.ts'),
      ...selectorsDeclaredIn('index.android.ts'),
    ]);
    expect(declared.size).toBeGreaterThan(0);
    expect(PRIMITIVE_SELECTORS).toEqual(declared);
  });
});
