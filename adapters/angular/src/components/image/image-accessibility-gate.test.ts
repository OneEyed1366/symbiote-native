// Regression coverage for the eager accessibility-gate binding
// (`.claude/rules/fabric-boolean-event-gates.md`). Image is unique among the eager-gate fixes: it
// forwards each accessibility event through TWO channels — a plain `[onAccessibilityAction]` @Input
// callback AND an `accessibilityAction` @Output — and before this, the template bound the four
// events unconditionally on <symbiote-image>, so every Image lit all four gate flags whether or not
// either channel had a consumer. gatedAccessibilityHandler (shared.ts) must light the flag when
// EITHER channel is wired and stay dark when neither is.
import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

import { mount, unmount } from '../../render';
import { Image } from './index';

const ROOT_TAG = 916;
const fabric = installFabric();

@Component({
  selector: 'symbiote-image-gate-host',
  standalone: true,
  imports: [Image],
  template: `<Image
    [testID]="'photo'"
    [source]="{ uri: 'https://example.com/a.png' }"
  />`,
})
class ImageNoSubscriberFixture {}

@Component({
  selector: 'symbiote-image-gate-output-host',
  standalone: true,
  imports: [Image],
  template: `<Image
    [testID]="'photo'"
    [source]="{ uri: 'https://example.com/a.png' }"
    (accessibilityAction)="onAction($event)"
  />`,
})
class ImageOutputSubscriberFixture {
  onAction(): void {}
}

@Component({
  selector: 'symbiote-image-gate-input-host',
  standalone: true,
  imports: [Image],
  template: `<Image
    [testID]="'photo'"
    [source]="{ uri: 'https://example.com/a.png' }"
    [onAccessibilityTap]="handleTap"
  />`,
})
class ImageInputCallbackSubscriberFixture {
  handleTap = (): void => {};
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

beforeEach(() => {
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
});

describe('Image accessibility gate', () => {
  it('lights no accessibility gate flag with no subscriber on either channel', async () => {
    mount(ROOT_TAG, ImageNoSubscriberFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const props = committedNode('photo')?.props;
    expect(props?.onAccessibilityAction ?? null).toBeNull();
    expect(props?.onAccessibilityTap ?? null).toBeNull();
    expect(props?.onMagicTap ?? null).toBeNull();
    expect(props?.onAccessibilityEscape ?? null).toBeNull();
  });

  it('lights only the subscribed gate flag via the @Output channel', async () => {
    mount(ROOT_TAG, ImageOutputSubscriberFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const props = committedNode('photo')?.props;
    expect(props?.onAccessibilityAction).toBe(true);
    expect(props?.onAccessibilityTap ?? null).toBeNull();
    expect(props?.onMagicTap ?? null).toBeNull();
    expect(props?.onAccessibilityEscape ?? null).toBeNull();
  });

  it('lights only the subscribed gate flag via the raw @Input callback channel', async () => {
    mount(ROOT_TAG, ImageInputCallbackSubscriberFixture);
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    const props = committedNode('photo')?.props;
    expect(props?.onAccessibilityTap).toBe(true);
    expect(props?.onAccessibilityAction ?? null).toBeNull();
    expect(props?.onMagicTap ?? null).toBeNull();
    expect(props?.onAccessibilityEscape ?? null).toBeNull();
  });
});
