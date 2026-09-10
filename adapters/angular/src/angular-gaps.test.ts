/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string): string => readFileSync(path, 'utf8');

// Both sides are stripped of whitespace before comparing. The product rule these fences encode
// is "this binding / declaration exists at all", and both Angular templates and TS declarations
// wrap freely without changing meaning — prettier turns
// `[x]="y"` into `[x]="\n  y\n"` and `class A extends B` into `class A\n  extends B` the moment
// the line passes printWidth. Comparing the literal text made a reformat fail the fence while the
// binding it guards was still there (measured 2026-08-18, when the repo moved to 80 columns:
// AnimatedImage's declaration and Button's accessibilityRespondsToUserInteraction binding both
// broke this way). Stripping keeps the guard and drops the coupling to layout.
const withoutSpacing = (code: string): string => code.replace(/\s+/g, '');

const expectSourceToDeclare = (source: string, snippet: string): void => {
  expect(withoutSpacing(source)).toContain(withoutSpacing(snippet));
};

// This file asserts on literal SOURCE TEXT, not runtime behavior. That's a deliberate choice,
// not test-after laziness: per angular-adapter §10/§16/§21, an Angular template binding like
// `[accessibilityLabel]="x"` or `[symbioteHostProps]="hostProps"` can drop silently — vitest,
// tsc, and even a real ngc AOT build all stay green when a binding is removed, because Angular
// gives no compile-time signal for "this prop used to be forwarded and now isn't" the way a
// type error would. Each regression this file guards was a real, previously-shipped feature-
// parity gap (<adapters_reach_full_feature_parity>, P0) that only a real device render would
// otherwise catch. So the assertions ARE substrings of the current source — but the product
// rule under test is "this binding must exist at all", not "the implementation must match
// itself"; a future refactor that keeps the SAME bindings under different literal text (a
// renamed local, a reformatted template) is expected to need an update here, same as any other
// characterization of an AOT-only contract. There is no throwing path in any of these units
// (they read a file and grep it) — no Positive/Negative split applies; each test is its own
// named regression fence instead.
describe('Angular adapter gap regressions', () => {
  // why: VirtualizedList wraps ScrollView (angular-adapter's component-parity model) — if it
  // declares the accessibility/aria @Input()s but forgets to forward them into
  // foldedAccessibility, or forgets one of the @Input()s entirely, an app passing
  // accessibilityLabel/ariaBusy to <VirtualizedList> silently loses it one layer down.
  it('VirtualizedList exposes accessibility and aria inputs and forwards them to ScrollView', () => {
    const source = readSource(
      'adapters/angular/src/components/virtualized-list/index.ts',
    );

    expectSourceToDeclare(source, '@Input() accessibilityLabel?: string');
    expectSourceToDeclare(source, '@Input() ariaBusy?: boolean');
    expectSourceToDeclare(
      source,
      '[accessibilityLabel]="foldedAccessibility().accessibilityLabel"',
    );
    expectSourceToDeclare(
      source,
      '[accessibilityState]="foldedAccessibility().accessibilityState"',
    );
    expectSourceToDeclare(
      source,
      '[accessibilityRole]="foldedAccessibility().accessibilityRole"',
    );
  });

  // why: angular-adapter §0/§6 — Angular has NO runtime component synthesis under AOT/Metro, so
  // the whole Animated.* surface must be pre-authored standalone components, and
  // createAnimatedComponent's fallback for an unknown base MUST throw a clear message pointing
  // at the fix, never silently no-op. This guards both halves at once: the namespace wiring
  // (View/Text/Image/ScrollView/FlatList/SectionList all reachable off Animated) and that the
  // "why" documentation for the runtime-HOC non-goal stays in the source (a maintainer reading
  // the error message needs the real explanation, not a bare "not supported").
  it('Animated namespace exposes AOT-safe built-in entries and documents runtime HOC as a non-goal', () => {
    const animatedSource = readSource(
      'adapters/angular/src/modules/animated/index.ts',
    );
    const componentSource = readSource(
      'adapters/angular/src/modules/animated/create-animated-component.ts',
    );

    expectSourceToDeclare(componentSource, 'export const AnimatedFlatList');
    expectSourceToDeclare(componentSource, 'export const AnimatedSectionList');
    expectSourceToDeclare(
      componentSource,
      'if (base === View) return AnimatedView',
    );
    expectSourceToDeclare(
      componentSource,
      'if (base === Text) return AnimatedText',
    );
    // The TAG, not a component identity — `Image` is the statics namespace now, so there is no
    // class to compare against.
    expectSourceToDeclare(
      componentSource,
      'if (base === IMAGE_TAG) return AnimatedImage',
    );
    expectSourceToDeclare(
      componentSource,
      'if (base === ScrollView) return AnimatedScrollView',
    );
    expectSourceToDeclare(
      componentSource,
      'Angular cannot synthesize a component at runtime',
    );
    expectSourceToDeclare(componentSource, 'no JIT under AOT/Metro');
    expectSourceToDeclare(
      componentSource,
      'Author an explicit standalone @Component extending AnimatedComponentBase',
    );
    expectSourceToDeclare(animatedSource, 'View: AnimatedView');
    expectSourceToDeclare(animatedSource, 'Text: AnimatedText');
    expectSourceToDeclare(animatedSource, 'Image: AnimatedImage');
    expectSourceToDeclare(animatedSource, 'ScrollView: AnimatedScrollView');
    expectSourceToDeclare(animatedSource, 'FlatList: AnimatedFlatList');
    expectSourceToDeclare(animatedSource, 'SectionList: AnimatedSectionList');
  });

  // why: AnimatedImage must reuse the SAME prop-resolution/inputs/outputs surface plain Image
  // exposes (component parity, P0) rather than hand-rolling a thinner one — this checks the
  // structural wiring (which shared constants/functions it composes through); the actual
  // resolved VALUES this wiring produces are exercised at runtime by
  // angular-imports.test.ts's "resolves AnimatedImage props through the composed Image path".
  it('AnimatedImage uses composed Image props and normalized load events', () => {
    const source = readSource(
      'adapters/angular/src/modules/animated/create-animated-component.ts',
    );

    expectSourceToDeclare(
      source,
      'export class AnimatedImage extends ImageBase',
    );
    expectSourceToDeclare(source, 'inputs: ANIMATED_IMAGE_INPUTS');
    expectSourceToDeclare(source, 'outputs: IMAGE_OUTPUTS');
    expectSourceToDeclare(
      source,
      'const resolved = resolveImageProps(reduced)',
    );
    expectSourceToDeclare(source, '(load)="handleLoad($event)"');
    expectSourceToDeclare(source, '(error)="handleError($event)"');
  });

  // The OTHER direction of the test above — that plain `Image`'s own bag routed through the same
  // `resolveImageProps` — stood here until `image` became a TAG. There is no second component to
  // drift from any more: the tag's fold is `registerImageBehavior`, whose oracle is the COMMITTED
  // payload (`core/components/src/behaviors/image.test.ts`) rather than source text.

  // The FULL accessibility + TV-focus surface of `Pressable`, `TouchableOpacity` and
  // `TouchableHighlight` was fenced here as SOURCE TEXT — a list of `[prop]="expr"` bindings that
  // had to appear in each wrapper's template — until all three became TAGS (2026-09-11). There is
  // no Angular source to fence any more, and the replacement is strictly stronger in both halves:
  //
  //   the PROP SURFACE   `DECLARES_EVERY_PROP` in `elements.ts` resolves each element directive
  //                      against its own prop interface under `tsc --build`, so a missing name is a
  //                      compile error rather than a text mismatch — and it is DERIVED, where the
  //                      list here was hand-written and could only go stale in the safe direction.
  //   the `accessible`   RN's `accessible !== false` default now lives in the shared press
  //   DEFAULT           behavior's fold (`core/components/src/behaviors/pressable.ts`), whose
  //                      oracle is the committed payload rather than a template string.
  //
  // Same retirement, same reasoning, as Button's own arm one release earlier.
});
