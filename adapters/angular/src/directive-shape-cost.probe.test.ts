// WHAT A DIRECTIVE COSTS, taken apart.
//
// The directive-shaped bench arm runs 1.64x the bare-tag one — 292 ms against 178 on a 1 000-row
// create (`core/engine/cpp/tests/js/angular-elements-suite.itest.ts`), which is ~16 us per directive
// instance over the seven a row carries. That number is the whole remaining Angular deficit and it
// has never been taken apart, so the next fix would be aimed by guesswork.
//
// EVERY NUMBER THIS FILE PUBLISHED BEFORE 2026-09-18 WAS READ ACROSS A CENSUS IT NEVER TOOK, and
// three of its four findings are void. The arms do not push the same prop writes at the engine —
// they cannot, because a matched directive CLAIMS a binding that would otherwise reach
// `setProperty` — so several pairs it compared were never two spellings of one workload:
//
//   bare        20 001 writes    testID as a property + ellipsizeMode as a static ATTRIBUTE
//   inert       10 001           testID claimed by the directive and forwarded nowhere
//   minimal     30 001           both forwarded out of `ngOnChanges`, plus the attribute
//   full        20 002           `ViewElement` does not declare `ellipsizeMode` — it is a Text prop
//
// A static attribute reaches the renderer whatever matches the element (Ivy writes it AND feeds it
// to the input), which is where the odd 10 000 comes from and why no pair agrees by accident.
//
// So: "a directive at all is FREE" compared 2 writes against 1, "279 declared inputs" compared 2
// against 3, and "two of its injects" read an arm that FORWARDED NOTHING — its host directive used
// an element selector where the template writes an attribute, so it never matched and the renderer
// it was supposed to capture stayed `undefined`. The one survivor is the setter row, whose pair
// happens to agree at 30 001.
//
// WHAT IT ANSWERS NOW, at 10 000 elements, every row read only against a pair whose census agrees:
//
//   one injection         ~4.2 us/element. `minimal` against `one-inject` reads 76-97 ms over TWO of
//                         them across nine runs, always outside the bar, censuses agreeing at
//                         30 001/30 002. THREE is ~12.6 us/element — roughly half of what a
//                         directive-shaped element costs, and the whole remaining lever here.
//   ngOnChanges           SETTERS ARE WORSE, -4.8 to -20.5 ms over nine runs, census agreeing at
//                         30 001. Unchanged by the correction, and the opposite direction from the
//                         rewrite once proposed here.
//   forwarding a prop     UNRESOLVED, and recorded as that rather than rounded to "free". Twenty
//                         thousand extra writes read anywhere from -32 ms to +0.5 across nine runs —
//                         the negative half is impossible as work, so what that row measures is the
//                         instrument, not the write path. Not positional: rotating the arm order
//                         changed nothing. Whatever it is, the write path is not LARGE.
//   a directive at all    NO LONGER MEASURED — `bare` and `inert` cannot be compared, and making
//                         them comparable means a template with no static attribute, which is a
//                         different file's question.
//
// The cross-check that makes the injection figure trustworthy is arithmetic rather than a repeat:
// `no-forward - inert` is one injection plus `ngOnChanges` at 71.6 ms, and `minimal - inert` minus
// the two-injection delta lands at 71.5. Two paths to the same number through different arms.
//
// THE CONTROL PAIR WAS NEVER ENOUGH, and that is the root of every reversal in this file's history.
// It answers "how far apart do two IDENTICAL arms land in ONE run" — a real question, and not the
// one a reader needs. An arm's own minimum has moved 30 ms BETWEEN runs while that floor read 2.0,
// and `full` once swung 47 ms with nothing changed. So each arm now reports the gap between its best
// and second-best sample, which asks the same question inside one run, and a row must clear the
// LARGER of that and the control pair. Rows that used to read "outside the floor" at 6 ms now read
// what they are.
//
// ONE TRAP OF THIS FILE'S OWN, paid for twice: the table prints ms AND us/element while the bar is
// in ms, so reading a us delta against it makes a real finding look like noise — that is what
// happened to the setter row.
//
// The arms, separated by construction rather than by argument:
//
//   bare        no directive at all
//   inert       a directive with inputs and NOTHING else — no injection, no lifecycle
//   no-forward  + one injection and `ngOnChanges`, writing nothing   -> isolates the injection
//   one-inject  + the forwarding                                     -> isolates the write path
//   minimal     + two more injections, i.e. `SymbioteElement` in miniature
//   control     byte-identical to `minimal` — see `ControlElement`, and read it FIRST
//   setters     the same inputs as SETTERS, no `ngOnChanges`  -> the `SimpleChanges` share
//   full        the real `SymbioteElement`, 279 declared inputs
//
// EVERY ROW IS READ AGAINST THE CONTROL PAIR, which is the whole reason the file is trustworthy: two
// arms doing identical work disagree by some amount, and nothing smaller than that is a finding. The
// report prints that floor and labels each row against it rather than leaving the reader to guess.
// The CENSUS is the half that was missing, and it is printed above the milliseconds for that reason.

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
import { readCommitProfile } from '@symbiote-native/engine';
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
//
// THE BRACKETS ARE THE WHOLE POINT. `selector: 'one-inject-host'` matches an ELEMENT of that name;
// this directive is written as an ATTRIBUTE on the wrapper `<view>`, so it never matched, the
// renderer was never captured, and `sharedRenderer?.` silently forwarded NOTHING for as long as this
// arm existed. It read as the cheapest injecting arm in the file and its delta was published as
// "two injections cost 4.5 us each". A census of prop writes is what caught it — 10 002 against
// `minimal`'s 30 001 — and nothing in a millisecond could have.
@Directive({ selector: '[one-inject-host]', standalone: true })
class OneInjectHost {
  constructor() {
    sharedRenderer = inject(Renderer2);
  }
}

