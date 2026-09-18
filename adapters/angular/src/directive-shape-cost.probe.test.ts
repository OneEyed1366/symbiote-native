// WHAT A DIRECTIVE COSTS, taken apart.
//
// The directive-shaped bench arm runs 1.64x the bare-tag one — 292 ms against 178 on a 1 000-row
// create (`core/engine/cpp/tests/js/angular-elements-suite.itest.ts`), which is ~16 us per directive
// instance over the seven a row carries. That number is the whole remaining Angular deficit and it
// has never been taken apart, so the next fix would be aimed by guesswork.
//
// WHAT IT ANSWERS, at 10 000 elements, and ONLY what survived two runs whose own floors were 1.0 ms
// and 9.2 ms. The floor moves between runs, so a reading counts here only if it clears the WIDER one:
//
//   a directive at all    FREE. `inert` reads 12.35-12.97 us/element against a bare tag's
//                         12.60-12.87 — the two swap places between runs, which is what "no
//                         difference" looks like. Angular's per-directive bookkeeping is not the cost.
//   its three injections  +12.4-13.0 us/element, i.e. HALF of what a directive-shaped element costs,
//                         and far outside either floor. THIS IS THE WHOLE OF IT.
//
//   ngOnChanges           SETTERS ARE WORSE, +2.75 and +2.95 us/element across the two runs, both
//                         outside their own floor. Not a saving in the wrong size — a cost, in the
//                         opposite direction from the rewrite that was proposed here. Closed.
//   279 declared inputs   +3.3 and +1.3 us/element, both outside their floor but disagreeing by 2.5x.
//                         Real, small, and not worth a number tighter than "some".
//
// THE 2 000-ELEMENT VERSION OF THIS FILE GOT THREE OF THESE BACKWARDS, and the floor is why: the
// control pair disagreed by 2.8 ms while the deltas being read were 3.1. It reported "a directive at
// all ~3.3 ms, and it is Angular's own" and "279 declared inputs: NOTHING", both of which the bigger
// N reverses. An instrument that cannot beat its own control answers nothing however many rounds it
// averages — and the fix was SIZE, not more rounds.
//
// ONE MORE TRAP, and it is this file's own units: the table prints BOTH ms and us/element, and the
// floor is in ms. Reading a us/element delta against a ms floor makes a real finding look like noise
// — which is what happened to the setter row on the first pass through these numbers.
//
// So the lever is DEPENDENCY INJECTION and nothing else here is measurable. Read that before
// proposing the next rewrite of `elements.ts`.
//
// The arms, separated by construction rather than by argument:
//
//   bare        no directive at all — the floor, and what the six-column ruler measures
//   inert       a directive with inputs and NOTHING else — Angular's own per-directive bookkeeping
//   minimal     + three injections and `ngOnChanges`, i.e. `SymbioteElement` in miniature
//   control     byte-identical to `minimal` — see `ControlElement`, and read it FIRST
//   setters     the same inputs as SETTERS, no `ngOnChanges`  -> the `SimpleChanges` share
//   full        the real `SymbioteElement`, 279 declared inputs  -> what the DECLARATION count costs
//
// EVERY ROW IS READ AGAINST THE CONTROL PAIR, which is the whole reason the file is trustworthy: two
// arms doing identical work disagree by some amount, and nothing smaller than that is a finding. The
// report prints that floor and labels each row against it rather than leaving the reader to guess.

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
import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mount, unmount } from './render';
import { ViewElement } from './elements';

// TEN THOUSAND, not two. At 2 000 the control pair disagreed by 2.8 ms against deltas of 3.1 — an
// instrument that cannot separate the thing it was built to separate. Noise here is dominated by
// scheduling rather than by the work, so it grows far slower than the signal does; the floor is what
// says whether that worked, and it is printed for exactly that reason.
const ELEMENTS = 10000;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// `SymbioteElement`'s shape in miniature: three injections, three inputs, `ngOnChanges` forwarding.
@Directive({ selector: 'minimal-tag', standalone: true })
class MinimalElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);

  @Input() testID?: string;
  @Input() ellipsizeMode?: string;
  @Input() pointerEvents?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

