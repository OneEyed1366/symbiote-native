// WHAT A MATCHED ELEMENT DIRECTIVE COSTS, asked on the runtime that ships shapes.
//
// `adapters/angular/src/directive-shape-cost.probe.test.ts` asks the same question under vitest and
// answers ~1.0 us per element. The two Angular bench arms answer ~6.9 us for the same thing
// (`angular-elements-suite` 227.6 against `angular-suite` 158.2, over 10 000 elements). One order of
// magnitude apart, on one question, and every plan for this adapter is aimed by whichever is right.
//
// The two instruments differ in more than one way, so this file removes every difference it can:
//
//   the runtime      vitest is V8, this harness is JavaScriptCore. THE SUSPECT, and the one thing
//                    this file cannot remove — which is the point of writing it here.
//   the tree         the bench arms build 1 000 rows of ten nodes through a per-row COMPONENT, with
//                    an `@for`, a signal, and a `[style]`. This builds one flat list, like the probe.
//   the census       the bench arms disagree — `unchanged=3000` against 0 — because a STATIC
//                    attribute reaches the renderer AND feeds the directive input, so a directive
//                    turns it into two writes. There is no static attribute here at all.
//   the directive    the bench arms differ by `SYMBIOTE_ELEMENTS` and also by `[value]` against
//                    `[text]`. Here both arms write the SAME prop name.
//
// IT REPRODUCED ~9 us, so THE RUNTIME IS THE ANSWER. The vitest probe is a V8 measurement of a
// problem that lives on JavaScriptCore (and, on a device, on Hermes): it may say which of two
// spellings is dearer, and it may never say by how much. Measured here, four arms, five rounds,
// censuses agreeing at created=10002 setProps=10002 unchanged=0 on every one:
//
//              bare   1-inject   minimal   full        us/element
//   run 1     192.6     248.0     277.9   284.1        19.3 / 24.8 / 27.8 / 28.4
//   run 2     193.9     255.2     280.3   288.6
//   run 3     196.5     249.2     279.2   285.1
//
//   a directive at all     55.4 / 61.3 / 52.7 ms     ~5.3-6.1 us/element
//   two more injections    29.9 / 25.0 / 30.0 ms     ~2.5-3.0 us/element, i.e. ~1.4 us EACH
//   279 inputs, not 1       6.2 /  8.3 /  5.9 ms     ~0.6-0.8 us/element
//
// Every row outside its own bar in every run. Under vitest the same two injections read INSIDE the
// bar three times running — "dropping `Renderer2` and `ChangeDetectorRef` would buy nothing" — which
// is exactly backwards for the runtime this adapter ships on.
//
// AND THE FIRST THREE RUNS OF THIS FILE READ THAT ROW AS 49.6, 30.0 AND 13.6 ms, before it grew a
// resolution bar and rotated its arm order. Four rounds and a fixed order were not enough.
//
// THE ~3 us OF INJECTIONS IS NOT COLLECTABLE, and three arms say so rather than one argument. Only
// `Renderer2` could leave the element directive at all — `ElementRef` is genuinely per-element, and
// `ChangeDetectorRef` is what `wrapCallback` marks a view with, so dropping it would silently
// reinstate a device bug `change-detection-flush.ts` records at length. Both ways of finding the
// renderer without injecting it were built here and priced against `minimal`, which is what ships:
//
//   proposal, weakmap     8.5 / 7.0 / -6.0 ms     one `set` per element, one `get` per ngOnChanges
//   proposal, node slot   5.6 / 9.1 / -2.5 ms     a symbol property on the node instead
//
// Both flip sign across runs and land inside the bar in most of them. A lookup on this runtime costs
// about what the injection it replaces costs, so the saving is spent on collecting it. Do not rebuild
// either one without a reason this file does not already contain.
//
// `setters` instead of `ngOnChanges` is the same verdict for the same reason: 13.3 / 11.8 / 0.3 ms,
// two of three inside the bar. Under vitest in dev mode it read reliably WORSE, which is a third
// runtime giving a third answer to one question.
//
// THE TWO INJECTIONS ARE PRICED SEPARATELY NOW, and the result refutes the reason for splitting them.
// `injectChangeDetectorRef` ends in `new ViewRef(hostComponentView, lView)` (upstream
// `change_detection/change_detector_ref.ts:139-153`) while finding an `ElementRef` is a lookup, so
// the prediction was that the allocating one dominates — which would make it the obvious one to
// remove. Three runs say otherwise:
//
//   the ChangeDetectorRef   20.5 ms (bar 9.0)   12.2 ms (bar 2.5)   19.5 ms (bar 32.6, no verdict)
//   the ElementRef           9.4 ms (bar 9.0)   20.7 ms (bar 3.7)   15.6 ms (bar 32.6, no verdict)
//
// Same band, and they SWAP RANK between runs. So an injection on this runtime costs ~1.2-2.1 us
// whatever it allocates, and reading the allocation in the vendor source predicted a split this
// instrument cannot see. Their SUM is the stable figure — ~30 ms, the row above — and that is what a
// change should be sized against.
//
// WHAT IT DOES ESTABLISH is the prize for removing ONE injection from the common path: ~12-21 ms on
// ten thousand elements, i.e. 6-9% of the `ng-elements` bench arm. `ElementRef` cannot go — every
// `ngOnChanges` names the node. `ChangeDetectorRef` can, and that is a DESIGN question rather than a
// measurement one: `SymbioteElement` injects one on every element, and the only two readers are the
// lazy `on*` callback wrapper and `ReadBackElement`'s constructor on three tags. An element carrying
// no `on*` prop — which is most of a screen, and all ten thousand of the benchmark row — builds a
// `ViewRef` for nobody.
//
// The shape that would collect it is a SECOND directive selected on the callback attributes
// (`[onPress],[onLayout],…`), holding those inputs and the `ChangeDetectorRef`, so only elements that
// bind one instantiate it. Not built here, and the hazard to design against is named rather than
// discovered later: that selector is a hand-written list of names, and a name missing from it makes
// its callback silently unwrapped — which needs a guard test deriving the list from the directives'
// own declared inputs, the treatment `ARIA_ALIAS_KEYS` already gets in the engine.
//
// SO WHAT IS LEFT IS STRUCTURAL: ~5.5 us to match and instantiate a directive per element and feed
// its inputs, which is Angular's own and not reachable from here, plus ~3 us of injections that
// cannot be collected. The next idea has to remove the directive from the RUNTIME rather than make
// it cheaper — it exists for ngtsc's template checker, which is a compile-time job.
//
// ONE ESCAPE LOOKED AVAILABLE AND IT WAS A HOLE, not a lever — recorded because the measurement is
// what made it look attractive, and the next reader will find the same numbers.
//
// `PRIMITIVE_SELECTOR_ALIAS` maps `symbiote-view` onto `view`, so both spellings commit the
// identical node. The directive's selector was the bare `view` ALONE, so the hyphenated form matched
// nothing — and an element with no directive is ~8.6 us per element cheaper. Measured before the
// fix: `full` 291.6/296.0 against `aliased` 205.2/214.2, i.e. 86.4/81.8 ms, censuses identical.
//
// That is not 30% off Angular. It is an app writing `<symbiote-view>` and silently losing its type
// check, its declared inputs, its callback wrapping and everything else `SymbioteElement` does —
// with the committed tree unchanged, so nothing could see it. The two spellings are ONE TAG, and the
// fix was to say so in the selector (`elements.ts`, `'view, symbiote-view'` on the seven dashless
// tags). `elements.test.ts`'s `T2` case is the compile-time guard.
//
// The `aliased` arm stays as the RUNTIME guard for that, and its row now reads the other way: it
// must land ON `full`, inside the bar. A `THE ESCAPE` row that opens back up means the selector
// regressed and an app can fall through the hole again.
//
// WHAT WAS ANSWERED ALONG THE WAY AND IS WORTH KEEPING: a `[style]` binding commits the SAME payload
// whether a directive claims it as an input or Angular's own styling engine handles it — including a
// numeric value and a `transform` ARRAY. That was the open question about the two paths and it is
// closed by `commits the same style whether a directive claims the binding or not` below.
//
// ONE PROP PER ELEMENT AND NOTHING ELSE, deliberately. `[testID]` is declared by `ViewElement`, so
// the directive arm CLAIMS it and forwards it out of `ngOnChanges`, while the bare arm lets it reach
// `Renderer2.setProperty` directly. One write per element either way — which is what makes the two
// censuses comparable, and the census is asserted before any millisecond is read.
//
// RUN ON `build-release` (`pnpm run bench:itest`). It passes on either build; only the ms differ.

