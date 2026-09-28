// Is React's OWN Fabric renderer runnable in this harness, next to ours, in one binary?
//
// why: device numbers say our create-shaped rows got more expensive after the
// buffer architecture, and the only honest way to answer "do we drive Fabric worse than React
// does" is to drive the SAME C++ Fabric from both, in the same process, and read the ratio. This
// build is Debug with no `-O`, so an absolute millisecond means nothing here — a same-binary ratio
// is the one thing it can legitimately produce.
//
// The enabler is already in the host: `symbiote-host.h` calls
// `UIManagerBinding::createAndInstallIfNeeded`, which is exactly what publishes
// `global.nativeFabricUIManager` on a device. This file asks only whether that global is there and
// what it carries. Nothing is measured yet and nothing is asserted about performance — a probe that
// quietly measures is how a wrong baseline gets into a table.

import { describe, expect, it, print, report } from './harness';

describe('the Fabric JSI binding in the test host', () => {
  // why: every non-React renderer in this repo and React's own renderer reach Fabric through this
  // one global. If it is absent here, the whole comparison has to be built differently, and that is
  // worth knowing before writing a benchmark against it.
  it('publishes nativeFabricUIManager the way a device does', () => {
    const binding: unknown = (globalThis as Record<string, unknown>)
      .nativeFabricUIManager;

    print(`DEBUG typeof nativeFabricUIManager = ${typeof binding}`);
    // `Object.keys` reads EMPTY on a jsi::HostObject — its properties are served by a `get` trap and
    // are not enumerable. So the census has to name what it is looking for, which is the persistent
    // API React's own host config calls.
    const wanted = [
      'createNode',
      'cloneNode',
      'cloneNodeWithNewChildren',
      'cloneNodeWithNewProps',
      'cloneNodeWithNewChildrenAndProps',
      'createChildSet',
      'appendChild',
      'appendChildToSet',
      'completeRoot',
      'measure',
      'measureInWindow',
      'measureLayout',
      'dispatchCommand',
      'setNativeProps',
      'getBoundingClientRect',
      'findNodeAtPoint',
    ];
    const bag = binding as Record<string, unknown>;
    const present = wanted.filter(name => typeof bag[name] === 'function');
    const absent = wanted.filter(name => typeof bag[name] !== 'function');
    print(`DEBUG present (${present.length}) = ${present.join(', ')}`);
    print(`DEBUG absent  (${absent.length}) = ${absent.join(', ')}`);

    expect(typeof binding).toBe('object');
    // why: these five are the whole persistent-mode surface React's Fabric host config drives. If
    // they are here, React's own renderer has everything it needs in this process and the two
    // drivers can be priced against one C++ Fabric.
    expect(typeof bag.createNode).toBe('function');
    expect(typeof bag.cloneNodeWithNewChildren).toBe('function');
    expect(typeof bag.createChildSet).toBe('function');
    expect(typeof bag.appendChildToSet).toBe('function');
    expect(typeof bag.completeRoot).toBe('function');
  });
});

report();
