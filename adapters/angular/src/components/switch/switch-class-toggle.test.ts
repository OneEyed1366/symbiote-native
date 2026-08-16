// why: Switch's hostProps is a memoized computed() keyed on a revision signal that only
// ngOnChanges bumps, and a class toggled at the use site NEVER appears in SimpleChanges — it
// reaches the component's non-painting anchor through the renderer's addClass/removeClass. Without
// the anchorStyle signal the platform component polls in ngDoCheck, the bag would keep the class it
// was first built with and a `[class.x]` flipped after mount would silently never repaint. Verified
// red with that poll removed. Twin of safe-area-view.test.ts's "picks up a class toggled after
// mount". The Android build is a distinct component class with its own anchor, so it carries its
// own copy of this case in android-switch-class.test.ts.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Switch } from './index.ios';

const ROOT_TAG = 947;
const fabric = installFabric();

let toggleFixture: SwitchToggleFixture | undefined;

@Component({
  selector: 'symbiote-ios-switch-toggle-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [testID]="'sw'" [class.dark]="dark"></Switch>`,
})
class SwitchToggleFixture {
  dark = false;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {
    // Captures the live component instance so the test can drive it after mount.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    toggleFixture = this;
  }

  enableDark(): void {
    this.dark = true;
    this.changeDetector.markForCheck();
  }
}

// `fabric.find` only ever sees a node's FIRST-created props (createNode never re-runs on update),
// so a style that lands after mount only shows up on the live clone in `fabric.committed`.
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

const tick = (): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  toggleFixture = undefined;
  registerStyles({ dark: { backgroundColor: 'black' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Switch (ios) anchor class toggled after mount', () => {
  it('picks up a class toggled after mount, with no @Input change', async () => {
    mount(ROOT_TAG, SwitchToggleFixture);
    await tick();
    expect(committedNode('sw')?.props.backgroundColor).toBeUndefined();

    toggleFixture?.enableDark();
    await tick();

    expect(committedNode('sw')?.props.backgroundColor).toBe('black');
  });
});
