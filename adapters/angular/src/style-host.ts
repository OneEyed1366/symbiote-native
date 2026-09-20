// The directive that claims `[style]` and `[class]` on the elements that bind them.
//
// IT IS A CORRECTNESS REQUIREMENT BEFORE IT IS AN OPTIMISATION, which is what separates it from
// `callback-host.ts`. An RN `StyleProp` is allowed to be an ARRAY, and Angular's own styling engine
// cannot represent one: `ɵɵstyleMap` decomposes the value key by key, so `applyStyling` takes each
// array MEMBER as a style key and throws inside change detection. Device-diagnosed 2026-09-02 on
// ImageBackground, and pinned ever since by `renderer/style-input.test.ts`.
//
// A declared input is what keeps the value away from that engine — `checkStylingMap` hands the whole
// value to the input instead of walking it (`render3/instructions/styling.ts:259-288`). So when the
// tag directives were withheld from runtime matching, the claim had to come from somewhere, or an
// array style would throw on every screen that writes one.
//
// AND IT IS ALSO THE FASTER PATH, which is why `class` rides the same selector. Unclaimed, a style
// object reaches the renderer once per KEY — measured at ~7 000 renderer calls on the thousand-row
// bench row against 4 000 when an input claims it.
//
// MATCHED ON THE TAG, and the first spelling of this directive matched on `[style],[class]` instead
// — which does not work, for a reason worth keeping because it is invisible from the outside.
//
// `[style]` IS NOT A PROPERTY BINDING. The compiler routes it to `ɵɵstyleMap`, a styling instruction,
// and the name never lands in the `AttributeMarker.Bindings` run that `findAttrIndexInNode` walks
// (upstream `node_selector_matcher.ts:240-282`, where `Classes` and `Styles` markers are SKIPPED
// outright). So a directive selected on `[style]` never matches an element that binds one, and the
// value goes to the styling engine exactly as if no directive existed. Measured: the AOT fixture in
// `style-input-aot.test.ts` imports `SYMBIOTE_ELEMENTS`, carries this directive, and still threw
// `Unsupported styling type: function`. `[onPress]` and every other `on*` name DO work that way,
// which is why `callback-host.ts` can be attribute-matched and this one cannot.
//
// SO IT IS A TAG DIRECTIVE, and it is instantiated per element like the ones it replaces — including
// on elements that bind no style at all, because a tag selector is the only one that can match. What
// is bought is its SHAPE: two inputs and two injections against the withheld classes' 279 and three.
//
// MEASURED, AND SMALLER THAN THE IDEA PROMISED. On the JavaScriptCore ladder, withholding a directive
// outright is worth ~70-91 ms over ten thousand elements (`WITHHOLDING it`, 7.0-9.1 us each) — but
// the adapter cannot take that, because this directive has to stay. What it reads against a bare tag
// AFTER the change is 58.2 / 58.8 / 71.0 ms, against `a directive at all` at 50.2 / 55.9 / 68.3 in
// the same runs. Those two are the same number: a directive costs what a directive costs, thin or
// fat, and nearly all of it is matching and instantiating rather than inputs or injections.
//
// So the change is worth the FAT-TO-THIN difference and not the whole crossing — the ladder's own
// `279 inputs, not 1` (~19.9 ms) plus `the ChangeDetectorRef` (~10-31 ms). Recorded at that size
// rather than at the one the plan was aimed at.
//
// NO `ChangeDetectorRef` HERE. A style write is an ordinary prop write and marks nothing; the view
// marking belongs to the callback path and lives with it.
//
// THE FOUR TAGS THAT KEEP THEIR OWN DIRECTIVE ARE ABSENT from the selector — `text-input`,
// `text-input-multiline`, `switch` and `refresh-control`. Their fat directive still matches and
// already declares `style`, and two directives claiming one input both receive it and both forward
// it, which is the `unchanged` double write this adapter has measured before.

import {
  Directive,
  ElementRef,
  Renderer2,
  type OnChanges,
  type SimpleChanges,
  inject,
} from '@angular/core';

/** Exported for the guard, which derives the same set from the withheld directives' own selectors. */
export const STYLE_HOST_SELECTOR =
  'view,symbiote-view,text,symbiote-text,image,symbiote-image,image-background,' +
  'pressable,symbiote-pressable,button,symbiote-button,touchable-opacity,touchable-highlight,' +
  'touchable-native-feedback,touchable-without-feedback,scroll-view,horizontal-scroll-view,' +
  'scroll-content,horizontal-scroll-content,activity-indicator,activity-indicator-spinner,' +
  'safe-area-view,modal,symbiote-modal,sticky-header,input-accessory-view';

@Directive({
  selector:
    'view,symbiote-view,text,symbiote-text,image,symbiote-image,image-background,' +
    'pressable,symbiote-pressable,button,symbiote-button,touchable-opacity,touchable-highlight,' +
    'touchable-native-feedback,touchable-without-feedback,scroll-view,horizontal-scroll-view,' +
    'scroll-content,horizontal-scroll-content,activity-indicator,activity-indicator-spinner,' +
    'safe-area-view,modal,symbiote-modal,sticky-header,input-accessory-view',
  // Spelled out rather than referenced: ngtsc statically evaluates decorator metadata, and a
  // computed selector makes it report the class as not standalone — see `callback-host.ts`.
  inputs: ['style', 'class'],
  standalone: true,
})
export class SymbioteStyleHost implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}
