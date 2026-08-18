// Angular source-import harness regression. Vitest imports adapter source (`src/*.ts`) directly,
// not the partial-Ivy `ngc` output Metro consumes. The adapter tsconfig must therefore enable
// TypeScript's legacy decorator lowering so Node never sees raw `@Component` / `@Directive`
// syntax. Importing `@angular/compiler` enables JIT metadata creation for these source-only tests;
// production still proves AOT/partial-Ivy through `pnpm --filter @symbiote-native/angular ng:build`.

import '@angular/compiler';
import { ElementRef, Injector, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { Image, ScrollView, Text, View } from './components';
import {
  VirtualizedList,
  VListItemDirective,
} from './components/virtualized-list';
import { SymbioteHostPropsDirective } from './primitives';
import {
  Animated,
  AnimatedImage,
  AnimatedScrollView,
  AnimatedText,
  AnimatedView,
  createAnimatedComponent,
} from './modules/animated';

interface IAngularCompiledComponent {
  ɵcmp?: { selectors?: unknown };
}

interface IAngularCompiledDirective {
  ɵdir?: { selectors?: unknown };
}

// Narrows the JIT-attached `ɵcmp`/`ɵdir` field without an `as` cast — these are runtime
// properties Angular's `@angular/compiler` bolts onto the class after decoration, which no
// static type declares, so a plain property read needs a guard rather than a cast.
function isAngularCompiledComponent(
  value: unknown,
): value is IAngularCompiledComponent {
  return typeof value === 'function';
}

function isAngularCompiledDirective(
  value: unknown,
): value is IAngularCompiledDirective {
  return typeof value === 'function';
}

// This file guards the vitest-vs-ngc harness split the header comment describes: production
// ships partial-Ivy `ngc` output, but vitest imports the decorated `src/*.ts` directly and
// relies on `@angular/compiler`'s JIT to reconstruct `ɵcmp`/`ɵdir` metadata. If the adapter
// tsconfig's decorator lowering or the JIT import ever regressed, every class below would still
// import as a bare function (no throw) but silently lose its Angular identity — that's why the
// Positive group below checks BOTH "is this a class" and "does Angular recognize it as a
// Component/Directive", not just one.
describe('Angular source imports under Vitest', () => {
  describe('Positive — decorated classes and their compiled metadata survive the JIT harness', () => {
    // why: a JS-level import failure (wrong path, missing export, TDZ from a cycle) fails loud
    // — but a decorator-lowering misconfiguration fails SILENT: the class still imports fine as
    // a function, it just never gets an ɵcmp/ɵdir. Checking "is a function" first isolates that
    // this is a plain import success, before the next test asks whether Angular decorated it.
    it('imports decorated adapter components and directives directly from src', () => {
      expect(VirtualizedList).toBeTypeOf('function');
      expect(VListItemDirective).toBeTypeOf('function');
      expect(AnimatedView).toBeTypeOf('function');
      expect(SymbioteHostPropsDirective).toBeTypeOf('function');
    });

    // why: VirtualizedList/AnimatedView/VListItemDirective/SymbioteHostPropsDirective are real
    // `@Component`/`@Directive`-decorated classes with selectors the renderer's createElement
    // and Renderer2.listen paths key off of (angular-adapter §1/§11) — if JIT metadata creation
    // ever silently no-ops under vitest, every headless test built on `.ɵcmp?.selectors` (this
    // whole test suite's usual way of asserting a template compiled) would false-pass on
    // `undefined === undefined` instead of catching a real regression. AnimatedView's dual
    // selector specifically proves the multi-selector `AnimatedView, symbiote-animated-view`
    // form (the same shape babel-register-composed.test.ts's MULTI_SELECTOR_SNIPPET covers)
    // survives JIT compilation too, not just the babel-plugin's static parse.
    it('keeps Angular decorator metadata available to the JIT test runtime', () => {
      if (
        !isAngularCompiledComponent(VirtualizedList) ||
        !isAngularCompiledComponent(AnimatedView) ||
        !isAngularCompiledDirective(VListItemDirective) ||
        !isAngularCompiledDirective(SymbioteHostPropsDirective)
      ) {
        throw new Error('unreachable: adapter classes are always functions');
      }

      expect(VirtualizedList.ɵcmp?.selectors).toEqual([['VirtualizedList']]);
      expect(AnimatedView.ɵcmp?.selectors).toEqual([
        ['AnimatedView'],
        ['symbiote-animated-view'],
      ]);
      expect(VListItemDirective.ɵdir?.selectors).toEqual([
        ['', 'vListItem', ''],
      ]);
      expect(SymbioteHostPropsDirective.ɵdir?.selectors).toEqual([
        ['', 'symbioteHostProps', ''],
      ]);
    });

    // why: the Animated namespace re-exports component classes built by
    // create-animated-component.ts (angular-adapter §0's Animated module). RN's own
    // `Animated.View`/`Animated.Text`/... contract is that the namespaced entry IS the same
    // component identity apps import directly — a re-export that accidentally wraps or clones
    // would break `instanceof`/template-selector matching for any app code importing both paths.
    it('imports the Animated namespace without losing component identity', () => {
      expect(Animated.View).toBe(AnimatedView);
      expect(Animated.Text).toBe(AnimatedText);
      expect(Animated.Image).toBe(AnimatedImage);
      expect(Animated.ScrollView).toBe(AnimatedScrollView);
      expect(Animated.FlatList).toBeTypeOf('function');
      expect(Animated.SectionList).toBeTypeOf('function');
    });

    // why: AnimatedImage is one of the §21 anchor-host cases — it merges its own ElementRef's
    // anchorHostStyle back into the resolved Image props (see create-animated-component.ts) so
    // a `class="..."` on `<AnimatedImage>` actually reaches the real inner primitive instead of
    // silently staying unstyled/unsized, the exact device-confirmed bug §21 documents. This
    // exercises that merge end to end: width/height become a dimension-style entry, the
    // animatedProps.style entry stays a SEPARATE array slot (not flattened together), and
    // accessible/accessibilityLabel derive from `alt`, mirroring resolveImageProps' contract.
    it('resolves AnimatedImage props through the composed Image path', () => {
      // AnimatedImage is an ANCHOR_HOST_COMPONENT: its field initializer injects its own
      // ElementRef (anchorHostStyle merge, see create-animated-component.ts), so constructing it
      // outside Angular's component machinery needs an explicit injection context.
      const injector = Injector.create({
        providers: [{ provide: ElementRef, useValue: new ElementRef({}) }],
      });
      const image = runInInjectionContext(injector, () => new AnimatedImage());
      image.src = 'https://example.invalid/image.png';
      image.width = 32;
      image.height = 24;
      image.alt = 'Preview';
      image.animatedProps = {
        style: { opacity: 0.5 },
        testID: 'animated-image',
      };

      expect(image.animatedImageProps).toMatchObject({
        testID: 'animated-image',
        accessible: true,
        accessibilityLabel: 'Preview',
        source: [{ uri: 'https://example.invalid/image.png' }],
        style: [undefined, [{ width: 32, height: 24 }, { opacity: 0.5 }]],
      });
    });
  });

  describe('Negative — createAnimatedComponent rejects a component it cannot AOT-safely wrap', () => {
    // why: angular-adapter §0/§6 and the source's own header explain WHY this must throw rather
    // than attempt anything: Angular has no runtime JIT under Metro's AOT build, so
    // createAnimatedComponent can only dispatch to the handful of PRE-AUTHORED standalone
    // wrappers (View/Text/Image/ScrollView) — an arbitrary custom component has no such wrapper
    // and there is no way to synthesize one at runtime. Silently returning the base component
    // unanimated, or returning undefined, would both be worse than a loud, actionable throw
    // naming the real fix ("author an explicit standalone @Component").
    it('keeps createAnimatedComponent limited to pre-authored AOT-safe Angular wrappers', () => {
      class CustomComponent {}

      expect(createAnimatedComponent(View)).toBe(AnimatedView);
      expect(createAnimatedComponent(Text)).toBe(AnimatedText);
      expect(createAnimatedComponent(Image)).toBe(AnimatedImage);
      expect(createAnimatedComponent(ScrollView)).toBe(AnimatedScrollView);
      expect(() => createAnimatedComponent(CustomComponent)).toThrow(
        /Angular cannot synthesize a component at runtime \(no JIT compiler under AOT\/Metro\)/,
      );
      expect(() => createAnimatedComponent(CustomComponent)).toThrow(
        /Author an explicit standalone @Component extending AnimatedComponentBase instead/,
      );
    });
  });
});
