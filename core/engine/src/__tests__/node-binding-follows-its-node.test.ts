import { describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { bindToNode, createElement, createSurface } from '../index';
import { setTreeHost, treeHost } from '../tree-host';

installRecordingFabric();
let nextRootTag = 10_100;

function mounted() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  return { surface, node };
}

// The host answers with a family generation that a test moves by hand
function withGeneration(read: () => number | undefined, body: () => void) {
  const real = treeHost();
  if (real === undefined) throw new Error('no host installed');
  setTreeHost({
    ...real,
    committedRecordOf: handle => {
      const record = real.committedRecordOf(handle);
      return record === undefined
        ? undefined
        : { ...record, familyGeneration: read() };
    },
  });
  try {
    body();
  } finally {
    setTreeHost(real);
  }
}

describe('a binding to a node', () => {
  it('attaches only once the node has committed', () => {
    const attach = vi.fn();
    const { surface, node } = mounted();

    bindToNode(node, attach);
    expect(attach).not.toHaveBeenCalled();
    surface.commit();

    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('attaches straight away on a node that already committed', () => {
    const attach = vi.fn();
    const { surface, node } = mounted();
    surface.commit();

    bindToNode(node, attach);

    expect(attach).toHaveBeenCalledTimes(1);
  });

  it('is let go once, however often it is unbound', () => {
    const release = vi.fn();
    const { surface, node } = mounted();
    surface.commit();
    const unbind = bindToNode(node, () => release);

    unbind();
    unbind();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('never attaches when it is unbound before the node commits', () => {
    const attach = vi.fn();
    const { surface, node } = mounted();
    const unbind = bindToNode(node, attach);

    unbind();
    surface.commit();

    expect(attach).not.toHaveBeenCalled();
  });

  it('is let go when its node leaves the tree', () => {
    const release = vi.fn();
    const { surface, node } = mounted();
    surface.commit();
    bindToNode(node, () => release);

    surface.removeChild(node);
    surface.commit();

    expect(release).toHaveBeenCalledTimes(1);
  });

  it('keeps several bindings of one node apart', () => {
    const releaseFirst = vi.fn();
    const releaseSecond = vi.fn();
    const { surface, node } = mounted();
    surface.commit();
    const unbindFirst = bindToNode(node, () => releaseFirst);
    bindToNode(node, () => releaseSecond);

    unbindFirst();

    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(releaseSecond).not.toHaveBeenCalled();
  });

  it('is let go and attached again after the commit that changed the family', () => {
    const release = vi.fn();
    const attach = vi.fn(() => release);
    let generation = 1;

    withGeneration(
      () => generation,
      () => {
        const { surface, node } = mounted();
        surface.commit();
        bindToNode(node, attach);

        generation = 2;
        surface.commit();

        expect(release).toHaveBeenCalledTimes(1);
        expect(attach).toHaveBeenCalledTimes(2);
      },
    );
  });

  it('stays attached while the generation holds or the host reports none', () => {
    const attach = vi.fn();
    withGeneration(
      () => undefined,
      () => {
        const { surface, node } = mounted();
        surface.commit();
        bindToNode(node, attach);
        surface.commit();

        expect(attach).toHaveBeenCalledTimes(1);
      },
    );
  });
});
