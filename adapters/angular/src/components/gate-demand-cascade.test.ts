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
// The chains under test are the real ones, at their real depth:
//
//   Button      -> TouchableOpacity      -> Pressable    3 deep
//   SectionList -> VirtualizedSectionList -> VirtualizedList -> ScrollView   4 deep
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { Button } from './button';
import { Pressable } from './pressable/index';
import { SectionList } from './section-list/index';
import { TouchableOpacity } from './touchable/index';
import { VSectionItemDirective } from './virtualized-section-list/directives';

const ROOT_TAG = 979;
const fabric = installFabric();

const GATE_KEYS = [
  'onAccessibilityAction',
  'onAccessibilityTap',
  'onMagicTap',
  'onAccessibilityEscape',
] as const;

@Component({
  selector: 'gate-cascade-button-quiet',
  standalone: true,
  imports: [Button],
  template: `<Button [testID]="'btn'" [title]="'Go'"></Button>`,
})
class ButtonQuietFixture {}

@Component({
  selector: 'gate-cascade-button-subscribed',
  standalone: true,
  imports: [Button],
  template: `<Button
    [testID]="'btn'"
    [title]="'Go'"
    (accessibilityTap)="onTap()"
  ></Button>`,
})
class ButtonSubscribedFixture {
  onTap(): void {}
}

// The app writes its OWN Pressable and projects it through a wrapper. Under `providers` this
// Pressable would inherit the wrapper's demand; under `viewProviders` it must not, and must answer
// from its own `.observed` exactly as it would standing alone.
@Component({
  selector: 'gate-cascade-projected',
  standalone: true,
  imports: [TouchableOpacity, Pressable],
  template: `<TouchableOpacity [testID]="'outer'">
    <Pressable [testID]="'mine'" (accessibilityTap)="onTap()"></Pressable>
  </TouchableOpacity>`,
})
class ProjectedPressableFixture {
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
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
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
        <symbiote-text [testID]="item.id">{{ item.id }}</symbiote-text>
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
    // before an absence means anything.
    it('lights exactly the subscribed gate three wrappers down', async () => {
      mount(ROOT_TAG, ButtonSubscribedFixture);
      await settle();

      expect(litGates('btn')).toEqual(['onAccessibilityTap']);
    });

    // why: the same mechanism one link deeper and through a different leaf implementation. Four
    // wrappers separate the app's binding from the node that writes the flag.
    it('lights exactly the subscribed gate four wrappers down', async () => {
      mount(ROOT_TAG, SectionListSubscribedFixture);
      await settle();

      expect(litGates('list')).toEqual(['onMagicTap']);
    });

    // why: the projection boundary, which is the whole reason the provider is `viewProviders` and
    // not `providers`. An app's own Pressable must behave as it would standing alone — under
    // `providers` this reads `[]`, because the wrapper's demand says nobody asked.
    it('leaves an app’s own projected Pressable answering for itself', async () => {
      mount(ROOT_TAG, ProjectedPressableFixture);
      await settle();

      expect(litGates('mine')).toEqual(['onAccessibilityTap']);
    });
  });

  describe('Negative', () => {
    // why: THE assertion, and the defect this file exists for. Before the demand, Button's own
    // template binding on TouchableOpacity — and TouchableOpacity's on Pressable — made all four
    // flags true on every Button in every app, so native fired accessibility events into handlers
    // that only re-emitted into nothing.
    it('lights nothing when the app subscribed to none of them', async () => {
      mount(ROOT_TAG, ButtonQuietFixture);
      await settle();

      expect(litGates('btn')).toEqual([]);
    });

    // why: the four-deep twin of the row above. Every middle link's own emitter is `.observed`
    // because the level above bound it, so a demand answering from the LOCAL emitter passes the
    // positive rows and fails only here.
    it('lights nothing four wrappers down when the app subscribed to none', async () => {
      mount(ROOT_TAG, SectionListQuietFixture);
      await settle();

      expect(litGates('list')).toEqual([]);
    });

    // why: the wrapper is not a subscriber even for the events it DOES forward. A demand that
    // answered "yes" for every name would pass the positive row above and this one is what
    // separates them.
    it('lights only the one subscribed name, not its three siblings', async () => {
      mount(ROOT_TAG, ButtonSubscribedFixture);
      await settle();

      const lit = litGates('btn');
      expect(lit).not.toContain('onAccessibilityAction');
      expect(lit).not.toContain('onMagicTap');
      expect(lit).not.toContain('onAccessibilityEscape');
    });
  });
});
