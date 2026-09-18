// The headless twin of `examples/angular`'s ReactiveStyleScreen: does a component's look still
// track `class` and `[style]` AFTER mount, on every component the screen puts in its grid?
//
// The screen's own PASS condition is "one tap repaints every tile"; a screenshot of the RESTING
// state cannot show it, because every tile starts on theme A and a frozen tile is indistinguishable
// from a live one until the toggle runs. So the device tells you about a checkerboard and nothing
// else — which is why this file drives the toggle instead.
//
// Coverage before it was 3 of 30: `anchor-class-tracking.test.ts` picks one component per
// CONSUMPTION SHAPE on the class axis, `render/input-propagation.test.ts` covers the style axis the
// same way. Both are the right shape for the mechanism; neither answers the screen's question, and
// the device has already stranded components on the class axis once.
//
// THE TWO AXES ARE SEPARATE ROWS ON PURPOSE, as on the screen: several components have been frozen
// on ONE of them, so a tile carrying both bindings flips on its live axis and reads as healthy.
//
// The tile list is DERIVED from the screen's own source, so a tile added there fails here asking
// for a row rather than going quietly uncovered.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  childrenOf,
  clearGlobalStyles,
  parentOf,
  registerRules,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';
import { AnimatedView } from '../modules/animated';
import { FlatList } from '../components/flat-list';
import { SectionList } from '../components/section-list';
import { KeyboardAvoidingView } from '../components/keyboard-avoiding-view';
import {
  VirtualizedList,
  VListItemDirective,
} from '../components/virtualized-list';
import {
  VirtualizedSectionList,
  VSectionHeaderDirective,
  VSectionItemDirective,
} from '../components/virtualized-section-list';
import {
  ActivityIndicatorElement,
  ButtonElement,
  ImageBackgroundElement,
  PressableElement,
  ScrollViewElement,
  TextElement,
  TextInputElement,
  TouchableHighlightElement,
  TouchableOpacityElement,
  ViewElement,
} from '../elements';

const ROOT_TAG = 9484;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const THEME_A = '#d94a4a';
const THEME_B = '#3d8bd9';

// KeyboardAvoidingView's ngOnInit subscribes to the Keyboard module unconditionally, which needs a
// bridgeless native event hub present (core/engine/src/native-events.ts) — the same minimal fake
// `keyboard-avoiding-view-accessibility-gate.test.ts` installs.
Object.assign(globalThis, {
  RN$registerCallableModule: (): void => {},
});

const here = dirname(fileURLToPath(import.meta.url));
const SCREEN = join(
  here,
  '../../../../examples/angular/src/screens/ReactiveStyleScreen.ts',
);

interface IRow {
  id: string;
  label: string;
}

const ROW: IRow = { id: 'row-0', label: 'row' };
const ROWS: readonly IRow[] = [ROW];
const SECTIONS = [{ title: 'sec', data: [ROW] }];

function isRow(value: unknown): value is IRow {
  return typeof value === 'object' && value !== null && 'label' in value;
}

