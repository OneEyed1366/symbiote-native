// Regression coverage for the anchor-vs-real-content class bug (see pressable.test.ts for the
// full writeup): a `class="..."` written on a composed component's OWN use site always resolves
// through Angular's addClass/removeClass onto that component's non-painting ANCHOR host, never
// onto the real committed Fabric view one (or more) levels down. Each Touchable forwards its own
// anchor's resolved style into whatever it commits, mirroring Pressable's fix.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { TouchableHighlight, TouchableOpacity, TouchableWithoutFeedback } from './index';

const ROOT_TAG = 940;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

@Component({
  selector: 'symbiote-touchable-opacity-host',
  standalone: true,
  imports: [TouchableOpacity],
  template: `
    <TouchableOpacity [testID]="'opacity'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableOpacity>
  `,
})
class TouchableOpacityHost {}

@Component({
  selector: 'symbiote-touchable-highlight-host',
  standalone: true,
  imports: [TouchableHighlight],
  template: `
    <TouchableHighlight [testID]="'highlight'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableHighlight>
  `,
})
class TouchableHighlightHost {}

@Component({
  selector: 'symbiote-touchable-without-feedback-host',
  standalone: true,
  imports: [TouchableWithoutFeedback],
  template: `
    <TouchableWithoutFeedback [testID]="'without-feedback'" class="card">
      <symbiote-text>Press</symbiote-text>
    </TouchableWithoutFeedback>
  `,
})
class TouchableWithoutFeedbackHost {}

describe('TouchableOpacity', () => {
  it('resolves a class= on the TouchableOpacity use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableOpacityHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // TouchableOpacity folds its OWN class-derived style into the inner AnimatedView leaf, not
    // the outer Pressable — mirroring React's TouchableOpacity (see adapters/react/src/components/
    // touchable/index.ts's comment: "className is pulled out here, like style, and applied to the
    // inner AnimatedView... it would land on the outer Pressable instead, which is not what a user
    // expects"), so the testID-carrying outer view is NOT where the resolved style lands.
    expect(fabric.find(n => n.props.testID === 'opacity')).toBeDefined();
    const node = fabric.find(n => n.props.backgroundColor === 'red');
    expect(node, 'a committed node received the class-derived style').toBeDefined();
  });
});

describe('TouchableHighlight', () => {
  // why: unlike TouchableOpacity, TouchableHighlight folds its class-derived style onto the SAME
  // outer view that carries testID — a regression here would show up directly on the testID node,
  // not on an inner leaf, so this asserts the style lands where an author actually looks for it.
  it('resolves a class= on the TouchableHighlight use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableHighlightHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'highlight');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

describe('TouchableWithoutFeedback', () => {
  // why: TouchableWithoutFeedback has no visual feedback wrapper at all (its entire point is
  // "render children, add only a press responder") — its anchor fix has the least surrounding
  // machinery of the three Touchables, so a regression here isolates cleanly to the anchor merge.
  it('resolves a class= on the TouchableWithoutFeedback use site onto the real committed view, not the anchor', async () => {
    registerStyles({ card: { backgroundColor: 'red' } });

    mount(ROOT_TAG, TouchableWithoutFeedbackHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'without-feedback');
    expect(node?.props.backgroundColor).toBe('red');
  });
});

// A class toggled AFTER mount, with no @Input of the Touchable changing. The static cases above
// only prove the anchor merge happens ONCE, at creation - they pass even when the merged style is
// computed a single time and then frozen. These prove it keeps tracking.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.
//
// Scoped to the Touchable's OWN subtree rather than the testID node itself, because the three do
// not agree on where the class-derived style lands: TouchableHighlight and TouchableWithoutFeedback
// fold it onto the same view that carries testID, TouchableOpacity onto the inner AnimatedView leaf
// one level down (mirroring React's, see the static cases above). Searching the subtree covers both
// without weakening the assertion - a global search would match a SIBLING Touchable in this fixture
// and pass while the component under test was still frozen.
function subtreeStyled(testID: string, prop: string): unknown {
  const find = (node: IFakeNode, predicate: (n: IFakeNode) => boolean): IFakeNode | undefined => {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return undefined;
  };
  for (const root of fabric.committed) {
    const owner = find(root, node => node.props.testID === testID);
    if (owner === undefined) continue;
    return find(owner, node => node.props[prop] !== undefined)?.props[prop];
  }
  return undefined;
}

let toggleFixture: TouchableToggleFixture | undefined;

@Component({
  selector: 'symbiote-touchable-toggle-host',
  standalone: true,
  imports: [TouchableHighlight, TouchableOpacity, TouchableWithoutFeedback],
  template: `
    <TouchableHighlight [testID]="'toggle-highlight'" [class.dark]="dark">
      <symbiote-text>Press</symbiote-text>
    </TouchableHighlight>
    <TouchableOpacity [testID]="'toggle-opacity'" [class.dark]="dark">
      <symbiote-text>Press</symbiote-text>
    </TouchableOpacity>
    <TouchableWithoutFeedback [testID]="'toggle-plain'" [class.dark]="dark">
      <symbiote-text>Press</symbiote-text>
    </TouchableWithoutFeedback>
  `,
})
class TouchableToggleFixture {
  dark = false;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Captures the live component instance so the test can toggle the class after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    toggleFixture = this;
  }

  enableDark(): void {
    this.dark = true;
    this.changeDetector.markForCheck();
  }
}

describe('a Touchable class toggled after mount', () => {
  // why: TouchableHighlight hands Pressable a STABLE arrow (`[style]="pressedStyle"`). A reference
  // that never changes means Pressable`s style @Input never reports a change, so Pressable never
  // refreshes and never re-invokes the arrow - the anchor`s new class-derived style is read once
  // at creation and then frozen. TouchableOpacity folds its class onto an inner AnimatedView, so
  // it is covered here too; TouchableWithoutFeedback is the control, its getter rebuilds.
  it.each([['toggle-highlight'], ['toggle-plain'], ['toggle-opacity']])(
    'reaches the committed view of %s',
    async testID => {
      registerStyles({ dark: { backgroundColor: 'black' } });

      mount(ROOT_TAG, TouchableToggleFixture);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(subtreeStyled(testID, 'backgroundColor')).toBeUndefined();

      toggleFixture?.enableDark();
      await new Promise<void>(resolve => setTimeout(resolve, 0));

      expect(subtreeStyled(testID, 'backgroundColor')).toBe('black');
    },
  );

  // toggle-opacity was skipped here for a while: its chain is one hop longer than the other two -
  // its own anchor feeds `animatedStyle`, which reaches the inner AnimatedView as a `[style]`
  // binding, and the committed leaf kept only `{opacity: 1}`. That last hop was the Angular
  // styling-input gap, not an AnimatedView bug: a `[style]` binding shadowed into a directive
  // input never marks the receiving view dirty, so AnimatedView's own template (and its
  // `reducedProps` getter) never re-ran. `SymbioteStyleInputDirective` supplies the missing mark;
  // see render/input-propagation.test.ts for the isolated reproduction.
});
