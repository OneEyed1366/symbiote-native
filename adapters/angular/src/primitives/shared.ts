import {
  ChangeDetectorRef,
  Directive,
  type DoCheck,
  ElementRef,
  inject,
  Input,
  type OnChanges,
  Renderer2,
  type SimpleChanges,
} from '@angular/core';
import { countAngular } from '../diagnostics';
import {
  flattenStyle,
  isSymbioteNode,
  type IHostInstance,
  type IStyleProp,
} from '@symbiote-native/engine';

/**
 * A composed Angular component (Pressable, SafeAreaView, ScrollView, ...) is created as a
 * non-painting ANCHOR host (`ANCHOR_HOST_COMPONENTS` in renderer.ts) so it doesn't paint an
 * extra native view over its own template's real content. `class="..."`/`[class.x]`/`[ngClass]`
 * at the component's use site ALWAYS resolves through the renderer's addClass/removeClass onto
 * that anchor — Angular gives no `@Input()` interception hook for `class` the way it does for
 * `[style]` (which is why `style` alone was declared as an `@Input()` in the first place, see
 * `SymbiotePrimitiveHost` above) — so the anchor ends up holding the fully-resolved class-derived
 * style (`routeProp`'s `commitClassStyle` already wrote it to `anchor.props.style`) while the
 * REAL native node the component's own template creates never sees it.
 *
 * Call this from a composed component's own `hostProps`/style getter and merge the result AHEAD
 * of its own explicit `style` @Input, e.g. `style: [anchorHostStyle(this.elementRef),
 * this.resolvedStyle]` — array order matters: `flattenStyle`'s later-wins collapse is what makes
 * an explicit `[style]` on the component still beat its ambient class, mirroring the
 * class-loses-to-explicit-style cascade `commitClassStyle` already enforces for a direct
 * primitive. `this.elementRef` must be this component's OWN injected `ElementRef` (its anchor
 * host), not a `@ViewChild` into its template's inner primitive.
 *
 * Skipping this call for a new `ANCHOR_HOST_COMPONENTS` entry compiles clean under `tsc` AND a
 * real `ngc` AOT build — no type error, no template error — it just silently drops `class="..."`
 * forever; only a device/simulator render (or a committed-node style assertion) catches it.
 */
export function anchorHostStyle(elementRef: ElementRef<unknown>): unknown {
  const node = elementRef.nativeElement;
  return isSymbioteNode(node) ? node.props.style : undefined;
}

// anchorHostStyle returns `unknown` (it reads whatever already resolved onto the anchor node's
// props bag); a style prop's fields are all optional so any object structurally satisfies it —
// this narrows just enough (falsy-per-IStyleProp, or an object/array) to fold it into a
// strictly-typed IStyleProp<T> array without an `as` cast, for a composed component whose own
// inner primitive declares a real `@Input() style: IStyleProp<SomeConcreteStyle>` (e.g.
// TouchableOpacity's Pressable, Button's TouchableOpacity) rather than the loosely-typed
// `symbioteHostProps` bag most composed components merge anchorHostStyle into directly.
function isStyleValue<T>(value: unknown): value is IStyleProp<T> {
  return (
    value === undefined ||
    value === null ||
    value === false ||
    value === '' ||
    typeof value === 'object'
  );
}