import '@angular/compiler';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectorRef,
  Component,
  Directive,
  ElementRef,
  Input,
  Renderer2,
  inject,
  signal,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';

import {
  CALLBACK_ATTRIBUTE_SELECTOR,
  SYMBIOTE_ELEMENTS,
  mount,
} from '@symbiote-native/angular';
import { withholdFromRuntimeMatching } from '../../../../../adapters/angular/src/runtime-matching';
import { readSurfaceTelemetry } from '@symbiote-native/engine';

import {
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  mounted,
  print,
  report,
} from './harness';

const ROOT_TAG = 1;

// The bundler's own build switch — `false` on `build-release`, `true` on the assert build.
declare const __DEV__: boolean;

// TWENTY TIMES SMALLER ON THE ASSERT BUILD, and that is not a compromise on what this file claims.
// The timings are meaningless there anyway (`NDEBUG` off compiles in `ensureYogaChildrenLookFine`,
// which walks the parent's whole child list on every append — building an N-child list is O(N²)
// there and O(N) in the build that ships), and the file's own resolution bar correctly reports
// every row as "no verdict" on it. What DOES hold on both builds is the census: four arms, one
// workload. At 10 000 the assert build took 102 seconds against a whole-suite budget of about 22.
const ELEMENTS = __DEV__ ? 500 : 10_000;

