// WHERE THE REST OF AN ANGULAR CREATE GOES, split between this renderer and Angular itself.
//
// After the styling work of 2026-09-18 the engine's own halves are at parity with Vue's on the
// headless bench arm — walk 26 against 28.6, `apply` 43 against 44.6, `fabric` and `layout`
// identical — while the wall clock is 182 against 138. So the whole remaining deficit is JS above
// the engine, and "Angular's machinery" is the usual explanation without ever having been measured.
//
// It is two different things wearing one name: Angular's own work (an LView, a DI scope, the
// template function) and OUR `Renderer2` implementation, which Angular calls ~30 000 times for a
// 1 000-row create. Only the second is ours to fix, and a fix aimed at the wrong half is wasted.
//
// The instrument wraps the renderer's PROTOTYPE, so nothing in the adapter knows it is being timed
// and no call site is missed. `performance.now()` per call is itself a cost — this reports a SPLIT,
// not a wall clock, and the totals are not comparable with the itest arm's.

import '@angular/compiler';
import {
  CUSTOM_ELEMENTS_SCHEMA,
  Component,
  Input,
  signal,
} from '@angular/core';
import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { setTreeHost, treeHost } from '@symbiote-native/engine';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mount, unmount } from '../render';
import { registerComposedComponent } from '../anchor-host-registry';
import { SYMBIOTE_ELEMENTS } from '../elements';
import { SymbioteRenderer } from './index';

const ROOT_TAG = 963;
const ROWS = 1000;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const ROW_STYLE = { height: 44, flexDirection: 'row', paddingLeft: 10 };
const CELL_STYLE = { flex: 1 };
const INPUT_STYLE = { width: 96, height: 28 };

type IRow = { readonly id: number; readonly label: string };

// The bench arm's row, verbatim in shape: ten nodes, its own component, bare tags with `[style]`.
@Component({
  selector: 'ProbeRow',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <view [style]="rowStyle" [testID]="'row-' + row.id">
      <text ellipsizeMode="tail">{{ row.id }}</text>
      <view [style]="cellStyle"
        ><text ellipsizeMode="tail">{{ row.label }}</text></view
      >
      <view [style]="cellStyle"><text ellipsizeMode="tail">x</text></view>
      <text-input [style]="inputStyle" [text]="row.label" />
    </view>
  `,
})
class ProbeRow {
  @Input({ required: true }) row!: IRow;
  readonly rowStyle = ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

registerComposedComponent('ProbeRow');

@Component({
  selector: 'probe-list',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ProbeRow],
  template: `
    <view testID="list">
      @for (row of rows(); track row.id) {
        <ProbeRow [row]="row" />
      }
    </view>
  `,
})
class ProbeList {
  readonly rows = signal<IRow[]>(
    Array.from({ length: ROWS }, (_unused, at) => ({
      id: at,
      label: `row ${at}`,
    })),
  );
}

// THE SAME TREE, WRITTEN THE WAY A REAL SCREEN WRITES IT. `examples/angular`'s benchmark row imports
// `SYMBIOTE_ELEMENTS`, so each tag matches a `@Directive` and Angular instantiates one per element.
// The bare-tag rows above match nothing and instantiate none — which makes them the cheaper shape,
// and means neither this probe's first arm nor the headless bench arm carries what the device does.
@Component({
  selector: 'ProbeDirectiveRow',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <view [style]="rowStyle" [testID]="'row-' + row.id">
      <text ellipsizeMode="tail">{{ row.id }}</text>
      <view [style]="cellStyle"
        ><text ellipsizeMode="tail">{{ row.label }}</text></view
      >
      <view [style]="cellStyle"><text ellipsizeMode="tail">x</text></view>
      <text-input [style]="inputStyle" [value]="row.label"></text-input>
    </view>
  `,
})
class ProbeDirectiveRow {
  @Input({ required: true }) row!: IRow;
  readonly rowStyle = ROW_STYLE;
  readonly cellStyle = CELL_STYLE;
  readonly inputStyle = INPUT_STYLE;
}

registerComposedComponent('ProbeDirectiveRow');