// THE CONTROL, and the most important arm in the file: byte-identical to `minimal`, under a different
// selector. Two arms that do the same work must read the same, and whatever they differ by is this
// instrument's floor — no smaller difference anywhere else in the table carries a verdict.
//
// It earned its place immediately. The first spelling of this probe had two arms that were identical
// BY ACCIDENT (a two-injection variant that had been written with two all along) and they read 16.1
// against 12.3 — a 30% spread presented as a finding about dependency injection. A named control
// makes that impossible to misread again.
@Directive({ selector: 'control-tag', standalone: true })
class ControlElement implements OnChanges {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);

  @Input() testID?: string;
  @Input() ellipsizeMode?: string;
  @Input() pointerEvents?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      this.renderer.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

// ONE injection instead of three. `ElementRef` is the only one that is genuinely per-element;
// `Renderer2` resolves the SAME surface-bound object for every instance on the screen, and
// `ChangeDetectorRef` the same view. If two injections are worth more than this file's floor, moving
// them off the base is a real lever; if they are not, the whole line of attack is closed.
let sharedRenderer: Renderer2 | undefined;

@Directive({ selector: 'one-inject-tag', standalone: true })
class OneInjectElement implements OnChanges {
  private readonly host = inject(ElementRef);

  @Input() testID?: string;
  @Input() ellipsizeMode?: string;
  @Input() pointerEvents?: string;

  ngOnChanges(changes: SimpleChanges): void {
    for (const name of Object.keys(changes))
      sharedRenderer?.setProperty(
        this.host.nativeElement,
        name,
        changes[name]?.currentValue,
      );
  }
}

// Captures the renderer once so the arm above has one to write through — this is the PROBE's
// shortcut, not a proposal: a real one would have to survive several surfaces.
@Directive({ selector: 'one-inject-host', standalone: true })
class OneInjectHost {
  constructor() {
    sharedRenderer = inject(Renderer2);
  }
}

// THE FLOOR OF "A DIRECTIVE EXISTS": no injections, no forwarding, no lifecycle. Whatever separates
// this from `bare` is Angular's own per-directive bookkeeping and is not ours to remove.
@Directive({ selector: 'inert-tag', standalone: true })
class InertElement {
  @Input() testID?: string;
  @Input() ellipsizeMode?: string;
  @Input() pointerEvents?: string;
}

// The same three inputs, written as SETTERS. Angular writes straight through them and never builds a
// `SimpleChanges` — `usesOnChanges` is absent from the declaration entirely.
// THE THIRD INJECTION IS HERE ON PURPOSE, matching `minimal` exactly. Without it this arm differs
// from its comparison in TWO ways and the delta cannot be attributed — the first spelling had two
// injections and read 2.44 us/element cheaper, which was quietly the injection plus the lifecycle.
@Directive({ selector: 'setter-tag', standalone: true })
class SetterElement {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);
  protected readonly detector = inject(ChangeDetectorRef);

  @Input() set testID(value: string | undefined) {
    this.renderer.setProperty(this.host.nativeElement, 'testID', value);
  }
  @Input() set ellipsizeMode(value: string | undefined) {
    this.renderer.setProperty(this.host.nativeElement, 'ellipsizeMode', value);
  }
  @Input() set pointerEvents(value: string | undefined) {
    this.renderer.setProperty(this.host.nativeElement, 'pointerEvents', value);
  }
}

// `[testID]` is BOUND rather than static, so a change-detection pass has something to check on every
// element. That is what the update arm below measures, and it is the shape a `select` has: one row
// changes, and Angular checks all of them.
const TEMPLATE = (tag: string): string =>
  `<view testID="host">${Array.from(
    { length: ELEMENTS },
    () => `<${tag} [testID]="label()" ellipsizeMode="tail"></${tag}>`,
  ).join('')}</view>`;

