// Android-specific twin of the class= regressions covered for iOS in switch.test.ts and
// switch-class-toggle.test.ts. Switch's buildHostProps() is overridden per-platform component
// (index.ios.ts / index.android.ts), each injecting its OWN ElementRef and holding its OWN
// anchorStyle signal, so both fixes need their own coverage against the Android build too.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Switch } from './index.android';

const ROOT_TAG = 942;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

@Component({
  selector: 'symbiote-android-switch-class-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [testID]="'switch-with-class'" class="card"></Switch>`,
})
class AndroidSwitchClassHost {}

// A class toggled AFTER mount, with no @Input of the Switch changing — the case that tells whether
// the memoized hostProps still tracks the anchor's class-derived style (see index.android.ts's
// ngDoCheck poll). The instance is captured so the flip is a plain field write + markForCheck, the
// way an app's own state change reaches the template.
let toggleFixture: AndroidSwitchToggleHost | undefined;

@Component({
  selector: 'symbiote-android-switch-toggle-host',
  standalone: true,
  imports: [Switch],
  template: `<Switch [testID]="'switch-toggle'" [class.dark]="dark"></Switch>`,
})
class AndroidSwitchToggleHost {
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

describe('Switch (android)', () => {
  // why: index.android.ts's hostProps override injects its OWN ElementRef via anchorHostStyle —
  // the iOS fix (switch.test.ts) does not transitively cover Android, since each platform build is
  // a distinct component class with its own anchor.
  it('resolves a class= on the Switch use site onto the real committed view, not the anchor', async () => {
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'red' },
      },
    ]);

    mount(ROOT_TAG, AndroidSwitchClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'switch-with-class');
    expect(node?.props.backgroundColor).toBe('red');
  });

  // why: hostProps is a memoized computed() keyed on a revision signal only ngOnChanges bumps, and
  // a class toggle never appears in SimpleChanges — it reaches the anchor through the renderer's
  // addClass. Without index.android.ts's ngDoCheck poll of the anchor style the bag would keep the
  // class it was built with, and a `[class.x]` that flips after mount would never repaint.
  it('picks up a class toggled after mount, with no @Input change', async () => {
    registerRules([
      {
        tokens: ['dark'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: 'black' },
      },
    ]);

    mount(ROOT_TAG, AndroidSwitchToggleHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(
      committedNode('switch-toggle')?.props.backgroundColor,
    ).toBeUndefined();

    toggleFixture?.enableDark();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(committedNode('switch-toggle')?.props.backgroundColor).toBe('black');
  });
});
