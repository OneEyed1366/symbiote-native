// Button's class-derived look must keep tracking after mount, not freeze at creation.
//
// Button is the one composed component SymbioteStyleInputDirective cannot cover: RN's Button has no
// `style` prop, so there is no `style` @Input for it to hang off, and a class reaches only the
// anchor. Hence the ngDoCheck-polled signal - verified to fail with a plain getter.
//
// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`. Scoped
// to Button's subtree: it folds the anchor style onto the inner TouchableOpacity, below testID.

import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { Button } from './button';

const ROOT_TAG = 977;
const fabric = installFabric();

function subtreeStyled(testID: string, prop: string): unknown {
  const find = (
    node: IFakeNode,
    predicate: (n: IFakeNode) => boolean,
  ): IFakeNode | undefined => {
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

let fixture: ButtonToggleFixture | undefined;

@Component({
  selector: 'symbiote-button-toggle-host',
  standalone: true,
  imports: [Button],
  template: `<Button
    [testID]="'toggle-button'"
    title="x"
    [class.dark]="dark"
  ></Button>`,
})
class ButtonToggleFixture {
  dark = false;
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

describe('Button', () => {
  it('resolves a class toggled after mount onto the committed view', async () => {
    registerRules([
      {
        tokens: ['dark'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'black' },
      },
    ]);
    mount(ROOT_TAG, ButtonToggleFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(subtreeStyled('toggle-button', 'backgroundColor')).toBeUndefined();

    fixture?.enableDark();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(subtreeStyled('toggle-button', 'backgroundColor')).toBe('black');
  });
});