/** Every arm reads the same signal, so a pass has identical work to do above the directive. */
const label = signal('a');

/** Angular resolves `label()` against the component instance, so every arm needs the field. */
class ArmBase {
  readonly label = label;
}

@Component({
  selector: 'bare-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: TEMPLATE('bare-tag'),
})
class BareArm extends ArmBase {}

@Component({
  selector: 'minimal-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [MinimalElement],
  template: TEMPLATE('minimal-tag'),
})
class MinimalArm extends ArmBase {}

@Component({
  selector: 'setter-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SetterElement],
  template: TEMPLATE('setter-tag'),
})
class SetterArm extends ArmBase {}

@Component({
  selector: 'control-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ControlElement],
  template: TEMPLATE('control-tag'),
})
class ControlArm extends ArmBase {}

@Component({
  selector: 'one-inject-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [OneInjectElement, OneInjectHost],
  template: `<view one-inject-host testID="host"
    >${Array.from(
      { length: ELEMENTS },
      () => `<one-inject-tag testID="e" ellipsizeMode="tail"></one-inject-tag>`,
    ).join('')}</view
  >`,
})
class OneInjectArm extends ArmBase {}

@Component({
  selector: 'inert-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [InertElement],
  template: TEMPLATE('inert-tag'),
})
class InertArm extends ArmBase {}

// `<view>` carries the real `ViewElement`, which extends `SymbioteElement` and its 279 inputs.
@Component({
  selector: 'full-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ViewElement],
  template: TEMPLATE('view'),
})
class FullArm extends ArmBase {}

/**
 * Best of N per arm, ROUND-ROBIN rather than arm by arm.
 *
 * Timing noise is one-sided — it only ever ADDS — so the minimum is the closest reading to the work
 * itself. But running each arm's samples in a BLOCK hands the later arms a warmer JIT than the first
 * ones, and the first spelling of this file did exactly that: a two-injection arm read SLOWER than
 * the three-injection one it is a strict subset of, which is not a result, it is a bias. Interleaving
 * gives every arm the same distribution of cold and warm rounds.
 */
async function race(
  arms: readonly (readonly [string, unknown])[],
  rounds = 7,
): Promise<{
  readonly create: Map<string, number>;
  readonly check: Map<string, number>;
}> {
  const create = new Map<string, number>();
  const check = new Map<string, number>();
  let rootTag = 8100;
  for (let round = 0; round < rounds; round += 1) {
    for (const [name, component] of arms) {
      rootTag += 1;
      fabric.reset();
      label.set('a');
      const startedAt = performance.now();
      mount(rootTag, component);
      await tick();
      create.set(
        name,
        Math.min(create.get(name) ?? Infinity, performance.now() - startedAt),
      );

      // A PASS THAT CHANGES NOTHING, which is what a `select` does to the 999 rows it did not
      // touch: the signal moves, Angular re-checks every binding in the template, and every one of
      // them compares equal. Nothing should reach the engine at all — so whatever this costs is the
      // price of CHECKING an element, and the directive is the only difference between the arms.
      const checkedAt = performance.now();
      label.set('a');
      label.set('b');
      label.set('a');
      await tick();
      check.set(
        name,
        Math.min(check.get(name) ?? Infinity, performance.now() - checkedAt),
      );

      unmount(rootTag);
    }
  }
  return { create, check };
}