export function anchorStyleProp<T>(elementRef: ElementRef<unknown>): IStyleProp<T> | undefined {
  const value = anchorHostStyle(elementRef);
  return isStyleValue<T>(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function shallowStyleEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(key => a[key] === b[key]);
}

/**
 * `anchorHostStyle` must be re-read on every check (a bare `class="x"` with no matching
 * `[style]` binding never appears in Angular's `SimpleChanges`/dirty-check inputs, so nothing
 * else signals "the anchor's class-derived style may have changed"). But `flattenStyle([...])`
 * always allocates a FRESH object, even when its content is byte-for-byte identical to last
 * time — and a windowed list component (FlatList/VirtualizedList/SectionList/
 * VirtualizedSectionList) binds its resolved style into a structural-directive-bound `@Input()`
 * chain where a fresh reference on an UNRELATED CD pass is mistaken for a real change, which
 * reschedules ANOTHER CD tick (`VListOutletDirective`'s `context` `@Input()` calling
 * `markForCheck()`) — free-running forever. See the `flat-list-array-style.test.ts` regression
 * this fixes (and the near-identical `lastRecompute` dedup guard in `virtualized-list/index.ts`,
 * which this mirrors at the style-merge call site instead of a whole recompute step). Returns
 * `previous` unchanged when the freshly-flattened merge is shallow-equal to it, so a downstream
 * `@Input() style` binding sees NO change and skips its own update on an unrelated tick.
 */
export function stableAnchorStyle(
  elementRef: ElementRef<unknown>,
  explicitStyle: unknown,
  previous: unknown,
): Record<string, unknown> {
  const next = flattenStyle([anchorHostStyle(elementRef), explicitStyle]);
  return isRecord(previous) && shallowStyleEqual(previous, next) ? previous : next;
}

const ON_PREFIX = /^on[A-Z]/;

// The one `onX` that fires per FRAME rather than per gesture, and with sticky headers RN pins
// `scrollEventThrottle` to 1 (ScrollView.js), so 60 times a second. Since markForCheck walks
// RefreshView|Dirty to the ROOT, wrapping it cost one full ancestor-screen template execution per
// frame - the canary's ~37fps scroll (components/virtualized-list/scroll-cost.test.ts).
//
// Nothing lost its refresh: VirtualizedList marks itself when the window moves, sticky rides the
// native driver, and a caller's own handler is typically an Animated.event touching no Angular
// state. Drag/momentum begin/end stay wrapped - once per gesture is not a hot path.
const PER_FRAME_CALLBACK = 'onScroll';

/**
 * Restores the OnPush dirty-marking Angular skips for a `[style]` binding that a directive
 * declares as an input. Attach it to any component declaring a `style` input:
 * `hostDirectives: [{ directive: SymbioteStyleInputDirective, inputs: ['style'] }]`.
 *
 * An ordinary `[foo]` binding compiles to `ɵɵproperty` -> `setPropertyAndInputs`, whose last act
 * for a component host is `markDirtyIfOnPush` (`render3/instructions/shared.ts`) — the flag
 * `detectChangesInView` needs before it will re-execute a non-CheckAlways view. `[style]` and
 * `[class]` do NOT take that path: they compile to the styling instructions, which on finding a
 * directive input of the same name hand off to `setDirectiveInputsWhichShadowsStyling`
 * (`render3/instructions/property.ts`) — two lines that write the input and stop. No dirty flag.
 * The input lands and `ngOnChanges` fires, but the receiving component's own template, and every
 * getter it reads, is frozen at its creation value. Verified against @angular/core 22.0.8.
 *
 * Symbiote sits squarely on that gap: every composed component declares `style` as a real
 * `@Input()` on purpose, because a raw `[style]` binding would otherwise be decomposed key by key
 * by Angular's CSS style engine, which cannot represent an RN StyleProp array or an Animated value
 * (see `SymbiotePrimitiveHost` above). So the one binding name Angular forgets to mark is the one
 * carrying the whole styling surface.
 *
 * `markForCheck()` here is exactly the skipped `markDirtyIfOnPush`, not a bigger hammer: the write
 * happens inside the parent's refresh, and `markViewDirty` uses the `Dirty` bit alone while views
 * are refreshing (`render3/instructions/mark_view_dirty.ts`), which the ancestors then clear at the
 * end of their own `refreshView`. A component that already bridges its inputs into a signal (the
 * `inputsRevision` + `computed` pattern — Pressable, ScrollView) is immune on its own, since a
 * signal write dirties the template consumer, which `detectChangesInView` honors in any mode.
 */
@Directive({
  selector: '[symbioteStyleInput]',
  standalone: true,
  inputs: ['style'],
})
export class SymbioteStyleInputDirective implements DoCheck, OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  // A host directive's ElementRef is the HOST COMPONENT's element - i.e. exactly the anchor a
  // `class=` at the use site resolves onto.
  private readonly elementRef = inject(ElementRef);
  private lastAnchorStyle: unknown;

  style?: unknown;

  ngOnChanges(): void {
    this.cdr.markForCheck();
  }

  // The `class` half of the same gap, and it needs a POLL, not a hook: a class at the use site
  // never becomes an input, so there is no SimpleChanges entry to fire on. Making the view refresh
  // is enough - every composed component re-reads the anchor in a getter on its own.
  //
  // ngDoCheck runs during the PARENT's refresh even when this view would be skipped, so the mark
  // lands in the same pass rather than one behind. The dedup gate is load-bearing: marking on every
  // check re-dirties the view every tick and free-runs CD, the hazard `stableAnchorStyle` above
  // prevents one level up.
  ngDoCheck(): void {
    countAngular('styleChecks');
    const current = anchorHostStyle(this.elementRef);
    if (isAnchorStyleUnchanged(this.lastAnchorStyle, current)) return;
    this.lastAnchorStyle = current;
    countAngular('styleMarks');
    this.cdr.markForCheck();
  }
}

// Reference equality is the normal path (the engine replaces props.style only on a real class
// change); the shallow compare guards against an equal-but-fresh object, which would turn the poll
// above into a CD loop.
function isAnchorStyleUnchanged(previous: unknown, next: unknown): boolean {
  if (Object.is(previous, next)) return true;
  return isRecord(previous) && isRecord(next) && shallowStyleEqual(previous, next);
}

/**
 * Base for all Angular primitive host components (`symbiote-view`, `symbiote-text`, ...).
 * RN's `StyleProp` can be an object, an array, nested arrays, falsy entries, and Animated
 * values. Angular's raw `[style]` binding on a custom element routes through the CSS style
 * engine (`setStyle` per key), which crashes on numeric array keys. By declaring `style` as
 * an Angular `@Input()` on a known component, we intercept it here and forward a flattened
 * style object through `Renderer2.setProperty`, bypassing Angular's CSS styling path.
 *
 * Other props (source, pointerEvents, ...) are intentionally *not* declared as inputs.
 * Angular then treats them as host property bindings and still dispatches them through the
 * custom renderer's `setProperty`, so the engine's `routeProp` handles them as usual.
 */
