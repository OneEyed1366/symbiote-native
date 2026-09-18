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

import { SYMBIOTE_ELEMENTS, mount } from '@symbiote-native/angular';
import { readSurfaceTelemetry } from '@symbiote-native/engine';

import {
  describe,
  expect,
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

const ladderTemplate = (tag: string): string =>
  `<view>@for (item of items; track item) { <${tag} [testID]="item"></${tag}> }</view>`;

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

describe('what a matched element directive costs on JavaScriptCore', () => {
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
      ['minimal', MinimalArm],
      ['full', DirectiveArm],
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
        `279 inputs, not 1     ${verdict('full', 'minimal')}`,
      ].join('\n'),
    );

    // No threshold on any delta — that is what the print is for, and a bound would either be so
    // loose it says nothing or so tight it fails on a busy machine.
  });
});

report();