@Component({
  selector: 'probe-directive-list',
  standalone: true,
  imports: [ProbeDirectiveRow, SYMBIOTE_ELEMENTS],
  template: `
    <view testID="list">
      @for (row of rows(); track row.id) {
        <ProbeDirectiveRow [row]="row" />
      }
    </view>
  `,
})
class ProbeDirectiveList {
  readonly rows = signal<IRow[]>(
    Array.from({ length: ROWS }, (_unused, at) => ({
      id: at,
      label: `row ${at}`,
    })),
  );
}

// Every method Angular can call on a Renderer2, so a miss is impossible by construction.
const TIMED = [
  'createElement',
  'createComment',
  'createText',
  'appendChild',
  'insertBefore',
  'removeChild',
  'parentNode',
  'nextSibling',
  'setAttribute',
  'removeAttribute',
  'addClass',
  'removeClass',
  'setStyle',
  'removeStyle',
  'setProperty',
  'setValue',
  'listen',
  'selectRootElement',
] as const;

type ITally = { calls: number; ms: number };

function instrument(): {
  readonly byMethod: Map<string, ITally>;
  readonly restore: () => void;
} {
  const byMethod = new Map<string, ITally>();
  // `Function` rather than a call signature, and that is the point: `typeof x === 'function'`
  // narrows `unknown` to exactly this, so the map holds what the guard proved and no cast is needed.
  // `Reflect.apply` takes a `Function`, which is why the wrapper below needs nothing more.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const originals = new Map<string, Function>();
  const prototype: Record<string, unknown> = SymbioteRenderer.prototype;

  for (const name of TIMED) {
    const original: unknown = prototype[name];
    if (typeof original !== 'function') continue;
    originals.set(name, original);
    byMethod.set(name, { calls: 0, ms: 0 });
    prototype[name] = function timed(this: unknown, ...args: unknown[]) {
      const startedAt = performance.now();
      // Reflect.apply rather than a cast-to-signature local: `typeof === 'function'` narrows to
      // `Function`, which carries no call signature, and this repo does not use `as`.
      const result: unknown = Reflect.apply(original, this, args);
      const tally = byMethod.get(name);
      if (tally !== undefined) {
        tally.calls += 1;
        tally.ms += performance.now() - startedAt;
      }
      return result;
    };
  }

  return {
    byMethod,
    restore: (): void => {
      for (const [name, original] of originals) prototype[name] = original;
    },
  };
}

/** One arm: mount `component`, timed, with the renderer and the engine's apply taken out. */
async function measure(
  component: unknown,
  rootTag: number,
): Promise<{
  readonly wall: number;
  readonly ours: number;
  readonly applyMs: number;
  readonly calls: number;
  readonly rows: (readonly [string, ITally])[];
}> {
  const probe = instrument();
  // The ENGINE's half has to be taken out separately or it lands in Angular's share: `applyOps` runs
  // from the commit microtask, which is inside the awaited window and outside every renderer method.
  // A two-way split reads as "Angular's machinery" for work that is ours.
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  let applyMs = 0;
  setTreeHost({
    ...base,
    applyOps: batch => {
      const startedAt = performance.now();
      base.applyOps(batch);
      applyMs += performance.now() - startedAt;
    },
  });

  const startedAt = performance.now();
  mount(rootTag, component);
  await tick();
  const wall = performance.now() - startedAt;

  probe.restore();
  setTreeHost(base);
  unmount(rootTag);
  fabric.reset();

  const rows = [...probe.byMethod.entries()]
    .filter(([, tally]) => tally.calls > 0)
    .sort((left, right) => right[1].ms - left[1].ms);
  return {
    wall,
    applyMs,
    ours: rows.reduce((total, [, tally]) => total + tally.ms, 0),
    calls: rows.reduce((total, [, tally]) => total + tally.calls, 0),
    rows,
  };
}