// ONE injection and NO forwarding — the arm that separates the two, and the reason it had to exist
// is that this file once did not have it. `inert` writes nothing at all while `one-inject` writes
// three props per element through the renderer, so `one-inject - inert` was never a price for an
// injection: it is an injection PLUS 30 000 trips through `routeProp`. The header claimed the first
// reading until this arm was added. `ngOnChanges` still RUNS and still walks `changes`, so what
// separates this from `one-inject` is the `setProperty` calls and nothing else.
@Directive({ selector: 'no-forward-tag', standalone: true })
class NoForwardElement implements OnChanges {
  private readonly host = inject(ElementRef);

  @Input() testID?: string;
  @Input() ellipsizeMode?: string;
  @Input() pointerEvents?: string;

  ngOnChanges(changes: SimpleChanges): void {
    // The same walk, minus the write. Reading `nativeElement` keeps the injected value load-bearing
    // — an unread injection is one the compiler could in principle drop.
    for (const name of Object.keys(changes))
      if (this.host.nativeElement === undefined) throw new Error(name);
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
//
// THE HOST ATTRIBUTE IS PART OF THE TEMPLATE, not a second spelling of it. `one-inject` needs a
// directive on the WRAPPER to capture a renderer, and its first spelling wrote its own template to
// get one — which quietly also made its `testID` STATIC while every other arm's was bound. Its check
// row then read 0.4 ms against everyone else's 1.5 and was compared with them anyway. One template
// for every arm is what stops that recurring.
const TEMPLATE = (tag: string, hostAttribute = ''): string =>
  `<view testID="host" ${hostAttribute}>${Array.from(
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
  template: TEMPLATE('one-inject-tag', 'one-inject-host'),
})
class OneInjectArm extends ArmBase {}

@Component({
  selector: 'no-forward-arm',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [NoForwardElement],
  template: TEMPLATE('no-forward-tag'),
})
class NoForwardArm extends ArmBase {}

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
  readonly writes: Map<string, number>;
  readonly commits: Map<string, number>;
  readonly resolution: Map<string, number>;
}> {
  const create = new Map<string, number>();
  // EVERY create sample, not just the running minimum — the minimum alone cannot say how well it is
  // resolved. The control pair answers "how far apart do two IDENTICAL arms land in ONE run", which
  // is a real question and not the one that matters: an arm's own minimum has moved 30 ms BETWEEN
  // runs while that floor read 2. The gap between an arm's best and second-best sample is the same
  // question asked inside one run, and it is what this file's three reversed findings needed.
  const samples = new Map<string, number[]>();
  const check = new Map<string, number>();
  // THE CENSUS, and it is read BEFORE any millisecond. Two arms are comparable only if they push the
  // same work at the engine; an arm that quietly writes nothing is faster for a reason that has
  // nothing to do with what it is supposed to isolate. This file's `no-forward` arm was added
  // without one and read SLOWER than the arm it is a strict subset of, three runs running.
  const writes = new Map<string, number>();
  // COMMITS BELONG IN THE CENSUS TOO, and leaving them out cost a whole investigation. An arm whose
  // directive never calls `setProperty` never asks the renderer for a commit either, so it can reach
  // the same tree on a different NUMBER of commits — a difference no write count can show and one
  // that dwarfs what the arm was built to isolate.
  const commits = new Map<string, number>();
  let rootTag = 8100;
  for (let round = 0; round < rounds; round += 1) {
    // ROTATED, not merely interleaved. Interleaving gives every arm the same JIT warmth and this
    // file already relied on it; it does NOT give them the same POSITION, and position turned out to
    // matter more. Held fixed, the arm in slot 3 read ~28 ms slower than the one in slot 4 across
    // three runs while writing twenty thousand FEWER props — stable, far outside the floor, and
    // impossible as work. Rotating by the round index puts every arm in every slot.
    for (let slot = 0; slot < arms.length; slot += 1) {
      const arm = arms[(slot + round) % arms.length];
      if (arm === undefined) continue;
      const [name, component] = arm;
      rootTag += 1;
      fabric.reset();
      label.set('a');
      readCommitProfile();
      const startedAt = performance.now();
      mount(rootTag, component);
      await tick();
      samples.set(name, [
        ...(samples.get(name) ?? []),
        performance.now() - startedAt,
      ]);
      const profile = readCommitProfile();
      writes.set(name, profile.propWrites);
      commits.set(name, profile.commits);

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
  // The best sample is the reading; the gap to the second best is this run's own resolution for that
  // arm. A delta smaller than the larger of the two arms' gaps is not a finding, whatever the
  // control pair says.
  const resolution = new Map<string, number>();
  for (const [name, taken] of samples) {
    const sorted = [...taken].sort((left, right) => left - right);
    create.set(name, sorted[0] ?? Number.NaN);
    resolution.set(name, (sorted[1] ?? Number.NaN) - (sorted[0] ?? Number.NaN));
  }
  return { create, check, writes, commits, resolution };
}

describe('what a directive costs, taken apart', () => {
  it('separates the directive, its ngOnChanges and its input count', async () => {
    const times = await race([
      ['bare', BareArm],
      ['inert', InertArm],
      ['no-forward', NoForwardArm],
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
    const minimal = read('minimal');
    const control = read('control');
    const setters = read('setters');
    // What two arms doing identical work disagree by. Every row is read against it AND against the
    // resolution of its own two arms, whichever is larger.
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
        'THE CENSUS FIRST — what each arm pushed at the engine on one create.',
        'Two arms are comparable only if these agree. It is not a detail of the table.',
        `${'arm'.padStart(12)}${'writes'.padStart(9)}${'commits'.padStart(9)}`,
        ...[...times.writes].map(
          ([name, count]) =>
            `${name.padStart(12)}${String(count).padStart(9)}${String(times.commits.get(name)).padStart(9)}`,
        ),
        '',
        `${'arm'.padStart(10)}${'ms'.padStart(9)}   per element   +-resolution`,
        ...[...times.create].map(
          ([name, ms]) =>
            `${name.padStart(10)}${ms.toFixed(1).padStart(9)}   ${perElement(ms)}   +-${(times.resolution.get(name) ?? Number.NaN).toFixed(1)}`,
        ),
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
          'no-forward',
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
        // A PAIR WHOSE CENSUS DISAGREES GETS NO VERDICT WHATEVER THE FLOOR SAYS, and that is checked
        // here rather than left to the reader: three of this file's published findings compared arms
        // pushing different work at the engine, and every one of them read comfortably "outside the
        // floor" while doing it.
        ...(
          [
            // The last field says whether the two arms are MEANT to push different work. It is true
            // exactly once, on the row whose subject IS the write count; everywhere else a census
            // that disagrees means the pair is not one workload and the row answers nothing.
            ['a directive at all  ', 'inert', 'bare', false],
            ['ONE injection       ', 'no-forward', 'inert', false],
            ['forwarding 20k props', 'one-inject', 'no-forward', true],
            ['two more injections ', 'minimal', 'one-inject', false],
            ['its ngOnChanges     ', 'minimal', 'setters', false],
            ['279 declared inputs ', 'full', 'minimal', false],
          ] as const
        ).map(([label, left, right, writesDiffer]) => {
          const delta = read(left) - read(right);
          // WRITES PER ELEMENT, rounded — the question is whether the two arms push the same
          // per-element work, and the wrapper's own chrome is not that. `one-inject` genuinely
          // writes 1 more than `minimal` (its wrapper carries a second directive), which an exact
          // comparison called a different workload. A tolerance of "< ELEMENTS" is the wrong repair
          // and was tried first: it passes 9 999, which is a whole write per element minus one, and
          // it silently readmitted the `full`-against-`minimal` row this rule exists to refuse.
          const writesPerElement = (name: string): number =>
            Math.round((times.writes.get(name) ?? 0) / ELEMENTS);
          const censusAgrees =
            writesPerElement(left) === writesPerElement(right);
          // The BIGGER of the three: the control pair, and each arm's own best-to-second-best gap.
          // A row survives only if it clears all of them.
          const bar = Math.max(
            floor,
            times.resolution.get(left) ?? 0,
            times.resolution.get(right) ?? 0,
          );
          const verdict =
            censusAgrees === writesDiffer
              ? `NO VERDICT — ${left} writes ${times.writes.get(left)}, ${right} writes ${times.writes.get(right)}`
              : Math.abs(delta) > bar
                ? `outside the bar (${bar.toFixed(1)} ms)`
                : `INSIDE THE BAR (${bar.toFixed(1)} ms) — no verdict`;
          return `${label}    ${delta.toFixed(1).padStart(6)} ms   ${verdict}`;
        }),
        '',
      ].join('\n')}\n`,
    );

    // EVERY arm produced a reading and a census, not just the two ends. An arm whose component
    // failed to mount reports `NaN`, and `toBeGreaterThan` is what catches that — every comparison
    // against `NaN` is false.
    //
    // IT WOULD NOT HAVE CAUGHT THE BUG THAT MADE THIS FILE LIE, and saying so is the point: the
    // mis-wired `one-inject` arm wrote 10 002, which is comfortably greater than zero. What caught
    // that is the census TABLE, by being printed above the milliseconds where a reader compares it
    // against the arm beside it. A guard proves an arm is alive; only the census proves two arms are
    // the same workload, and no assertion here can replace reading it.
    for (const [name] of times.create) {
      expect(read(name), `${name} produced no create time`).toBeGreaterThan(0);
      expect(times.writes.get(name), `${name} wrote nothing`).toBeGreaterThan(
        0,
      );
    }
    expect(bare).toBeGreaterThan(0);
    // Eight arms, seven rounds, ten thousand elements each — well past vitest's default.
  }, 120_000);
});