@Component({
  selector: 'rstyle-grid-host',
  standalone: true,
  imports: [
    ActivityIndicatorElement,
    AnimatedView,
    ButtonElement,
    FlatList,
    ImageBackgroundElement,
    KeyboardAvoidingView,
    PressableElement,
    ScrollViewElement,
    SectionList,
    TextElement,
    TextInputElement,
    TouchableHighlightElement,
    TouchableOpacityElement,
    ViewElement,
    VirtualizedList,
    VirtualizedSectionList,
    VListItemDirective,
    VSectionHeaderDirective,
    VSectionItemDirective,
  ],
  // Every prop besides the two under test is copied from the screen, because several of these
  // components only reach their painting node when they have something to render.
  template: `
    <view>
      <pressable testID="rstyle-class-pressable" [class]="tileClass">
        <text>control</text>
      </pressable>
      <touchable-highlight testID="rstyle-class-highlight" [class]="tileClass">
        <text>control</text>
      </touchable-highlight>
      <scroll-view testID="rstyle-class-scrollview" [class]="tileClass">
        <text>control</text>
      </scroll-view>
      <touchable-opacity testID="rstyle-class-opacity" [class]="tileClass">
        <text>tile</text>
      </touchable-opacity>
      <button
        testID="rstyle-class-button"
        title="tile"
        [color]="tileTextColor"
        [class]="tileClass"
      ></button>
      <text-input
        testID="rstyle-class-textinput"
        placeholder="tile"
        [class]="tileClass"
      ></text-input>
      <activity-indicator
        testID="rstyle-class-spinner"
        [animating]="true"
        [hidesWhenStopped]="false"
        [class]="tileClass"
      ></activity-indicator>
      <image-background
        testID="rstyle-class-imagebg"
        [src]="logoUri"
        alt="logo"
        resizeMode="contain"
        [class]="tileClass"
      >
        <text>tile</text>
      </image-background>
      <KeyboardAvoidingView testID="rstyle-class-kav" [class]="tileClass">
        <text>tile</text>
      </KeyboardAvoidingView>
      <AnimatedView testID="rstyle-class-animated" [class]="tileClass">
        <text>tile</text>
      </AnimatedView>
      <FlatList
        testID="rstyle-class-flatlist"
        [data]="rows"
        [keyExtractor]="rowKey"
        [class]="tileClass"
      >
        <ng-template vListItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </FlatList>
      <SectionList
        testID="rstyle-class-sectionlist"
        [sections]="sections"
        [keyExtractor]="rowKey"
        [class]="tileClass"
      >
        <ng-template vSectionHeader let-section>
          <text>{{ section.title }}</text>
        </ng-template>
        <ng-template vSectionItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </SectionList>
      <VirtualizedList
        testID="rstyle-class-vlist"
        [data]="rows"
        [getItem]="getRow"
        [getItemCount]="getRowCount"
        [keyExtractor]="rowKey"
        [class]="tileClass"
      >
        <ng-template vListItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </VirtualizedList>
      <VirtualizedSectionList
        testID="rstyle-class-vsectionlist"
        [sections]="sections"
        [keyExtractor]="rowKey"
        [class]="tileClass"
      >
        <ng-template vSectionHeader let-section>
          <text>{{ section.title }}</text>
        </ng-template>
        <ng-template vSectionItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </VirtualizedSectionList>

      <pressable testID="rstyle-style-pressable" [style]="tileStyle">
        <text>control</text>
      </pressable>
      <touchable-highlight testID="rstyle-style-highlight" [style]="tileStyle">
        <text>control</text>
      </touchable-highlight>
      <scroll-view testID="rstyle-style-scrollview" [style]="tileStyle">
        <text>control</text>
      </scroll-view>
      <touchable-opacity testID="rstyle-style-opacity" [style]="tileStyle">
        <text>tile</text>
      </touchable-opacity>
      <button
        testID="rstyle-style-button"
        title="tile"
        [color]="tileTextColor"
        [style]="tileStyle"
      ></button>
      <text-input
        testID="rstyle-style-textinput"
        placeholder="tile"
        [style]="tileStyle"
      ></text-input>
      <activity-indicator
        testID="rstyle-style-spinner"
        [animating]="true"
        [hidesWhenStopped]="false"
        [style]="tileStyle"
      ></activity-indicator>
      <image-background
        testID="rstyle-style-imagebg"
        [src]="logoUri"
        alt="logo"
        resizeMode="contain"
        [style]="tileStyle"
      >
        <text>tile</text>
      </image-background>
      <KeyboardAvoidingView testID="rstyle-style-kav" [style]="tileStyle">
        <text>tile</text>
      </KeyboardAvoidingView>
      <AnimatedView testID="rstyle-style-animated" [style]="tileStyle">
        <text>tile</text>
      </AnimatedView>
      <FlatList
        testID="rstyle-style-flatlist"
        [data]="rows"
        [keyExtractor]="rowKey"
        [style]="tileStyle"
      >
        <ng-template vListItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </FlatList>
      <SectionList
        testID="rstyle-style-sectionlist"
        [sections]="sections"
        [keyExtractor]="rowKey"
        [style]="tileStyle"
      >
        <ng-template vSectionHeader let-section>
          <text>{{ section.title }}</text>
        </ng-template>
        <ng-template vSectionItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </SectionList>
      <VirtualizedList
        testID="rstyle-style-vlist"
        [data]="rows"
        [getItem]="getRow"
        [getItemCount]="getRowCount"
        [keyExtractor]="rowKey"
        [style]="tileStyle"
      >
        <ng-template vListItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </VirtualizedList>
      <VirtualizedSectionList
        testID="rstyle-style-vsectionlist"
        [sections]="sections"
        [keyExtractor]="rowKey"
        [style]="tileStyle"
      >
        <ng-template vSectionHeader let-section>
          <text>{{ section.title }}</text>
        </ng-template>
        <ng-template vSectionItem let-item>
          <text>{{ rowLabel(item) }}</text>
        </ng-template>
      </VirtualizedSectionList>
    </view>
  `,
})
class ReactiveStyleGridHost {
  readonly logoUri = 'https://angular.io/logo.png';
  readonly tileTextColor = '#ffffff';
  readonly rows = ROWS;
  readonly sections = SECTIONS;

  isThemeB = false;

  // On the screen the toggle is a template `(press)` binding, which Angular wraps in
  // `wrapListenerIn_markDirtyAndPreventDefault` and which therefore dirties this view. Writing the
  // field from a test is OUTSIDE Angular, so without this every tile stays on theme A and the whole
  // grid reads as frozen — the harness, not the product.
  private readonly detector = inject(ChangeDetectorRef);

  constructor() {
    // Exposes the instance via the module-level `host` var so assertions outside Angular's own
    // injection can reach it.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    host = this;
  }

