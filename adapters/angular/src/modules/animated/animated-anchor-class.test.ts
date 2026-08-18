// An Animated wrapper's own `class=` must keep tracking after mount, not only land at creation.
//
// `AnimatedComponentBase.reducedProps` folds `anchorHostStyle(this.elementRef)` into the bag it
// pushes - the class-derived style that `class=` / `[class.x]` at the use site resolves onto this
// component's non-painting anchor. That value is written by the renderer's addClass/removeClass,
// never appears in SimpleChanges, and nothing about it dirties THIS component's view. Reading it
// live inside the getter therefore worked at CREATION only: a class toggled later landed on the
// anchor, and the getter that would have picked it up was never re-run.
//
// The fix is the ngDoCheck poll in AnimatedComponentBase. ngDoCheck runs during the PARENT's
// refresh even when this view is skipped, and the signal write is what then marks this view for
// refresh.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.

import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { AnimatedView } from './create-animated-component';

const ROOT_TAG = 963;
const fabric = installFabric();

function committedProp(testID: string, prop: string): unknown {
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
    if (found) return found.props[prop];
  }
  return undefined;
}

let fixture: AnimatedAnchorFixture | undefined;

@Component({
  selector: 'symbiote-animated-anchor-host',
  standalone: true,
  imports: [AnimatedView],
  template: `
    <AnimatedView [animatedProps]="probeProps" [class.dark]="dark">
      <symbiote-text>Hi</symbiote-text>
    </AnimatedView>
  `,
})
class AnimatedAnchorFixture {
  dark = false;
  // Stable reference: a fresh literal per pass would churn the Animated leaf reconcile and
  // muddy what this test is measuring.
  readonly probeProps = { testID: 'animated-anchor' };
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

describe('AnimatedView anchor class', () => {
  // why: the regression the ngDoCheck poll exists for. Verified to fail with the poll removed -
  // the committed view keeps its creation-time style forever.
  it('picks up a class toggled after mount, with no @Input change', async () => {
    registerRules([
      {
        tokens: ['dark'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'black' },
      },
    ]);

    mount(ROOT_TAG, AnimatedAnchorFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(committedProp('animated-anchor', 'backgroundColor')).toBeUndefined();

    fixture?.enableDark();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(committedProp('animated-anchor', 'backgroundColor')).toBe('black');
  });
});
