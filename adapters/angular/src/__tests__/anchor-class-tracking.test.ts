// A `class=` toggled AFTER mount must reach the committed view of every composed component.
//
// The `class` half of the styling-instruction gap (the `[style]` half is
// render/input-propagation.test.ts). A class never becomes an @Input: it reaches the anchor through
// addClass/removeClass, where nothing dirties the component's view. These components already
// re-read the anchor in a getter, so all that was missing was a reason to refresh - the ngDoCheck
// poll in SymbioteStyleInputDirective, which they all carry.
//
// Device-driven: the ReactiveStyle canary showed exactly these stranded on the class axis. One case
// per consumption shape rather than all eight - inline `anchorHostStyle`, a style-array fold, and
// `stableAnchorStyle`'s dedup gate. Verified to fail with the poll removed.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.

import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { ActivityIndicator } from '../components/activity-indicator';
import { FlatList } from '../components/flat-list';
import { ImageBackground } from '../components/image-background';
import { TextInput } from '../components/text-input';
import { VirtualizedList, VListItemDirective } from '../components/virtualized-list';

const ROOT_TAG = 981;
const fabric = installFabric();

// The class-derived style lands neither reliably ON the testID node nor reliably below it:
// ImageBackground and FlatList commit it onto the wrapper that CONTAINS theirs (verified by dumping
// the committed tree). So search outward - node, subtree, then ancestors nearest-first. A plain
// global search would match a sibling tile and pass while the component under test was frozen.
function nearestStyled(testID: string, prop: string): unknown {
  const pathTo = (node: IFakeNode): IFakeNode[] | undefined => {
    if (node.props.testID === testID) return [node];
    for (const child of node.children) {
      const below = pathTo(child);
      if (below) return [node, ...below];
    }
    return undefined;
  };
  const inSubtree = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props[prop] !== undefined) return node;
    for (const child of node.children) {
      const found = inSubtree(child);
      if (found) return found;
    }
    return undefined;
  };

  for (const root of fabric.committed) {
    const path = pathTo(root);
    if (path === undefined) continue;
    const owner = path[path.length - 1];
    if (owner === undefined) continue;
    const below = inSubtree(owner);
    if (below !== undefined) return below.props[prop];
    for (let index = path.length - 2; index >= 0; index -= 1) {
      const ancestor = path[index];
      if (ancestor !== undefined && ancestor.props[prop] !== undefined) return ancestor.props[prop];
    }
  }
  return undefined;
}

type IRow = {
  id: string;
};

const ROW: IRow = { id: 'row-0' };
const ROWS: readonly IRow[] = [ROW];

let fixture: AnchorClassFixture | undefined;

@Component({
  selector: 'symbiote-anchor-class-host',
  standalone: true,
  imports: [
    ActivityIndicator,
    FlatList,
    ImageBackground,
    TextInput,
    VirtualizedList,
    VListItemDirective,
  ],
  template: `
    <TextInput [testID]="'anchor-text-input'" [class.dark]="dark" />
    <ActivityIndicator [testID]="'anchor-spinner'" [animating]="false" [hidesWhenStopped]="false" [class.dark]="dark" />
    <ImageBackground [testID]="'anchor-image-bg'" src="x" [class.dark]="dark">
      <symbiote-text>Hi</symbiote-text>
    </ImageBackground>
    <!-- FlatList's own [testID] does not reach the committed tree (it is not forwarded down to the
         inner VirtualizedList/ScrollView), so the tile is anchored by a wrapper View instead. -->
    <symbiote-view [testID]="'anchor-flat-list'">
      <FlatList [data]="rows" [keyExtractor]="rowKey" [class.dark]="dark">
        <ng-template vListItem>
          <symbiote-text>Hi</symbiote-text>
        </ng-template>
      </FlatList>
    </symbiote-view>
    <VirtualizedList
      [testID]="'anchor-vlist'"
      [data]="rows"
      [getItem]="getRow"
      [getItemCount]="getRowCount"
      [keyExtractor]="rowKey"
      [class.dark]="dark"
    >
      <ng-template vListItem>
        <symbiote-text>Hi</symbiote-text>
      </ng-template>
    </VirtualizedList>
  `,
})
class AnchorClassFixture {
  dark = false;
  readonly rows = ROWS;
  readonly rowKey = (item: IRow): string => item.id;
  readonly getRow = (): IRow => ROW;
  readonly getRowCount = (): number => ROWS.length;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Captures the live component instance so the test can toggle the class after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    fixture = this;
  }

  enableDark(): void {
    this.dark = true;
    this.changeDetector.markForCheck();
  }
}

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('a class toggled after mount', () => {
  it.each([
    ['anchor-text-input'],
    ['anchor-spinner'],
    ['anchor-image-bg'],
    ['anchor-flat-list'],
    ['anchor-vlist'],
  ])(
    'reaches the committed view of %s',
    async testID => {
      registerStyles({ dark: { backgroundColor: 'black' } });

      mount(ROOT_TAG, AnchorClassFixture);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(nearestStyled(testID, 'backgroundColor')).toBeUndefined();

      fixture?.enableDark();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(nearestStyled(testID, 'backgroundColor')).toBe('black');
    },
  );
});
