// The host node an outlet painted, for a component that has to call a function of its native view

import '@angular/compiler';
import { Component, ViewChild } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { el } from '@symbiote-native/components';
import { getNativeTag, isSymbioteNode } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from '../render';
import { DescriptorOutlet } from './index.ts';

const ROOT_TAG = 905;
installRecordingFabric();

@Component({
  selector: 'symbiote-descriptor-outlet-probe',
  standalone: true,
  imports: [DescriptorOutlet],
  template: '<symbiote-descriptor-outlet [node]="node" />',
})
class ProbeHost {
  readonly node = el('view', { testID: 'root' }, []);
  @ViewChild(DescriptorOutlet) outlet?: DescriptorOutlet;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    captured = this;
  }
}

let captured: ProbeHost | undefined;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
};

afterEach(() => {
  unmount(ROOT_TAG);
  captured = undefined;
});

describe('DescriptorOutlet root node', () => {
  it('hands out the committed host node of the root element it painted', async () => {
    mount(ROOT_TAG, ProbeHost);
    await flush();

    const root = captured?.outlet?.rootNode;

    expect(isSymbioteNode(root) && getNativeTag(root)).toEqual(
      expect.any(Number),
    );
  });
});
