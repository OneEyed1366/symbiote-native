// The CASCADE half of the eager accessibility-gate debt
// (`.claude/rules/fabric-boolean-event-gates.md`), which the per-component fixes could not reach.
//
// Those fixes made each component light its gate only while its own `@Output()` is `.observed`.
// That is defeated the moment an adapter WRAPPER renders the component, because Angular has no
// conditional template binding: `<Pressable (accessibilityTap)="accessibilityTap.emit($event)">` is
// a subscriber, unconditionally, on every instance. Fixing Pressable did nothing for Button.
//
// The repair passes the wrapper's DEMAND down through `viewProviders` (see `../gate-demand.ts` for
// why DI and not an `@Input`), and the two properties that make it correct are the two shapes this
// file asserts: it CHAINS through however many wrappers deep, and it does NOT reach content the
// app projects INTO a wrapper.
//
// The chain under test is the real one, at its real depth:
//
//   SectionList -> VirtualizedSectionList -> VirtualizedList -> ScrollView   4 deep
//
// It used to carry a second, 3-deep arm — `Button -> TouchableOpacity -> Pressable` — and both of
// its links are TAGS now, so the chain does not exist to be tested. Nothing was lost: a tag binds
// no `@Output()` on anything, which is the cascade's cause, and the surviving arm is strictly
// deeper and ends at a DIFFERENT leaf implementation (`gatedAccessibilityCallback`, not Pressable's
// `accessibilityEmitterHandler`).
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
// Through the package's own barrel, which is the shape an app writes — and here it is load-bearing
// rather than cosmetic. Reaching the components by deep path made the SectionList chain resolve in
// whatever order this file's own import list happened to give, and dropping the `./button` import
// changed that order enough to break it: Angular's JIT read `VirtualizedSectionList`'s
// `@ContentChild` selectors while the directive module was still evaluating and threw
// "Can't construct a query … since the query selector wasn't defined", plus NG0919 on the
// projection fixture. The barrel evaluates the graph in one fixed order, so the fixtures below no
// longer depend on which of them happens to be imported first.
import {
  SectionList,
  VirtualizedList,
  VListItemDirective,
} from '../components';
import { provideGateDemand } from '../gate-demand';
import { registerComposedComponent } from '../anchor-host-registry';
import { VSectionItemDirective } from './virtualized-section-list/directives';

const ROOT_TAG = 979;
const fabric = installFabric();

const GATE_KEYS = [
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onMagicTap',
  'onAccessibilityEscape',
] as const;

// The projection boundary. A wrapper that DEMANDS NOTHING, with an app-authored consumer projected
// INTO it: under `providers` the consumer would inherit that empty demand and light no gate; under
// `viewProviders` it must answer from its own `.observed` exactly as it would standing alone.
//
// The wrapper is local rather than shipped, and that is forced rather than convenient: every
// wrapper this file used to reach for — `Button`, `TouchableOpacity`, `Pressable` — is a TAG now,
// and a tag provides nothing and consumes nothing. It still exercises the shipped pair
// (`provideGateDemand` here, `injectGateDemandAbove` inside `VirtualizedList`), which is the whole
// mechanism; what it stands in for is only the wrapper's IDENTITY.
@Component({
  selector: 'gate-cascade-wrapper',
  standalone: true,
  viewProviders: [provideGateDemand(() => GateCascadeWrapper)],
  template: '<ng-content></ng-content>',
})
class GateCascadeWrapper {}

registerComposedComponent('gate-cascade-wrapper');

const PROJECTED_ROWS = ['row'];

@Component({
  selector: 'gate-cascade-projected',
  standalone: true,
  imports: [GateCascadeWrapper, VirtualizedList, VListItemDirective],
  template: `
    <gate-cascade-wrapper>
      <VirtualizedList
        [testID]="'mine'"
        [data]="rows"
        [getItem]="getRow"
        [getItemCount]="countRows"
        (accessibilityTap)="onTap()"
      >
        <ng-template vListItem let-item>
          <text>{{ item }}</text>
        </ng-template>
      </VirtualizedList>
    </gate-cascade-wrapper>
  `,
})
class ProjectedConsumerFixture {
  rows = PROJECTED_ROWS;
  getRow = (data: unknown, index: number): string =>
    PROJECTED_ROWS[index] ?? '';
  countRows = (): number => PROJECTED_ROWS.length;
  onTap(): void {}
}