describe('an angular create, split between the renderer and angular', () => {
  it('prices every Renderer2 method the adapter implements', async () => {
    const probe = instrument();
    // The ENGINE's half has to be taken out separately or it lands in Angular's share: `applyOps`
    // runs from the commit microtask, which is inside the awaited window and outside every renderer
    // method. A two-way split reads as "Angular's machinery" for work that is ours.
    const base = treeHost();
    if (base === undefined) throw new Error('no host installed');
    let applyMs = 0;
    setTreeHost({
      ...base,
      applyOps: batch => {
        const startedAt = performance.now();
        base.applyOps(batch);
        applyMs += performance.now() - startedAt;
      },
    });

    const startedAt = performance.now();
    mount(ROOT_TAG, ProbeList);
    await tick();
    const wall = performance.now() - startedAt;

    probe.restore();
    setTreeHost(base);

    const rows = [...probe.byMethod.entries()]
      .filter(([, tally]) => tally.calls > 0)
      .sort((left, right) => right[1].ms - left[1].ms);
    const ours = rows.reduce((total, [, tally]) => total + tally.ms, 0);
    const calls = rows.reduce((total, [, tally]) => total + tally.calls, 0);

    writeFileSync(
      fileURLToPath(
        new URL(
          '../../../../.docs/angular-renderer-split.txt',
          import.meta.url,
        ),
      ),
      `${[
        `a ${ROWS}-row create through the angular adapter`,
        '',
        `wall                ${wall.toFixed(1)} ms`,
        `our renderer        ${ours.toFixed(1)} ms  (${((ours / wall) * 100).toFixed(0)}%) over ${calls} calls`,
        `the engine apply    ${applyMs.toFixed(1)} ms  (${((applyMs / wall) * 100).toFixed(0)}%)`,
        `angular's own       ${(wall - ours - applyMs).toFixed(1)} ms  (${(((wall - ours - applyMs) / wall) * 100).toFixed(0)}%)`,
        '',
        `${'method'.padStart(20)}${'calls'.padStart(9)}${'ms'.padStart(9)}${'us/call'.padStart(10)}`,
        ...rows.map(
          ([name, tally]) =>
            name.padStart(20) +
            String(tally.calls).padStart(9) +
            tally.ms.toFixed(1).padStart(9) +
            ((tally.ms * 1000) / tally.calls).toFixed(2).padStart(10),
        ),
        '',
      ].join('\n')}\n`,
    );

    unmount(ROOT_TAG);
    fabric.reset();
    expect(calls).toBeGreaterThan(0);
  });

  // why: THE SHAPE THE DEVICE ACTUALLY RUNS. A real screen imports `SYMBIOTE_ELEMENTS`, so every tag
  // matches a `@Directive` and Angular instantiates one per element; a bare tag under
  // `CUSTOM_ELEMENTS_SCHEMA` matches nothing and instantiates none. The headless bench arm and the
  // first case above are both the bare shape, so neither carries what a device pays — and the base
  // directive declares 279 `@Input()`s, which under `target: ES2022` are real class FIELDS defined
  // on every instance.
  //
  // Two arms in one sitting, same tree, same node count, only the spelling of the tags between them.
  it('prices the directive shape a real screen writes against the bare one', async () => {
    const bare = await measure(ProbeList, ROOT_TAG);
    const directives = await measure(ProbeDirectiveList, ROOT_TAG + 1);

    writeFileSync(
      fileURLToPath(
        new URL(
          '../../../../.docs/angular-directive-cost.txt',
          import.meta.url,
        ),
      ),
      `${[
        `a ${ROWS}-row create, the same tree written two ways`,
        '',
        `${'arm'.padStart(14)}${'wall'.padStart(9)}${'renderer'.padStart(10)}${'apply'.padStart(8)}${"angular's".padStart(11)}${'calls'.padStart(9)}`,
        `${'bare tags'.padStart(14)}${bare.wall.toFixed(1).padStart(9)}${bare.ours.toFixed(1).padStart(10)}${bare.applyMs.toFixed(1).padStart(8)}${(bare.wall - bare.ours - bare.applyMs).toFixed(1).padStart(11)}${String(bare.calls).padStart(9)}`,
        `${'directives'.padStart(14)}${directives.wall.toFixed(1).padStart(9)}${directives.ours.toFixed(1).padStart(10)}${directives.applyMs.toFixed(1).padStart(8)}${(directives.wall - directives.ours - directives.applyMs).toFixed(1).padStart(11)}${String(directives.calls).padStart(9)}`,
        '',
        `the directives cost ${(directives.wall - bare.wall).toFixed(1)} ms on ${ROWS} rows`,
        '',
      ].join('\n')}\n`,
    );

    expect(bare.calls).toBeGreaterThan(0);
    expect(directives.calls).toBeGreaterThan(0);
  });
});
