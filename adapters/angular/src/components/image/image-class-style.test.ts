// Regression test for the anchor/class bug: Image is its own
// ANCHOR_HOST_COMPONENTS entry — a class= on <Image> resolves onto Image's OWN anchor and needs
// its OWN anchorHostStyle merge (see index.ios.ts/index.android.ts's imageProps override), not
// transitively fixed by anything else. Mirrors pressable.test.ts's "resolves a class=" case.
import '@angular/compiler';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Image } from './index';

const ROOT_TAG = 915;
const fabric = installFabric();

@Component({
  selector: 'symbiote-image-class-host',
  standalone: true,
  imports: [Image],
  template: `<Image
    [testID]="'photo'"
    class="card"
    [source]="{ uri: 'https://example.com/a.png' }"
  />`,
})
class ImageClassHost {}

// A class toggled AFTER mount, with no @Input of the Image changing — the case that tells whether
// the memoized imageProps still tracks the anchor's class-derived style (see the platform
// components' ngDoCheck poll). The instance is captured so the flip is a plain field write +
// markForCheck, the way an app's own state change reaches the template.
let toggleFixture: ImageToggleHost | undefined;

@Component({
  selector: 'symbiote-image-toggle-host',
  standalone: true,
  imports: [Image],
  template: `<Image
    [testID]="'photo-toggle'"
    [class.dark]="dark"
    [source]="{ uri: 'https://example.com/a.png' }"
  />`,
})
class ImageToggleHost {
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

beforeEach(() => {
  fabric.reset();
  registerStyles({ card: { backgroundColor: 'red' } });
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Image anchor class= resolution', () => {
  it('resolves a class= on the Image use site onto the real committed view, not the anchor', async () => {
    mount(ROOT_TAG, ImageClassHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const node = fabric.find(n => n.props.testID === 'photo');
    expect(node?.props.backgroundColor).toBe('red');
  });

  // why: imageProps is a memoized computed() keyed on a revision signal only ngOnChanges bumps, and
  // a class toggle never appears in SimpleChanges — it reaches the anchor through the renderer's
  // addClass. Without the platform component's ngDoCheck poll of the anchor style the bag would
  // keep the class it was built with, and a `[class.x]` that flips after mount would never repaint.
  it('picks up a class toggled after mount, with no @Input change', async () => {
    registerStyles({ dark: { backgroundColor: 'black' } });

    mount(ROOT_TAG, ImageToggleHost);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(committedNode('photo-toggle')?.props.backgroundColor).toBeUndefined();

    toggleFixture?.enableDark();
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    expect(committedNode('photo-toggle')?.props.backgroundColor).toBe('black');
  });
});