describe('what a directive costs, taken apart', () => {
  it('separates the directive, its ngOnChanges and its input count', async () => {
    const times = await race([
      ['bare', BareArm],
      ['inert', InertArm],
      ['one-inject', OneInjectArm],
      ['minimal', MinimalArm],
      ['control', ControlArm],
      ['setters', SetterArm],
      ['full', FullArm],
    ]);
    const read = (name: string): number => times.create.get(name) ?? Number.NaN;
    const checked = (name: string): number =>
      times.check.get(name) ?? Number.NaN;
    const bare = read('bare');
    const inert = read('inert');
    const oneInject = read('one-inject');
    const minimal = read('minimal');
    const control = read('control');
    const setters = read('setters');
    const full = read('full');
    // What two arms doing identical work disagree by. Every other row is read against it.
    const floor = Math.abs(minimal - control);

    const perElement = (ms: number): string =>
      `${((ms * 1000) / ELEMENTS).toFixed(2)} us/element`;

    writeFileSync(
      fileURLToPath(
        new URL('../../../.docs/angular-directive-shape.txt', import.meta.url),
      ),
      `${[
        `${ELEMENTS} elements, best of 7, arms interleaved`,
        '',
        `${'arm'.padStart(10)}${'ms'.padStart(9)}   per element`,
        `${'bare'.padStart(10)}${bare.toFixed(1).padStart(9)}   ${perElement(bare)}`,
        `${'inert'.padStart(10)}${inert.toFixed(1).padStart(9)}   ${perElement(inert)}`,
        `${'1-inject'.padStart(10)}${oneInject.toFixed(1).padStart(9)}   ${perElement(oneInject)}`,
        `${'minimal'.padStart(10)}${minimal.toFixed(1).padStart(9)}   ${perElement(minimal)}`,
        `${'control'.padStart(10)}${control.toFixed(1).padStart(9)}   ${perElement(control)}  <- identical to minimal`,
        `${'setters'.padStart(10)}${setters.toFixed(1).padStart(9)}   ${perElement(setters)}`,
        `${'full'.padStart(10)}${full.toFixed(1).padStart(9)}   ${perElement(full)}`,
        '',
        `THE FLOOR               ${floor.toFixed(1)} ms   minimal against its own twin`,
        // A BANNER RATHER THAN A FAILING ASSERTION, and the difference matters: a run under the full
        // parallel suite is descheduled often enough that the control pair stops agreeing, which is
        // the instrument working correctly and not a defect to break CI over. What the guard owes is
        // that nobody quotes a table with no signal in it — so it says so, loudly, in the table.
        ...(floor < Math.abs(minimal - setters)
          ? []
          : [
              '',
              '!!! NO VERDICT THIS RUN — the control pair disagrees by more than the deltas below.',
              '!!! Re-run this file alone; under the full suite it is descheduled mid-measurement.',
            ]),
        '',
        'A CHECK THAT CHANGES NOTHING — the shape of a select, per arm',
        ...[
          'bare',
          'inert',
          'one-inject',
          'minimal',
          'control',
          'setters',
          'full',
        ].map(
          name =>
            `${name.padStart(10)}${checked(name).toFixed(1).padStart(9)} ms   ${((checked(name) * 1000) / ELEMENTS).toFixed(2)} us/element`,
        ),
        `check floor             ${Math.abs(checked('minimal') - checked('control')).toFixed(1)} ms`,
        '',
        ...(
          [
            ['a directive at all  ', inert - bare],
            ['two of its injects  ', minimal - oneInject],
            ['its three injections', minimal - inert],
            ['its ngOnChanges     ', minimal - setters],
            ['279 declared inputs ', full - minimal],
          ] as const
        ).map(
          ([label, delta]) =>
            `${label}    ${delta.toFixed(1).padStart(6)} ms   ${Math.abs(delta) > floor ? 'outside the floor' : 'INSIDE THE FLOOR — no verdict'}`,
        ),
        '',
      ].join('\n')}\n`,
    );

    expect(bare).toBeGreaterThan(0);
    expect(full).toBeGreaterThan(0);
    // Seven arms, seven rounds, ten thousand elements each — well past vitest's default.
  }, 120_000);
});
