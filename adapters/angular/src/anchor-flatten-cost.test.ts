// Angular's column of the five-adapter anchor census. See adapters/react/src/anchor-flatten-cost.
// test.tsx for what the shape measures and why; this file mirrors it so the numbers line up.
//
// Angular is the reason the census exists. Its compiler binds a component to a host ELEMENT, so a
// composed component instance cannot exist without a node — anchor-host-registry.ts only stops that
// node from painting, it cannot remove it. The row below composes three components (itself and two
// Pressables), so the expectation is three anchors per row where the other four adapters have zero
// or a fixed handful.

import '@angular/compiler';
import { Component, Input, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  censusRetainedTree,
  dlog,
  isSymbioteNode,
  readCommitProfile,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './render';
import { Pressable, Text, View } from './components';
import { registerComposedComponent } from './anchor-host-registry';

// What examples/angular gets for free from the babel-register-composed plugin: an app-authored
// composed component must self-register, or its host element falls through to a real Fabric
// createNode and paints. Skipping this made the row TEN native views wide instead of nine and
// turned one of its three anchors into a painted view — i.e. it measured a different tree.
registerComposedComponent('BenchmarkRow');
registerComposedComponent('anchor-cost-list');

const ROOT_TAG = 8804;
const ROWS = 1000;
const NATIVE_VIEWS_PER_ROW = 9;
const UPDATE_STRIDE = 10;
const COMPOSED_COMPONENTS_PER_ROW = 3;

const fabric = installFabric();

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

interface IRow {
  id: number;
  label: string;
}

function makeRows(from: number, count: number): IRow[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: from + index,
    label: `row ${from + index}`,
  }));
}

@Component({
  selector: 'BenchmarkRow',
  standalone: true,
  imports: [Pressable, Text, View],
  template: `
    <View [style]="rowStyle">
      <Text>{{ rowId }}</Text>
      <Pressable>
        <Text>{{ row.label }}</Text>
      </Pressable>
      <Pressable>
        <Text>x</Text>
      </Pressable>
    </View>
  `,
})
class BenchmarkRow {
  @Input({ required: true }) row!: IRow;
  @Input({ required: true }) isSelected = false;

  get rowStyle(): Record<string, unknown> | undefined {
    return this.isSelected ? { backgroundColor: 'blue' } : undefined;
  }

  get rowId(): string {
    return String(this.row.id);
  }
}

let mounted: List | undefined;

@Component({
  selector: 'anchor-cost-list',
  standalone: true,
  imports: [BenchmarkRow, View],
  template: `
    <View testID="list">
      @for (row of rows(); track row.id) {
        <BenchmarkRow [row]="row" [isSelected]="row.id === selectedId()" />
      }
    </View>
  `,
})
class List {
  readonly rows = signal<IRow[]>(makeRows(1, ROWS));
  readonly selectedId = signal(-1);

  constructor() {
    // Captures the live instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mounted = this;
  }
}

function drive(): List {
  if (mounted === undefined) throw new Error('list was never mounted');
  return mounted;
}

function retainedRoot(): ISymbioteNode {
  const seed = fabric.created.find(node => node.props.testID === 'list');
  if (seed === undefined) throw new Error('the list node was never created');
  const handle: unknown = seed.instanceHandle;
  if (!isSymbioteNode(handle))
    throw new Error('the list node carries no retained handle');
  let current: ISymbioteNode = handle;
  while (current.parent !== undefined) current = current.parent;
  return current;
}

function report(op: string): void {
  dlog(
    `ANCHOR-COST ${JSON.stringify({ adapter: 'angular', op, ...readCommitProfile() })}`,
  );
}

beforeEach(() => {
  fabric.reset();
  mounted = undefined;
  readCommitProfile();
});
afterEach(() => unmount(ROOT_TAG));

describe('angular anchor flattening cost', () => {
  it('reports the anchor census and per-operation flatten counts', async () => {
    mount(ROOT_TAG, List);
    await flush();
    report('create');

    const census = censusRetainedTree([retainedRoot()]);
    dlog(
      `ANCHOR-CENSUS ${JSON.stringify({
        adapter: 'angular',
        nodes: census.nodes,
        anchors: census.anchors,
        emptyRawTexts: census.emptyRawTexts,
        renderable: census.renderable,
        flattenSites: census.flattenWidths.length,
        widest: census.flattenWidths.slice(0, 5),
      })}`,
    );

    drive().selectedId.set(2);
    await flush();
    report('select');

    drive().rows.set(
      drive()
        .rows()
        .map((row, index) =>
          index % UPDATE_STRIDE === 0
            ? { ...row, label: `${row.label} !!!` }
            : row,
        ),
    );
    await flush();
    report('partial');

    drive().rows.set([...drive().rows(), ...makeRows(ROWS + 1, ROWS)]);
    await flush();
    report('append');

    // why: the row shape has to be the canary's, or every column is measuring a different list.
    expect(
      census.renderable,
      'the benchmark row must expand to nine native views',
    ).toBe(ROWS * NATIVE_VIEWS_PER_ROW + 1);
    // why: THE structural claim, and the one this whole file exists to make a runtime number.
    // Angular's compiler emits a host element per component instance; the adapter can keep it from
    // painting but not from existing, so composition costs one engine node per composed component.
    // The +1 is the root List component's own host, mounted the same way.
    expect(
      census.anchors,
      'an Angular component is bound to a host element, so each instance costs an engine node',
    ).toBe(ROWS * COMPOSED_COMPONENTS_PER_ROW + 1);
  });
});