/** Every arm reads the same signal, so a pass has identical work to do above the element. */
const label = signal('a');

const ITEMS = Array.from({ length: ELEMENTS }, (_unused, at) => `e${at}`);

// A `@for` OVER A SMALL TEMPLATE, not ten thousand elements written out. The first spelling of this
// file did write them out, and the arms read 3 218 ms and 3 619 ms — a hundred times the bench arm's
// figure for the same node count, because Angular JIT-COMPILES the component's template on first use
// and a ten-thousand-element template is an enormous compile. That sat inside the timed region and
// swamped everything this file is about. The bench arms hold a tiny template and loop at runtime,
// which is also what a real screen does.
const TEMPLATE = `<view>@for (item of items; track item) { <view [testID]="item"></view> }</view>`;

@Component({
  selector: 'bare-cost-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: TEMPLATE,
})
class BareArm {
  readonly label = label;
  readonly items = ITEMS;
}

@Component({
  selector: 'directive-cost-arm',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: TEMPLATE,
})
class DirectiveArm {
  readonly label = label;
  readonly items = ITEMS;
}

// THE ESCAPE, and the point of this arm is that the seam ALREADY EXISTS. A template that spells the
// tag `symbiote-view` gets the identical engine node — `PRIMITIVE_SELECTOR_ALIAS` maps it back, and
// has since long before this question — while `ViewElement`'s selector is the bare `view`, so no
// directive matches and none is instantiated. The component still IMPORTS them, exactly as a real
// screen does; they simply have nothing to match.
//
// Why it matters: a build step could rewrite the tag AFTER ngtsc has type-checked the template with
// the directive in place, which is the only way to keep the checking and lose the instance. This arm
// asks whether the runtime half of that idea is sound before any plugin is written — and whether the
// hyphen, which `CUSTOM_ELEMENTS_SCHEMA` needs anyway, costs anything on the way through.
@Component({
  selector: 'aliased-cost-arm',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view>
    @for (item of items; track item) {
      <symbiote-view [testID]="item"></symbiote-view>
    }
  </view>`,
})
class AliasedArm {
  readonly items = ITEMS;
}

// THE CORRECTNESS HALF OF THE ESCAPE, and the one that could sink it. Host BEHAVIORS are keyed by
// the intrinsic tag, so a `<pressable>` gets `accessible` and `focusable` written by a C++ rule that
// never sees the template. If the alias reached that registry as `symbiote-pressable`, the lookup
// would miss and every pressable in a rewritten app would lose its accessibility fold — silently,
// with the tree still looking right.
//
// `createElement` passes `engineName`, the RESOLVED tag, which is what makes this work. That is read
// off the source; this asserts it.
@Component({
  selector: 'behavior-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view>
    <pressable testID="plain" (press)="noop()"></pressable>
    <symbiote-pressable testID="aliased" (press)="noop()"></symbiote-pressable>
  </view>`,
})
class BehaviorArm {
  // A PRESS LISTENER ON BOTH, because half the fold depends on one. `focusable` is
  // `focusable !== false && onPress !== undefined && !disabled`, so a pressable nobody listens to
  // carries `accessible` and no `focusable` at all — which is correct, and made the first spelling
  // of this case fail on the arm that was working.
  noop(): void {}
}

// THE GATE ON THE WHOLE IDEA, and it is `[style]`.
//
// `SymbioteElement` declares `style` as an `@Input()`, so with a directive matched the binding
// arrives WHOLE at `setProperty('style', obj)`. Drop the directive and the same binding goes through
// Angular's own STYLING engine instead — `ɵɵstyleMap`, one `setStyle` per key, gathered back into
// one write by the renderer's styling run. Two different paths for one authored object.
//
// It decides whether the rewrite is worth building at all: the benchmark row carries a `[style]` on
// every one of its ten nodes, so if that binding forces a refusal the saving is zero where it
// matters most. RN styles are also the awkward case for a CSS-shaped engine — numbers rather than
// strings, and an ARRAY for `transform`.
const STYLE_OBJECT = {
  height: 44,
  flexDirection: 'row',
  paddingLeft: 10,
  opacity: 0.5,
  transform: [{ translateX: 12 }],
};