// The FOUR-deep chain, and a different leaf: ScrollView answers the gate through its own
// `gatedAccessibilityCallback`, not Pressable's `accessibilityEmitterHandler`. Two implementations
// of one contract is exactly the pair a shared mechanism has to be shown to cover.
const SECTIONS = [{ title: 'A', data: [{ id: 'row' }] }];

@Component({
  selector: 'gate-cascade-list-quiet',
  standalone: true,
  imports: [SectionList, VSectionItemDirective],
  template: `
    <SectionList [testID]="'list'" [sections]="sections">
      <ng-template vSectionItem let-item>
        <text [testID]="item.id">{{ item.id }}</text>
      </ng-template>
    </SectionList>
  `,
})
class SectionListQuietFixture {
  sections = SECTIONS;
}

@Component({
  selector: 'gate-cascade-list-subscribed',
  standalone: true,
  imports: [SectionList, VSectionItemDirective],
  template: `
    <SectionList [testID]="'list'" [sections]="sections" (magicTap)="onTap()">
      <ng-template vSectionItem let-item>
        <text [testID]="item.id">{{ item.id }}</text>
      </ng-template>
    </SectionList>
  `,
})
class SectionListSubscribedFixture {
  sections = SECTIONS;
  onTap(): void {}
}

function committedNode(testID: string): IFakeNode | undefined {
  const visit = (node: IFakeNode): IFakeNode | undefined => {
    if (node.props.testID === testID) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const found = visit(root);
    if (found) return found;
  }
  return undefined;
}

// Gate keys standing on the committed node, by name. Reads the LIVE tree rather than
// `fabric.find()`, which searches `created` and hands back the pre-clone node
// (`test-harness-false-greens.md`).
function litGates(testID: string): string[] {
  const props = committedNode(testID)?.props;
  if (props === undefined) return [];
  return GATE_KEYS.filter(key => (props[key] ?? null) !== null);
}

const settle = (): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('a wrapper answers the gate for the component it renders', () => {
  describe('Positive', () => {
    // why: the control, and it has to come first. Every negative row below is satisfied by a tree
    // that never mounted or a testID that never matched, so something must be shown to LIGHT
    // before an absence means anything. Four wrappers separate the app's binding from the node
    // that writes the flag.
    it('lights exactly the subscribed gate four wrappers down', async () => {
      mount(ROOT_TAG, SectionListSubscribedFixture);
      await settle();

      expect(litGates('list')).toEqual(['onMagicTap']);
    });

    // why: the projection boundary, which is the whole reason the provider is `viewProviders` and
    // not `providers`. An app's own component must behave as it would standing alone — under
    // `providers` this reads `[]`, because the wrapper's demand says nobody asked.
    it('leaves an app’s own projected consumer answering for itself', async () => {
      mount(ROOT_TAG, ProjectedConsumerFixture);
      await settle();

      expect(litGates('mine')).toEqual(['onAccessibilityTap']);
    });
  });

  describe('Negative', () => {
    // why: THE assertion, and the defect this file exists for. Before the demand, every middle
    // link's own template binding made all four flags true on every instance in every app, so
    // native fired accessibility events into handlers that only re-emitted into nothing. Every
    // middle link's emitter is `.observed` because the level above bound it, so a demand answering
    // from the LOCAL emitter passes the positive rows and fails only here.
    it('lights nothing four wrappers down when the app subscribed to none', async () => {
      mount(ROOT_TAG, SectionListQuietFixture);
      await settle();

      expect(litGates('list')).toEqual([]);
    });

    // why: the wrapper is not a subscriber even for the events it DOES forward. A demand that
    // answered "yes" for every name would pass the positive row above and this one is what
    // separates them.
    it('lights only the one subscribed name, not its three siblings', async () => {
      mount(ROOT_TAG, SectionListSubscribedFixture);
      await settle();

      const lit = litGates('list');
      expect(lit).not.toContain('onAccessibilityAction');
      expect(lit).not.toContain('onAccessibilityTap');
      expect(lit).not.toContain('onAccessibilityEscape');
    });
  });
});
