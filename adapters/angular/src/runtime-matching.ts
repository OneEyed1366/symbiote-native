// Keeping a directive for the TEMPLATE CHECKER and taking it out of the runtime.
//
// An element directive here exists so `<view [testID]="42">` is a compile error and `<view
// [testID]="'row'">` is not. That is ngtsc's job, done over the TypeScript source before anything
// runs. What it costs at RUN time is an instance per element: Angular matches the directive, builds
// it, injects into it, and calls `ngOnChanges`, which forwards each changed input with
// `renderer.setProperty(host, name, value)` — the same call `ɵɵproperty` makes DIRECTLY on an element
// no directive claimed. Same destination, one hop shorter.
//
// Measured on JavaScriptCore at ~8.5-9.4 us per element (`core/engine/cpp/tests/js/
// angular-directive-cost.itest.ts`, the `a directive at all` row), and between the two Angular bench
// arms at ~86 ms on a thousand-row screen — the largest single cost this adapter still carries.
//
// HOW: `findDirectiveDefMatches` walks `tView.directiveRegistry` and asks `isNodeMatchingSelectorList`
// with `def.selectors` (upstream `render3/instructions/shared.ts:466-501`). A def whose selector list
// is EMPTY is registered, iterated, and never matched — while its class, its decorator and its
// declared inputs are untouched, which is all the template checker reads. So this is one mutation per
// class at module load rather than a build step: no linker output to rewrite, and it behaves the same
// under JIT as under the partial-compiled path a device runs.
//
// WHAT A WITHHELD DIRECTIVE STOPS DOING, stated in full because none of it fails a type check:
//
//   the forward       `ngOnChanges` no longer runs. `ɵɵproperty` writes the same name and value
//                     straight to the renderer, so the engine sees the identical prop — asserted by
//                     census in the ladder (`unmatched` reads created=10002 setProps=10002).
//   the `on*` wrap    an `on*` PROP is called by the ENGINE, so Angular learns nothing unless
//                     something marks the view. That moved to `SymbioteRenderer.setProperty`, which
//                     every path reaches whether a directive claimed the binding or not.
//   the style shadow  `[style]` and `[class]` are no longer claimed by an input, so `ɵɵstyleMap` and
//                     `ɵɵclassMap` resolve them per KEY, as on a DOM element. An RN array or
//                     press-state callback travels as `[styleProp]` instead (`SymbioteElement.style`).
//   the view flush    the read-back tags' synchronous re-check finds the node's view lazily
//                     (`change-detection-flush.ts`) instead of injecting a `ChangeDetectorRef`.
//
// Every tag directive is withheld. `SymbioteCallbackHost` and the two form accessors match on
// ATTRIBUTES rather than on a tag, so they land only where they are needed and are never withheld.

/**
 * Take these directives out of Angular's runtime matcher, leaving ngtsc's view of them untouched.
 *
 * Idempotent, and silent on anything that is not a compiled directive — a class whose `ɵdir` cannot
 * be read is left alone rather than reported, because the only way to reach that state is a build
 * that never compiled it, which fails far louder elsewhere.
 */
export function withholdFromRuntimeMatching(types: readonly unknown[]): void {
  for (const type of types) {
    if (typeof type !== 'function') continue;
    const definition: unknown = Reflect.get(type, 'ɵdir');
    if (typeof definition !== 'object' || definition === null) continue;
    const selectors: unknown = Reflect.get(definition, 'selectors');
    if (!Array.isArray(selectors)) continue;
    // Emptied in place rather than replaced: the def holds this array, and reading `ɵdir` under JIT
    // is what compiles the directive, so the object in hand is the one the matcher will walk.
    selectors.length = 0;
  }
}
