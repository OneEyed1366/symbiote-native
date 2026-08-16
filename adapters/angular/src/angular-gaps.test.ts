/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string): string => readFileSync(path, 'utf8');

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
    const source = readSource('adapters/angular/src/components/virtualized-list/index.ts');

    expect(source).toContain('@Input() accessibilityLabel?: string');
    expect(source).toContain('@Input() ariaBusy?: boolean');
    expect(source).toContain('[accessibilityLabel]="foldedAccessibility().accessibilityLabel"');
    expect(source).toContain('[accessibilityState]="foldedAccessibility().accessibilityState"');
    expect(source).toContain('[accessibilityRole]="foldedAccessibility().accessibilityRole"');
  });

  // why: angular-adapter §0/§6 — Angular has NO runtime component synthesis under AOT/Metro, so
  // the whole Animated.* surface must be pre-authored standalone components, and
  // createAnimatedComponent's fallback for an unknown base MUST throw a clear message pointing
  // at the fix, never silently no-op. This guards both halves at once: the namespace wiring
  // (View/Text/Image/ScrollView/FlatList/SectionList all reachable off Animated) and that the
  // "why" documentation for the runtime-HOC non-goal stays in the source (a maintainer reading
  // the error message needs the real explanation, not a bare "not supported").
  it('Animated namespace exposes AOT-safe built-in entries and documents runtime HOC as a non-goal', () => {
    const animatedSource = readSource('adapters/angular/src/modules/animated/index.ts');
    const componentSource = readSource(
      'adapters/angular/src/modules/animated/create-animated-component.ts',
    );

    expect(componentSource).toContain('export const AnimatedFlatList');
    expect(componentSource).toContain('export const AnimatedSectionList');
    expect(componentSource).toContain('if (base === View) return AnimatedView');
    expect(componentSource).toContain('if (base === Text) return AnimatedText');
    expect(componentSource).toContain('if (base === Image) return AnimatedImage');
    expect(componentSource).toContain('if (base === ScrollView) return AnimatedScrollView');
    expect(componentSource).toContain('Angular cannot synthesize a component at runtime');
    expect(componentSource).toContain('no JIT under AOT/Metro');
    expect(componentSource).toContain(
      'Author an explicit standalone @Component extending AnimatedComponentBase',
    );
    expect(animatedSource).toContain('View: AnimatedView');
    expect(animatedSource).toContain('Text: AnimatedText');
    expect(animatedSource).toContain('Image: AnimatedImage');
    expect(animatedSource).toContain('ScrollView: AnimatedScrollView');
    expect(animatedSource).toContain('FlatList: AnimatedFlatList');
    expect(animatedSource).toContain('SectionList: AnimatedSectionList');
  });

  // why: AnimatedImage must reuse the SAME prop-resolution/inputs/outputs surface plain Image
  // exposes (component parity, P0) rather than hand-rolling a thinner one — this checks the
  // structural wiring (which shared constants/functions it composes through); the actual
  // resolved VALUES this wiring produces are exercised at runtime by
  // angular-imports.test.ts's "resolves AnimatedImage props through the composed Image path".
  it('AnimatedImage uses composed Image props and normalized load events', () => {
    const source = readSource('adapters/angular/src/modules/animated/create-animated-component.ts');

    expect(source).toContain('export class AnimatedImage extends ImageBase');
    expect(source).toContain('inputs: ANIMATED_IMAGE_INPUTS');
    expect(source).toContain('outputs: IMAGE_OUTPUTS');
    expect(source).toContain('const resolved = resolveImageProps(reduced)');
    expect(source).toContain('(load)="handleLoad($event)"');
    expect(source).toContain('(error)="handleError($event)"');
  });

  // why: guards the OTHER direction of the previous test — that plain Image's own imageProps
  // bag routes through the SAME resolveImageProps function AnimatedImage calls, so the two
  // components can never structurally drift apart into two different prop-resolution rules.
  // `imageProps` is a memoized computed() over the overridable buildImageProps(), not a getter.
  it('Image prop resolution is shared with AnimatedImage', () => {
    const imageSource = readSource('adapters/angular/src/components/image/shared.ts');

    expect(imageSource).toContain('export function resolveImageProps');
    expect(imageSource).toContain('readonly imageProps = computed<Record<string, unknown>>');
    expect(imageSource).toContain('return this.buildImageProps()');
    expect(imageSource).toContain('return resolveImageProps(this.imageInputProps)');
  });

  // why: RN's real Button surface includes the FULL accessibility + TV-focus prop set
  // (<adapters_reach_full_feature_parity>, P0) — this asserts that surface exists on THREE
  // related components in three different forwarding shapes: Button's own individual
  // `[prop]="expr"` bindings, Touchable's identical individual bindings (Button wraps
  // TouchableOpacity), and Pressable's DIFFERENT shape — a single `[symbioteHostProps]`
  // bag (angular-adapter §10's escape hatch for undeclared/dynamic bindings on a bare
  // primitive) rather than one binding per key. A silent drop on any of the three would ship a
  // Button/Touchable/Pressable that's accessible-by-eye but broken for assistive tech or TV
  // remote navigation, with no compiler signal (see the file-level comment above).
  it('Button forwards its full accessibility and TV-focus surface through TouchableOpacity', () => {
    const buttonSource = readSource('adapters/angular/src/components/button.ts');
    const touchableSource = readSource('adapters/angular/src/components/touchable/index.ts');
    const pressableSource = readSource('adapters/angular/src/components/pressable/index.ts');

    for (const binding of [
      '[accessible]="true"',
      '[accessibilityLabelledBy]="accessibilityLabelledBy"',
      '[importantForAccessibility]="importantForAccessibility"',
      '[accessibilityLiveRegion]="accessibilityLiveRegion"',
      '[screenReaderFocusable]="screenReaderFocusable"',
      '[accessibilityViewIsModal]="accessibilityViewIsModal"',
      '[accessibilityElementsHidden]="accessibilityElementsHidden"',
      '[accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"',
      '[accessibilityLanguage]="accessibilityLanguage"',
      '[accessibilityRespondsToUserInteraction]="accessibilityRespondsToUserInteraction"',
      '[accessibilityShowsLargeContentViewer]="accessibilityShowsLargeContentViewer"',
      '[accessibilityLargeContentTitle]="accessibilityLargeContentTitle"',
      '(accessibilityAction)="accessibilityAction.emit($event)"',
      '(accessibilityTap)="accessibilityTap.emit($event)"',
      '(magicTap)="magicTap.emit($event)"',
      '(accessibilityEscape)="accessibilityEscape.emit($event)"',
      '[ariaModal]="ariaModal"',
      '[ariaValueMax]="ariaValueMax"',
      '[ariaValueMin]="ariaValueMin"',
      '[ariaValueNow]="ariaValueNow"',
      '[ariaValueText]="ariaValueText"',
      '[hasTVPreferredFocus]="hasTVPreferredFocus"',
      '[nextFocusDown]="nextFocusDown"',
      '[nextFocusForward]="nextFocusForward"',
      '[nextFocusLeft]="nextFocusLeft"',
      '[nextFocusRight]="nextFocusRight"',
      '[nextFocusUp]="nextFocusUp"',
    ]) {
      expect(buttonSource).toContain(binding);
    }

    for (const binding of [
      '[accessible]="accessible"',
      '[accessibilityLabelledBy]="accessibilityLabelledBy"',
      '[importantForAccessibility]="importantForAccessibility"',
      '[accessibilityLiveRegion]="accessibilityLiveRegion"',
      '[screenReaderFocusable]="screenReaderFocusable"',
      '[accessibilityViewIsModal]="accessibilityViewIsModal"',
      '[accessibilityElementsHidden]="accessibilityElementsHidden"',
      '[accessibilityIgnoresInvertColors]="accessibilityIgnoresInvertColors"',
      '[accessibilityLanguage]="accessibilityLanguage"',
      '[accessibilityRespondsToUserInteraction]="accessibilityRespondsToUserInteraction"',
      '[accessibilityShowsLargeContentViewer]="accessibilityShowsLargeContentViewer"',
      '[accessibilityLargeContentTitle]="accessibilityLargeContentTitle"',
      '(accessibilityAction)="accessibilityAction.emit($event)"',
      '(accessibilityTap)="accessibilityTap.emit($event)"',
      '(magicTap)="magicTap.emit($event)"',
      '(accessibilityEscape)="accessibilityEscape.emit($event)"',
      '[ariaModal]="ariaModal"',
      '[ariaValueMax]="ariaValueMax"',
      '[ariaValueMin]="ariaValueMin"',
      '[ariaValueNow]="ariaValueNow"',
      '[ariaValueText]="ariaValueText"',
      '[hasTVPreferredFocus]="hasTVPreferredFocus"',
      '[nextFocusDown]="nextFocusDown"',
      '[nextFocusForward]="nextFocusForward"',
      '[nextFocusLeft]="nextFocusLeft"',
      '[nextFocusRight]="nextFocusRight"',
      '[nextFocusUp]="nextFocusUp"',
    ]) {
      expect(touchableSource).toContain(binding);
    }

    // Pressable forwards its resolved props through the shared SymbioteHostPropsDirective
    // (adapters/angular/src/primitives/shared.ts) rather than one `[prop]="x"` binding per
    // key, so the contract to check is: the binding exists, and the `hostProps` bag it
    // reads from actually assembles `accessible` / the folded accessibility bag / TV-focus.
    // `hostProps` is a computed(), hence the call parens — the binding text changed shape but
    // the contract did not.
    expect(pressableSource).toContain('[symbioteHostProps]="hostProps()"');
    expect(pressableSource).toContain('accessible: this.accessible');
    expect(pressableSource).toContain('...this.foldedAccessibility');
    expect(pressableSource).toContain('hasTVPreferredFocus: this.hasTVPreferredFocus');
    expect(pressableSource).toContain('(accessibilityAction)="emit(accessibilityAction, $event)"');
  });
});
