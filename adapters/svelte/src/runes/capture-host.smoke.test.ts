// `{@attach captureHost(...)}` вместо `bind:this`, который под customRenderer не компилируется

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'svelte/compiler';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { isSymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from '../render';

const ROOT_TAG = 91_202;
const ATTACHMENTS_MODULE = join(__dirname, 'attachments.ts');
const TMP_DIR = join(__dirname, '../../build/__smoke__/capture-host');

const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
  unmount(ROOT_TAG);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

async function compileHostProbe(): Promise<Component<{ onHost: object }>> {
  const source = `<script>
    import { captureHost } from '${ATTACHMENTS_MODULE}';
    let { onHost } = $props();
  </script>
  <view {@attach captureHost(onHost)} />`;
  const result = compile(source, {
    generate: 'client',
    filename: 'HostProbe.svelte',
    fragments: 'tree',
    css: 'external',
  });
  const file = join(TMP_DIR, 'HostProbe.mjs');
  writeFileSync(file, result.js.code);
  const mod: unknown = await import(`file://${file}`);
  if (mod === null || typeof mod !== 'object' || !('default' in mod)) {
    throw new Error('compiled HostProbe.svelte produced no default export');
  }
  return mod.default as Component<{ onHost: object }>;
}

describe('captureHost', () => {
  describe('Positive', () => {
    it('hands the committed host node to the callback once mounted', async () => {
      const onHost = vi.fn();
      const HostProbe = await compileHostProbe();

      mount(ROOT_TAG, HostProbe, { onHost });
      await tick();

      expect(onHost).toHaveBeenCalledTimes(1);
      const host: unknown = onHost.mock.calls[0]?.[0];
      expect(isSymbioteNode(host)).toBe(true);
      expect(host).toHaveProperty('component', 'RCTView');
    });

    it('clears the reference with null when the element is destroyed', async () => {
      const onHost = vi.fn();
      const HostProbe = await compileHostProbe();

      mount(ROOT_TAG, HostProbe, { onHost });
      await tick();
      unmount(ROOT_TAG);

      expect(onHost).toHaveBeenLastCalledWith(null);
    });
  });
});