  toggleTheme(): void {
    this.isThemeB = !this.isThemeB;
    this.detector.markForCheck();
  }

  get tileClass(): string {
    return this.isThemeB ? 'rstyle-tile rstyle-b' : 'rstyle-tile rstyle-a';
  }

  // Frozen constants, as on the screen: a fresh literal per pass would churn every tile's bag and
  // muddy what is being measured.
  get tileStyle(): Record<string, string> {
    return this.isThemeB
      ? { backgroundColor: THEME_B }
      : { backgroundColor: THEME_A };
  }

  rowLabel(item: unknown): string {
    return isRow(item) ? item.label : '';
  }

  readonly rowKey = (item: IRow): string => item.id;
  readonly getRow = (): IRow => ROW;
  readonly getRowCount = (): number => ROWS.length;
}

let host: ReactiveStyleGridHost | undefined;

function hostInstance(): ReactiveStyleGridHost {
  if (host === undefined) throw new Error('the grid host never mounted');
  return host;
}

/** The tiles the screen actually carries, so a new one there fails here instead of going unseen. */
function tileIdsFromScreen(): string[] {
  const source = readFileSync(SCREEN, 'utf8');
  const ids = source.match(/rstyle-(?:class|style)-[a-z]+/g) ?? [];
  return [...new Set(ids)].sort();
}

// The class-derived style lands neither reliably ON the testID node nor reliably below it — a list
// commits it onto the wrapper CONTAINING theirs, and image-background puts the testID on the inner
// image while the class styles the box ABOVE it. So search outward: node, subtree, then ancestors
// nearest-first. A plain global search would match a neighbouring tile and pass while the component
// under test was frozen. Same walk as `anchor-class-tracking.test.ts`, which explains it at length.
//
// `backgroundColor` is only ever a top-level key on the PAYLOAD — the class merge resolves onto
// `props.style` as the engine's `[classStyle, explicitStyle]` pair, and only `payloadOf` (the
// engine's own `fabricProps`) flattens that.
function nearestBackground(testID: string): unknown {
  const owner = fabric.find(node => node.props.testID === testID);
  if (owner === undefined)
    throw new Error(`no committed node carrying testID="${testID}"`);

  const inSubtree = (handle: ISymbioteNode): unknown => {
    const own = payloadOf(handle).backgroundColor;
    if (own !== undefined && own !== null) return own;
    for (const child of childrenOf(handle)) {
      const below = inSubtree(child);
      if (below !== undefined && below !== null) return below;
    }
    return undefined;
  };
  const below = inSubtree(owner.handle);
  if (below !== undefined && below !== null) return below;

  for (
    let ancestor = parentOf(owner.handle);
    ancestor !== undefined;
    ancestor = parentOf(ancestor)
  ) {
    const value = payloadOf(ancestor).backgroundColor;
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function backgroundsByTile(ids: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const id of ids) out[id] = nearestBackground(id);
  return out;
}

beforeEach(() => {
  fabric.reset();
  clearGlobalStyles();
  registerRules([
    {
      tokens: ['rstyle-tile'],
      specificity: [0, 1, 0],
      order: 0,
      style: { width: 92, height: 48 },
    },
    {
      tokens: ['rstyle-a'],
      specificity: [0, 1, 0],
      order: 1,
      style: { backgroundColor: THEME_A },
    },
    {
      tokens: ['rstyle-b'],
      specificity: [0, 1, 0],
      order: 2,
      style: { backgroundColor: THEME_B },
    },
  ]);
});

afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('every tile on the reactive-style grid repaints on one toggle', () => {
  // The fixture is a copy, so it can drift from the screen it stands for. This is what makes the
  // drift loud: a tile added there and not here fails naming the id.
  it('covers exactly the tiles the screen carries', async () => {
    const covered = tileIdsFromScreen();
    expect(covered.length).toBe(28);
    mount(ROOT_TAG, ReactiveStyleGridHost);
    await tick();
    // All at once, not one assertion per id: a tile that never commits its testID is invisible to
    // every test AND to any e2e selector, so the whole list is the finding.
    const missing = covered.filter(
      id => fabric.find(n => n.props.testID === id) === undefined,
    );
    expect(missing).toEqual([]);
  });

  it('flips every tile on both axes, red to blue', async () => {
    const ids = tileIdsFromScreen();
    mount(ROOT_TAG, ReactiveStyleGridHost);
    await tick();

    // The control: every tile must be ON theme A first. Without it a tile that paints NOTHING
    // reads as "did not flip" and a tile that was already blue reads as a pass.
    expect(backgroundsByTile(ids)).toEqual(
      Object.fromEntries(ids.map(id => [id, THEME_A])),
    );

    hostInstance().toggleTheme();
    await tick();
    await tick();

    expect(backgroundsByTile(ids)).toEqual(
      Object.fromEntries(ids.map(id => [id, THEME_B])),
    );
  });
});
