// WHAT A DIRECTIVE COSTS, taken apart.
//
// The directive-shaped bench arm runs 1.64x the bare-tag one — 292 ms against 178 on a 1 000-row
// create (`core/engine/cpp/tests/js/angular-elements-suite.itest.ts`), which is ~16 us per directive
// instance over the seven a row carries. That number is the whole remaining Angular deficit and it
// has never been taken apart, so the next fix would be aimed by guesswork.
//
// WHAT IT ANSWERED, 2026-09-18, twice with a floor of 2-3 ms per run:
//
//   279 declared inputs   NOTHING — inside the floor both times. Angular's input map is per-TYPE and
//                         static, so the exhaustive surface `elements.ts` declares for TYPING costs
//                         no instance anything. "Declare fewer inputs" is closed.
//   ngOnChanges           ~4 ms of ~12, i.e. about a third of the directive's discretionary cost —
//                         and the price of collecting it is 279 hand-written setters. Closed.
//   two of three injects  ~1.9 us/element, barely outside the floor, and both are load-bearing:
//                         `Renderer2` would have to become a module-level singleton (wrong the
//                         moment a second surface exists) and `ChangeDetectorRef` is what gives a
//                         prop callback its `markForCheck` — whose absence was a device-reported bug.
//   a directive at all    ~3.3 ms, and it is Angular's own bookkeeping. Not ours.
//
// So the remaining deficit is NOT adapter-shaped. Read that before proposing the next rewrite of
// `elements.ts`.
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
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mount, unmount } from './render';
import { ViewElement } from './elements';

const ELEMENTS = 2000;
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
@Directive({ selector: 'setter-tag', standalone: true })
class SetterElement {
  private readonly renderer = inject(Renderer2);
  private readonly host = inject(ElementRef);

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

const TEMPLATE = (tag: string): string =>
  `<view testID="host">${Array.from(
    { length: ELEMENTS },
    () => `<${tag} testID="e" ellipsizeMode="tail"></${tag}>`,
  ).join('')}</view>`;

@Component({
  selector: 'bare-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: TEMPLATE('bare-tag'),
})
class BareArm {}

@Component({
  selector: 'minimal-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [MinimalElement],
  template: TEMPLATE('minimal-tag'),
})
class MinimalArm {}

@Component({
  selector: 'setter-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [SetterElement],
  template: TEMPLATE('setter-tag'),
})
class SetterArm {}

@Component({
  selector: 'control-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ControlElement],
  template: TEMPLATE('control-tag'),
})
class ControlArm {}

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
class OneInjectArm {}

@Component({
  selector: 'inert-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [InertElement],
  template: TEMPLATE('inert-tag'),
})
class InertArm {}

// `<view>` carries the real `ViewElement`, which extends `SymbioteElement` and its 279 inputs.
@Component({
  selector: 'full-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ViewElement],
  template: TEMPLATE('view'),
})
class FullArm {}

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
): Promise<Map<string, number>> {
  const fastest = new Map<string, number>();
  let rootTag = 8100;
  for (let round = 0; round < rounds; round += 1) {
    for (const [name, component] of arms) {
      rootTag += 1;
      fabric.reset();
      const startedAt = performance.now();
      mount(rootTag, component);
      await tick();
      const took = performance.now() - startedAt;
      unmount(rootTag);
      fastest.set(name, Math.min(fastest.get(name) ?? Infinity, took));
    }
  }
  return fastest;
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
    const read = (name: string): number => times.get(name) ?? Number.NaN;
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
  });
});
