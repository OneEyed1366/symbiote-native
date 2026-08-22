// A `[style]` binding onto a component that declares `style` as an @Input must re-execute that
// component's own template, not just write the field.
//
// The gap this guards is Angular's, not ours (verified against @angular/core 22.0.8). An ordinary
// `[foo]` binding compiles to `ɵɵproperty` -> `setPropertyAndInputs`, which ends in
// `markDirtyIfOnPush` — the flag `detectChangesInView` needs before it re-enters a non-CheckAlways
// view. `[style]`/`[class]` compile to the styling instructions instead, and when they find a
// directive input of the same name they hand off to `setDirectiveInputsWhichShadowsStyling`
// (`render3/instructions/property.ts`), which writes the input and stops. `ngOnChanges` fires with
// the new value while the component's template — and every getter it reads — stays frozen at its
// creation value. `SymbioteStyleInputDirective` supplies the missing mark; see its doc comment.
//
// The React and Vue twins of this scenario pass on their own
// (adapters/react/src/components/touchable/touchable-style-updates.test.tsx,
// adapters/vue/src/components/touchable-style-updates.test.ts).
//
// Harness copied from __tests__/responder-nested-cd.test.ts: the change is driven by a real touch
// through the fake Fabric slot, so the trigger is the device path (a flat-bag callback ->
// SymbioteHostPropsDirective's markForCheck) rather than a hand-called detectChanges. Assertions
// read `fabric.committed` — `fabric.find` only ever sees a node's FIRST-created props, so a prop
// UPDATE is invisible there.

import '@angular/compiler';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from './index';
import {
  ViewHost as View,
  SymbioteHostPropsDirective,
  SymbioteStyleInputDirective,
} from '../primitives';
import { AnimatedView } from '../modules/animated';
import { registerComposedComponent } from '../anchor-host-registry';

const ROOT_TAG = 974;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

registerComposedComponent('input-propagation-child');

const fabric = installFabric();

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  const stack = [...fabric.committed];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) continue;
    if (predicate(node)) return node;
    stack.push(...node.children);
  }
  return undefined;
}

// The engine flattens a resolved style onto the native node's own props bag (see render.test.ts's
// `toMatchObject({ padding: 12 })`), so a derived style value lands as `props.margin`, never
// `props.style.margin`.
function committedMargin(testID: string): unknown {
  return findCommitted(n => n.props.testID === testID)?.props.margin;
}

function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// OnPush + a getter read from the template: the narrowest thing that can show the gap. The getter
// is the observable — it runs only when this component's own template re-executes. `other` is the
// control input: same value, same getter, a name Angular does not treat as styling.
@Component({
  selector: 'input-propagation-child',
  standalone: true,
  imports: [View, SymbioteHostPropsDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  template: `<View [symbioteHostProps]="bag"></View>`,
})
class InputPropagationChild {
  @Input() style: unknown = undefined;
  @Input() other: unknown = undefined;
  @Input() testID = 'leaf';

  get bag(): Record<string, unknown> {
    return { testID: this.testID, style: this.style ?? this.other };
  }
}

@Component({
  selector: 'input-propagation-root',
  standalone: true,
  imports: [
    View,
    AnimatedView,
    InputPropagationChild,
    SymbioteHostPropsDirective,
  ],
  template: `<View [symbioteHostProps]="handlers"></View
    ><input-propagation-child
      [style]="margins()"
      [testID]="'styled-leaf'"
    ></input-propagation-child
    ><input-propagation-child
      [other]="margins()"
      [testID]="'control-leaf'"
    ></input-propagation-child
    ><symbiote-animated-view
      [style]="margins()"
      [animatedProps]="animatedLeafProps"
    ></symbiote-animated-view>`,
})
class InputPropagationRoot {
  margin = 1;
  // Stable by identity on purpose: a fresh object literal here would be an ordinary (non-styling)
  // binding change every pass, which marks the child dirty through the very path this file is
  // about and would mask the gap.
  readonly animatedLeafProps = { testID: 'animated-leaf' };

  margins(): Record<string, unknown> {
    return { margin: this.margin };
  }

  handlers = {
    testID: 'input-propagation-trigger',
    onStartShouldSetResponder: () => true,
    onResponderRelease: () => {
      this.margin += 1;
    },
  };
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular style-input propagation into a child template', () => {
  // why: see the file header. The parent refreshes and writes the input either way; only the
  // committed node shows whether the child's own template re-ran to derive from it.
  it('re-executes a child component template when its `style` @Input changes', async () => {
    mount(ROOT_TAG, InputPropagationRoot);
    await flush();
    expect(committedMargin('styled-leaf')).toBe(1);
    expect(committedMargin('control-leaf')).toBe(1);
    expect(committedMargin('animated-leaf')).toBe(1);

    const trigger = handleFor('input-propagation-trigger');
    fabric.fireEvent(trigger, TOUCH_START);
    fabric.fireEvent(trigger, TOUCH_END);
    await flush();

    // The control proves the parent refreshed and that the same value reached a sibling child
    // through an ordinary binding in the same change-detection pass — so a failure above is the
    // styling-binding gap, not a dead parent or a missed tick.
    expect(committedMargin('control-leaf')).toBe(2);
    expect(committedMargin('styled-leaf')).toBe(2);
    // A real shipped component, not just the local fixture: proves the adapter's own components
    // actually carry the compensating host directive.
    expect(committedMargin('animated-leaf')).toBe(2);
  });
});