@Directive()
export abstract class SymbiotePrimitiveHost implements DoCheck, OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly elementRef = inject(ElementRef);

  // Counting only. Angular calls this once per view per check, so it is the only honest measure of
  // how much tree a tick walks - and with CheckAlways primitives that is the whole application, not
  // the screen on top. One integer increment next to a template refresh is not measurable.
  ngDoCheck(): void {
    countAngular('viewsChecked');
  }

  @Input() style?: IStyleProp<unknown>;

  /**
   * The underlying engine host node (public instance). Exposed so `findNodeHandle` can resolve
   * an Angular template ref (`#ref`) on a primitive host to its native reactTag.
   */
  get nativeElement(): IHostInstance {
    return this.elementRef.nativeElement;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!('style' in changes)) return;
    const value = this.style === undefined ? undefined : flattenStyle(this.style);
    this.renderer.setProperty(this.elementRef.nativeElement, 'style', value);
  }
}

/**
 * Applies a whole resolved props record (a shared `renderX(...).props` bag) onto a host
 * element via `Renderer2.setProperty`, one call per key. Angular templates compile bindings
 * ahead of time — there is no `v-bind="obj"` equivalent for a custom element — so a component
 * whose props come from a shared render function would otherwise have to declare every key as
 * its own static `[prop]="hostProps['x']"` binding. This generalizes the pattern
 * `SwitchHostPropsDirective` proved first: `<symbiote-x [symbioteHostProps]="hostProps" #ref="symbioteHost">`,
 * with `ref.node` exposing the native element for any imperative follow-up call.
 */
@Directive({
  selector: '[symbioteHostProps]',
  standalone: true,
  exportAs: 'symbioteHost',
  inputs: ['symbioteHostProps'],
})
export class SymbioteHostPropsDirective {
  private readonly renderer = inject(Renderer2);
  private readonly elementRef = inject<ElementRef<unknown>>(ElementRef);
  // The directive lives in its HOST component's template, so its injected ChangeDetectorRef IS
  // that component's own view detector — the one thing that can refresh it (see wrapCallback).
  private readonly cdr = inject(ChangeDetectorRef);
  // One wrapper per ORIGINAL handler, for the lifetime of this directive. Without it every push
  // of the props bag allocated a brand-new closure for every `onX` key, and the engine stored it
  // as a new listener (`setEventListener` allocates its own closure on top) - per key, per push,
  // on a path a scroll frame reaches 60 times a second. The wrapper body closes over nothing but
  // `value` and this instance's `cdr`, so the handler alone is a complete cache key; `key` is
  // read only by the ON_PREFIX guard above and never enters the wrapper.
  //
  // Reference stability is the point, not just the allocation: a fresh function on every push
  // defeats every downstream identity check on the bag, so nothing upstream could ever conclude
  // "this bag is unchanged" while a callback prop was in it.
  private readonly wrappers = new WeakMap<object, (...args: unknown[]) => unknown>();

  get node(): unknown {
    return this.elementRef.nativeElement;
  }

  set symbioteHostProps(props: Record<string, unknown>) {
    for (const [key, value] of Object.entries(props)) {
      this.renderer.setProperty(this.elementRef.nativeElement, key, this.wrapCallback(key, value));
    }
  }

  // A flat-bag `onX` callback (responder negotiation, onLongPress, …) is invoked by the engine's
  // event dispatch — a plain JS call, entirely outside Angular. In Angular 20 a component compiles
  // as a SignalView (not CheckAlways), so a plain (non-signal) state mutation inside such a callback
  // does NOT dirty the view's reactive consumer, and the scheduler's root detectChanges() will NOT
  // descend into it (a Global pass only refreshes CheckAlways / Dirty / RefreshView views) — the
  // "pan does nothing" bug on a nested component. `markForCheck()` flags THIS component's view AND
  // all its ancestors with RefreshView (which survives the descent) and notifies the CD scheduler,
  // so the next root tick repaints the mutation. It targets the directive's injecting view
  // (`_cdRefInjectingView`, i.e. the host component), unlike `detectChanges()` which acts on a
  // resolved `_lView` that is NOT the host component here. The Angular twin of what React/Vue get
  // for free (setState / proxy reactivity).
  private wrapCallback(key: string, value: unknown): unknown {
    if (!ON_PREFIX.test(key) || typeof value !== 'function') return value;
    if (key === PER_FRAME_CALLBACK) return value;
    const cached = this.wrappers.get(value);
    if (cached !== undefined) return cached;
    // Reflect.apply rather than calling a cast-to-signature local: `typeof value === 'function'`
    // narrows to `Function`, which has no call signature TypeScript will accept, and this repo
    // does not use `as` to paper over that. `undefined` as the receiver preserves the previous
    // unbound call.
    const wrapper = (...args: unknown[]): unknown => {
      const result: unknown = Reflect.apply(value, undefined, args);
      this.cdr.markForCheck();
      return result;
    };
    this.wrappers.set(value, wrapper);
    return wrapper;
  }
}