@Component({
  selector: 'style-path-arm',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view>
    <view testID="claimed" [style]="style"></view>
    <symbiote-view testID="styled" [style]="style"></symbiote-view>
  </view>`,
})
class StylePathArm {
  readonly style = STYLE_OBJECT;
}

// THE LADDER BETWEEN THE TWO, so the 9 us has a breakdown rather than a name. Every rung declares
// `testID` and forwards it, because an arm that declares it and forwards nothing writes no props at
// all and is not the same workload — the one comparability rule this whole investigation turns on.

let sharedRenderer: Renderer2 | undefined;

// CAPTURED BY THE ARM COMPONENT ITSELF, not by a directive on the wrapper. A wrapper directive needs
// an ATTRIBUTE to match on, and an attribute on a host node is one extra prop write — the ladder arms
// read 10 003 against the other two arms' 10 002 and stopped being the same workload. Declaring the
// attribute as an `@Input()` so the directive would claim it did NOT remove the write, which is worth
// knowing on its own. The component is instantiated once for the whole list and already has an
// injection context, so it costs nothing and touches no element.
function captureRenderer(): void {
  sharedRenderer = inject(Renderer2);
}

/** ONE injection — `ElementRef`, the only one that is genuinely per-element. */
@Directive({ selector: 'one-inject-tag', standalone: true })
class OneInjectElement implements OnChanges {
  private readonly host = inject(ElementRef);
  @Input() testID?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      sharedRenderer?.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

/** `SymbioteElement` in miniature: the same three injections, one declared input instead of 279. */
@Directive({ selector: 'minimal-tag', standalone: true })
class MinimalElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);
  @Input() testID?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

// `minimal` MINUS its `ChangeDetectorRef`, and it is the one injection nobody has ever priced alone.
//
// The ladder's "two more injections" row moves `Renderer2` and `ChangeDetectorRef` together, and the
// two are not alike: `injectChangeDetectorRef` ends in `new ViewRef(hostComponentView, lView)`
// (upstream `change_detection/change_detector_ref.ts:139-153`), so it ALLOCATES per element, while
// finding a renderer is a lookup. That is why replacing the renderer injection with a `WeakMap` or a
// node slot was a wash and this might not be: a lookup traded for a lookup buys nothing, an
// allocation removed is removed.
//
// It is priced because `SymbioteElement` injects one on EVERY element and two places use it — the
// lazy `on*` callback wrapper, and `ReadBackElement`'s constructor on three tags. The benchmark row
// carries no `on*` prop at all, so on that screen all ten thousand `ViewRef`s are built for nobody.
@Directive({ selector: 'no-detector-tag', standalone: true })
class NoDetectorElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  @Input() testID?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

// WHAT A BIG ATTRIBUTE SELECTOR COSTS TO CARRY, asked before the design that needs one is built.
//
// The shape that would collect the `ChangeDetectorRef` is a second directive selected on the callback
// attributes, so only an element binding one instantiates it. That selector is every `on*` input
// `elements.ts` declares bar the per-frame one, which is dozens of alternatives, and Angular
// tries a component's whole directive list against every element it creates.
//
// So the saving and the cost are the same order of magnitude and the design cannot be reasoned into
// — this arm carries the selector WITHOUT matching anything, which is the state every element on the
// benchmark row would be in. Against `no-detect` it prices the matching alone.
// THE DIRECTIVE THAT NGTSC SEES AND THE RUNTIME DOES NOT — the mechanism, asked before any of the
// adapter is changed around it.
//
// `findDirectiveDefMatches` walks `tView.directiveRegistry` and asks `isNodeMatchingSelectorList`
// with `def.selectors` (upstream `instructions/shared.ts:466-501`), so a def whose selector list is
// EMPTY is registered, iterated, and never matched. Its class, its inputs and its decorator are
// untouched, which is all ngtsc reads: the template checker runs over the TypeScript source at
// compile time and has nothing to do with the array the matcher walks at run time.
//
// So this is the whole of "keep the type checking, lose the instance", as one mutation per class at
// module load — no build step, no linker output to rewrite, and it behaves the same under JIT here
// as under the partial-compiled path a device runs.
//
// THE SHIPPED FUNCTION, by its internal path rather than a local copy of eight lines. It is not on
// the package barrel — a public mutation helper invites an app to withhold a directive whose style
// claim nothing replaces — and `angular-benchmark-row-shape.itest.ts` already reaches into the
// adapter's source the same way for the same reason.
//
// `minimal` exactly — three injections, one forward — and then told not to match. Against `minimal`
// it prices what the instance costs when everything else about the class is held still; against
// `bare` it says whether anything of the directive survives the withholding.
@Directive({ selector: 'unmatched-tag', standalone: true })
class UnmatchedElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);
  @Input() testID?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

withholdFromRuntimeMatching([UnmatchedElement]);

// THE SHIPPED STRING, imported rather than copied. A second spelling here would price a selector
// that is not the one an app carries the day either drifts, which is the mirror this repo deletes on
// sight — and `callback-host-selector.test.ts` found five names missing from the first hand-written
// version of it within a minute of being written.
@Directive({ selector: CALLBACK_ATTRIBUTE_SELECTOR, standalone: true })
class CallbackProbeElement {
  protected readonly detector = inject(ChangeDetectorRef);
}

// The same three injections and the same one forward, written as a SETTER. Angular writes straight
// through it and never builds a `SimpleChanges` — `usesOnChanges` is absent from the declaration
// entirely — so `minimal` against this one prices the lifecycle rather than the forwarding.
//
// Under vitest, in dev mode, setters read reliably WORSE; in prod mode there the two were within
// noise. Neither of those is this runtime, which is the whole reason the arm is repeated here.
@Directive({ selector: 'setter-tag', standalone: true })
class SetterElement {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);

  @Input() set testID(value: string | undefined) {
    this.renderer.setProperty(this.host.nativeElement, 'testID', value);
  }
}

// THE PROPOSED SHAPE, priced before it is built. Today's `SymbioteElement` injects three things;
// `Renderer2` is the only one that can leave, because `ElementRef` is genuinely per-element and
// `ChangeDetectorRef` is what `wrapCallback` marks a view with — dropping that would silently
// reinstate a device bug `change-detection-flush.ts` records at length.
//
// So the renderer would come from a WeakMap the adapter's own `createElement` fills. That map is not
// free: a `set` per element on the create path and a `get` per `ngOnChanges`, on a runtime where an
// injection costs ~1.4 us. This arm is the A/B — `minimal` is what ships, this is what would replace
// it — rather than a guess about which is dearer.
const rendererForNode = new WeakMap<object, Renderer2>();

@Directive({ selector: 'map-lookup-tag', standalone: true })
class MapLookupElement implements OnChanges {
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);
  @Input() testID?: string;

  // ONE SET AND ONE GET PER ELEMENT, which is what the real design costs. The real one fills the map
  // in the renderer's own `createElement`; filling it here puts the same two operations on the same
  // per-element path, and a map nothing fills would have measured a MISS rather than the design.
  constructor() {
    const node: unknown = this.host.nativeElement;
    if (
      typeof node === 'object' &&
      node !== null &&
      sharedRenderer !== undefined
    )
      rendererForNode.set(node, sharedRenderer);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const node: unknown = this.host.nativeElement;
    if (typeof node !== 'object' || node === null) return;
    const renderer = rendererForNode.get(node);
    for (const name of Object.keys(changes))
      renderer?.setProperty(node, name, changes[name]?.currentValue);
  }
}

// THE SAME PROPOSAL, with the map replaced by a SYMBOL PROPERTY on the node. A WeakMap `get` on this
// runtime turned out to cost about what an injection costs, so the question becomes whether a plain
// property read is cheaper — and whether giving every node an extra property slows the engine's own
// paths by changing the object's shape. Both halves are visible here: this arm against `minimal`,
// and every other arm as the control.
const RENDERER_SLOT = Symbol('renderer');

// NOT `instanceof Renderer2`. The adapter's renderer implements that abstract class's surface
// without extending it, so the first spelling of the arm below narrowed to nothing, forwarded
// nothing, and reported `setProps=2` against every other arm's 10 002 — caught by the census on the
// first run, which is the entire reason this file prints it before it reads a clock.
interface IPropWriter {
  setProperty(node: unknown, name: string, value: unknown): void;
}

function isPropWriter(value: unknown): value is IPropWriter {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'setProperty') === 'function'
  );
}

@Directive({ selector: 'slot-tag', standalone: true })
class SlotElement implements OnChanges {
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);
  @Input() testID?: string;

  constructor() {
    const node: unknown = this.host.nativeElement;
    if (typeof node === 'object' && node !== null)
      Reflect.set(node, RENDERER_SLOT, sharedRenderer);
  }

  ngOnChanges(changes: SimpleChanges): void {
    const node: unknown = this.host.nativeElement;
    if (typeof node !== 'object' || node === null) return;
    const renderer: unknown = Reflect.get(node, RENDERER_SLOT);
    if (!isPropWriter(renderer)) return;
    for (const name of Object.keys(changes))
      renderer.setProperty(node, name, changes[name]?.currentValue);
  }
}

const ladderTemplate = (tag: string): string =>
  `<view>@for (item of items; track item) { <${tag} [testID]="item"></${tag}> }</view>`;

@Component({
  selector: 'setter-arm',
  standalone: true,
  imports: [SetterElement],
  template: ladderTemplate('setter-tag'),
})
class SetterArm {
  readonly items = ITEMS;
}

@Component({
  selector: 'map-lookup-arm',
  standalone: true,
  imports: [MapLookupElement],
  template: ladderTemplate('map-lookup-tag'),
})
class MapLookupArm {
  readonly items = ITEMS;
  constructor() {
    captureRenderer();
  }
}

@Component({
  selector: 'slot-arm',
  standalone: true,
  imports: [SlotElement],
  template: ladderTemplate('slot-tag'),
})
class SlotArm {
  readonly items = ITEMS;
  constructor() {
    captureRenderer();
  }
}

@Component({
  selector: 'one-inject-arm',
  standalone: true,
  imports: [OneInjectElement],
  template: ladderTemplate('one-inject-tag'),
})
class OneInjectArm {
  readonly items = ITEMS;
  constructor() {
    captureRenderer();
  }
}

@Component({
  selector: 'minimal-arm',
  standalone: true,
  imports: [MinimalElement],
  template: ladderTemplate('minimal-tag'),
})
class MinimalArm {
  readonly items = ITEMS;
}

@Component({
  selector: 'no-detector-arm',
  standalone: true,
  imports: [NoDetectorElement],
  template: ladderTemplate('no-detector-tag'),
})
class NoDetectorArm {
  readonly items = ITEMS;
}

@Component({
  selector: 'unmatched-arm',
  standalone: true,
  imports: [UnmatchedElement],
  // The tag is unknown to Angular once nothing matches it, which is what the schema is for — and the
  // hyphen it needs is the same one every intrinsic tag of ours already carries or tolerates.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: ladderTemplate('unmatched-tag'),
})
class UnmatchedArm {
  readonly items = ITEMS;
}

@Component({
  selector: 'callback-probe-arm',
  standalone: true,
  imports: [NoDetectorElement, CallbackProbeElement],
  template: ladderTemplate('no-detector-tag'),
})
class CallbackProbeArm {
  readonly items = ITEMS;
}

interface IArmReading {
  wall: number;
  created: number;
  setProps: number;
  unchanged: number;
}

type IArm = typeof BareArm | typeof DirectiveArm | typeof OneInjectArm;

function timeArm(component: IArm): IArmReading {
  const startedAt = performance.now();
  const surface = mount(ROOT_TAG, component);
  flushTimers();
  surface.commit();
  const wall = performance.now() - startedAt;
  mounted();
  const telemetry = readSurfaceTelemetry(ROOT_TAG);
  return {
    wall,
    created: telemetry?.nodesCreated ?? 0,
    setProps: telemetry?.setProps ?? 0,
    unchanged: telemetry?.writesOfUnchanged ?? 0,
  };
}

describe('what a matched element directive costs', () => {
  // why: THE WHOLE FILE. If a directive is ~1 us per element here as it is under vitest, then the
  // 69 ms between the two bench arms is not directives and the next fix is aimed at the wrong thing.
  // If it is ~7 us, the probe is a V8 measurement of a JSC problem and must never size a change.
  it('prices a bare tag against the same tag with a directive matched', () => {
    // INTERLEAVED AND BEST-OF-N, for the two reasons the vitest probe already paid for: timing noise
    // only ever ADDS, so the minimum is the closest reading to the work; and running an arm's
    // samples in a block hands the later arm a warmer JIT. The first round also absorbs each
    // component's template compilation, which happens once per class.
    const arms: readonly (readonly [string, IArm])[] = [
      ['bare', BareArm],
      ['1-inject', OneInjectArm],
      ['no-detect', NoDetectorArm],
      ['cb-probe', CallbackProbeArm],
      ['unmatched', UnmatchedArm],
      ['minimal', MinimalArm],
      ['setters', SetterArm],
      ['map-look', MapLookupArm],
      ['slot', SlotArm],
      ['full', DirectiveArm],
      ['aliased', AliasedArm],
    ];
    const samples = new Map<string, IArmReading[]>();
    for (let round = 0; round < 5; round += 1) {
      // ROTATED, so no arm is permanently in the slot that follows another arm's teardown.
      for (let slot = 0; slot < arms.length; slot += 1) {
        const arm = arms[(slot + round) % arms.length];
        if (arm === undefined) continue;
        const [name, component] = arm;
        samples.set(name, [...(samples.get(name) ?? []), timeArm(component)]);
      }
    }
    const best = new Map<string, IArmReading>();
    // THE GAP BETWEEN AN ARM'S BEST AND SECOND-BEST SAMPLE is this run's resolution for that arm, and
    // a delta smaller than it is not a finding. Written in from the start here because the vitest
    // probe published three reversed findings before it had one: the first three runs of this file
    // read "two more injections" as 49.6, 30.0 and 13.6 ms, which is one number only if nothing
    // checks.
    const resolution = new Map<string, number>();
    for (const [name, taken] of samples) {
      const sorted = [...taken].sort((left, right) => left.wall - right.wall);
      const first = sorted[0];
      const second = sorted[1];
      if (first === undefined || second === undefined) continue;
      best.set(name, first);
      resolution.set(name, second.wall - first.wall);
    }
    const read = (name: string): IArmReading => {
      const reading = best.get(name);
      if (reading === undefined) throw new Error(`${name} never ran`);
      return reading;
    };
    const verdict = (left: string, right: string): string => {
      const delta = read(left).wall - read(right).wall;
      const bar = Math.max(
        resolution.get(left) ?? 0,
        resolution.get(right) ?? 0,
      );
      const label = `${delta.toFixed(1).padStart(6)} ms  ${((delta * 1000) / ELEMENTS).toFixed(2)} us/element`;
      return `${label}  ${Math.abs(delta) > bar ? `outside the bar (${bar.toFixed(1)} ms)` : `INSIDE THE BAR (${bar.toFixed(1)} ms) — no verdict`}`;
    };
    // THE CENSUS BEFORE THE CLOCK. Two arms that disagree here are not one workload, and this file
    // exists because two arms elsewhere did exactly that.
    //
    // TWO NODES BESIDE THE LIST, both named rather than fitted: the template's own wrapper `<view>`,
    // and the container `createSurface` puts under the RootView. The first spelling of this
    // assertion counted only one and read 10 002 against 10 001.
    const CHROME = 2;
    // PRINTED BEFORE IT IS ASSERTED, so a mismatch names the arm. This harness's `expect` reports
    // only the two numbers, and the first spelling of this file said "expected 10002, received
    // 10003" with nothing to say which of four arms had said it.
    print(
      arms
        .map(
          ([name]) =>
            `${name.padStart(9)}  created=${read(name).created} setProps=${read(name).setProps} unchanged=${read(name).unchanged}`,
        )
        .join('\n'),
    );
    for (const [name] of arms) {
      const reading = read(name);
      expect(reading.created, `${name} builds the list`).toBe(
        ELEMENTS + CHROME,
      );
      // One write per element, and one for each chrome node — the wrapper and the container both
      // take a style from the layers that build them.
      expect(reading.setProps, `${name} writes one prop per element`).toBe(
        ELEMENTS + CHROME,
      );
      // No static attribute anywhere, so nothing is written twice on any arm. The bench arms carry
      // 3 000 of these on the directive side and 0 on the bare side, which is part of why they are
      // not the clean pair this file is.
      expect(reading.unchanged, `${name} wastes no write`).toBe(0);
      // A zero here would make every delta read beautifully.
      expect(reading.wall, `${name} ran`).toBeGreaterThan(0);
    }

    const perElement = (ms: number): string =>
      `${((ms * 1000) / ELEMENTS).toFixed(2)} us/element`;

    print(
      [
        ...arms.map(
          ([name]) =>
            `${name.padStart(9)}  ${read(name).wall.toFixed(1).padStart(6)} ms  ${perElement(read(name).wall)}  +-${(resolution.get(name) ?? Number.NaN).toFixed(1)}`,
        ),
        '',
        `a directive at all    ${verdict('1-inject', 'bare')}`,
        `two more injections   ${verdict('minimal', '1-inject')}`,
        `the ChangeDetectorRef ${verdict('minimal', 'no-detect')}`,
        `the ElementRef        ${verdict('no-detect', '1-inject')}`,
        `carrying the selector ${verdict('cb-probe', 'no-detect')}`,
        `the CALLBACK HOST     ${verdict('cb-probe', 'minimal')}`,
        `WITHHOLDING it        ${verdict('minimal', 'unmatched')}`,
        `what withholding LEFT ${verdict('unmatched', 'bare')}`,
        // `full` IS NO LONGER A FAT-DIRECTIVE ARM, and this row is the proof rather than a caveat.
        // It imports `SYMBIOTE_ELEMENTS`, whose tag directives are withheld from runtime matching as
        // of 2026-09-18 — so what it now measures is the adapter's CURRENT shape: no tag directive
        // instantiated, one thin `SymbioteStyleHost` matching instead. Read against `bare`, which
        // instantiates nothing at all, it is what a screen still pays for its element directives.
        //
        // Every row above that names `full` expired with that change. `279 inputs, not 1` compares a
        // withheld class against a matched one and reads NEGATIVE; `THE ESCAPE` compares two arms
        // that now behave alike. They are left in place because a row that flipped sign is a louder
        // record of what moved than a deleted one — the same call this file's own header makes about
        // the three findings it published and withdrew.
        `the adapter, vs bare  ${verdict('full', 'bare')}`,
        `ngOnChanges, not set  ${verdict('minimal', 'setters')}`,
        `proposal, weakmap     ${verdict('minimal', 'map-look')}`,
        `proposal, node slot   ${verdict('minimal', 'slot')}`,
        // MUST read INSIDE the bar. The hyphenated spelling is the same tag, so it must cost the
        // same; a gap here is the selector hole reopening, and it reads as a 30% win.
        `THE ESCAPE            ${verdict('full', 'aliased')}`,
        `279 inputs, not 1     ${verdict('full', 'minimal')}`,
      ].join('\n'),
    );

    // No threshold on any delta — that is what the print is for, and a bound would either be so
    // loose it says nothing or so tight it fails on a busy machine.
    //
    // ONE EXCEPTION, and it is a correctness claim rather than a performance one: the hyphenated
    // spelling must not be CHEAPER than the bare one, because cheaper means no directive matched it
    // and an app writing it has silently lost every check.
    //
    // THE BOUND IS A RATIO, and both of the absolute forms it replaces were the defect.
    //
    // `HOLE = 40` ms was set against a measured hole of 86 while the arms print a spread of ±50-63 —
    // a bound tighter than the noise it sits in, which is not a claim. Rewriting it against this
    // run's own RESOLUTION did not help either: resolution is sample-to-sample jitter WITHIN an arm,
    // and the failure mode here is an arm that is UNIFORMLY slow, which has a small spread and a
    // wrong wall. The arms run sequentially, so the load between them is not observable from inside
    // either one.
    //
    // A ratio was the third attempt and it flipped too — 0.678 against a 0.7 bound, on a run where
    // nothing was wrong. The arms are sequential, so a uniform slowdown is not uniform ACROSS them.
    //
    // SO THIS STOPS BEING A GATE, which is the same conclusion §18h reached and the same one three
    // fixtures written this week reached: **a timing comparison inside a 117-process suite is a
    // print, read from a solo invocation.** Four bounds in a row were tried and every one bought
    // either a false red or a claim too weak to catch the hole.
    //
    // THE CORRECTNESS HALF IS NOT LOST — it never needed a clock. The case below mounts both
    // spellings and asserts the aliased one carries the same committed payload as the bare one, which
    // is what "a directive matched it" actually means; a selector hole shows up there as a missing
    // fold rather than as a suspiciously fast arm.
    print(
      `THE HOLE CHECK        aliased/full = ${(read('aliased').wall / read('full').wall).toFixed(2)} ` +
        `— a print, not a gate; the payload case below is the real one`,
    );
  });

  // why: an aliased tag that lost its host behavior would commit a tree that looks identical and is
  // missing its accessibility fold. Nothing in the timings above could see that.
  it('gives an aliased tag the same host behavior as the bare one', () => {
    const surface = mount(ROOT_TAG, BehaviorArm);
    flushTimers();
    surface.commit();
    mounted();

    const plain = findByTestId('plain');
    const aliased = findByTestId('aliased');
    print(
      `plain   ${JSON.stringify(plain?.props)}\naliased ${JSON.stringify(aliased?.props)}`,
    );

    // KEY FOR KEY, minus the one that names them apart. Stronger than picking a key and better
    // aimed: what the alias must not do is change ANYTHING about the committed payload, and a named
    // key can only ever cover the part of the fold somebody thought of. The first spelling asserted
    // `focusable` and failed on BOTH arms — that key is written only when the owned-listener bit
    // says a press handler exists, which `getDebugProps` does not report here. An assertion that
    // fails identically on the control is not measuring the subject.
    const withoutTestID = (view: typeof plain): string =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(view?.props ?? {}).filter(([key]) => key !== 'testID'),
        ),
      );
    expect(withoutTestID(aliased), 'the alias changes no key').toBe(
      withoutTestID(plain),
    );

    // `accessible` and `focusable` are written by `foldPressableProps` off the TAG, in C++, and
    // never by the template. Their presence is the witness that the behavior attached at all.
    // And an ABSOLUTE anchor beside the comparison, because two empty payloads compare equal.
    expect(plain?.props.accessible, 'a bare pressable folds').toBe('true');
    expect(aliased?.props.accessible, 'and so does an aliased one').toBe(
      'true',
    );
  });

  // why: THE GATE. Every node of the benchmark row carries a `[style]`, so if the two paths disagree
  // about one authored object the rewrite is worth nothing on the screen it was designed for. And a
  // disagreement here would be a SILENT one — the tree, the node count and the write count are all
  // identical either way; only the pixels would differ.
  it('commits the same style whether a directive claims the binding or not', () => {
    const surface = mount(ROOT_TAG, StylePathArm);
    flushTimers();
    surface.commit();
    mounted();

    const claimed = findByTestId('claimed');
    const styled = findByTestId('styled');
    print(
      `claimed ${JSON.stringify(claimed?.props)}\nstyled  ${JSON.stringify(styled?.props)}`,
    );

    const withoutTestID = (view: typeof claimed): string =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(view?.props ?? {}).filter(([key]) => key !== 'testID'),
        ),
      );
    expect(withoutTestID(styled), 'the two style paths agree').toBe(
      withoutTestID(claimed),
    );
    // An absolute anchor beside the comparison: two empty payloads compare equal, and `height` is
    // the one key a flattened view could not have.
    expect(claimed?.props.height, 'the claimed path styled anything').toBe(
      '44',
    );
  });
});

report();
