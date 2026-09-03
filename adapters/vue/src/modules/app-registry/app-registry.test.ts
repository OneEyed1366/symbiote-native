// Co-located Vue-driven test, Vue twin of adapters/react/src/modules/app-registry/
// app-registry.test.tsx. Proves the AppRegistry entry point: `registerComponent(appKey, () =>
// App)` stores a runnable that calls `mount` (driving @symbiote-native/engine) AND bridges it to the
// host registrar (RN's own AppRegistry, injected via `setHostRegistrar`) so native can find it
// by key. Asserts the bridge fires on registration and that invoking the runnable, from the host
// or via `runApplication`, mounts the tree onto the given rootTag.
//
// Scope note: `createAppRegistry` (core/engine/src/app-registry/index.ts) is framework-agnostic
// and has no test of its own — this file and its React twin are the only places most of its
// surface is exercised at all. `registerComponent`/`getAppKeys`/`runApplication`/
// `setWrapperComponentProvider`/`unmountApplicationComponentAtRootTag`/`registerSection` are
// covered below (the ones with either Vue-specific wiring or cheap, meaningful behavior to pin).
// `getRunnable`/`getSections`/`getRegistry` are one-line Map/Set reads with no branch of their
// own — N/A, trivial pass-through. Headless-task host forwarding and pre-bootstrap replay are
// framework-agnostic and covered by core/engine/src/app-registry/app-registry.test.ts.

import { defineComponent, h, type SetupContext } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AppRegistry,
  setHostRegistrar,
  unmount,
  type IAppParameters,
  type IRunnable,
} from '../..';
import { installFabric } from '@symbiote-native/test-utils';
import { Text, View } from '../../components';

const APP_KEY = 'canary';
const ROOT_TAG = 211;

const App = () =>
  h(View, { style: { flex: 1 } }, () => h(Text, null, () => 'hi'));

const fabric = installFabric();
// Vue's mount() requestCommit()s on a microtask (vue-adapter-reactivity Gotcha 2), unlike
// React's synchronous commit, so assertions on the committed tree need one tick.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

// The host registrar the native side drives (RN's AppRegistry stand-in).
const hostRunnables = new Map<string, IRunnable>();
const hostUnmounts: number[] = [];

beforeEach(() => {
  fabric.reset();
  hostRunnables.clear();
  hostUnmounts.length = 0;
  setHostRegistrar({
    registerRunnable: (appKey: string, run: IRunnable): string => {
      hostRunnables.set(appKey, run);
      return appKey;
    },
    unmountAtRootTag: rootTag => {
      hostUnmounts.push(rootTag);
    },
  });
  AppRegistry.registerComponent(APP_KEY, () => App);
});
afterEach(() => unmount(ROOT_TAG));

describe('AppRegistry', () => {
  describe('Positive (registration, mount, and host bridging)', () => {
    // why: registerComponent is the RN-compatible entry point apps call; both halves of its
    // contract — local lookup (getAppKeys) AND the native bridge (setHostRegistrar) — must fire
    // from the same registration, or native could list a key the JS side doesn't actually run.
    it('exposes the app key and bridges the runnable to the host registrar', () => {
      expect(AppRegistry.getAppKeys()).toContain(APP_KEY);
      expect(hostRunnables.get(APP_KEY)).toBeDefined();
    });

    // why: proves the native call path — native holds only the bridged runnable (never calls back
    // into AppRegistry), so invoking exactly what registerRunnable received must still mount the
    // real component tree onto the given rootTag.
    it('mounts the tree when the host invokes the runnable with a rootTag', async () => {
      const hostRun = hostRunnables.get(APP_KEY);
      expect(hostRun).toBeDefined();

      const nativeParams: IAppParameters = { rootTag: ROOT_TAG };
      hostRun!(nativeParams);
      await tick();

      expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
    });

    // why: runApplication is the local/dev entry point (no native host involved) — it must drive
    // the identical runnable the host bridge would have, not a separate code path that could drift.
    it('runApplication drives the same runnable locally', async () => {
      AppRegistry.runApplication(APP_KEY, { rootTag: ROOT_TAG });
      await tick();

      expect(fabric.find(n => n.viewName === 'RCTText')).toBeDefined();
    });

    // why: unmountApplicationComponentAtRootTag is the teardown half of the host bridge — RN's
    // host calls it to release a surface it owns; a missed bridge would leak the native-side
    // surface even after the JS tree is gone.
    it('bridges unmountApplicationComponentAtRootTag to the host registrar', () => {
      const UNMOUNT_TAG = 999;
      AppRegistry.unmountApplicationComponentAtRootTag(UNMOUNT_TAG);

      expect(hostUnmounts).toEqual([UNMOUNT_TAG]);
    });

    // why: registerSection (RN's "also runnable, but tracked separately for a section-based host
    // launcher") must be distinguishable from a plain app — a section key belongs in BOTH
    // getAppKeys (it is still runnable) and getSectionKeys (it is a section), while a plain
    // registerComponent key must never leak into getSectionKeys.
    it('registerSection tracks the key as both a runnable and a section', () => {
      const SECTION_KEY = 'canary-section';
      AppRegistry.registerSection(SECTION_KEY, () => App);

      expect(AppRegistry.getAppKeys()).toContain(SECTION_KEY);
      expect(AppRegistry.getSectionKeys()).toContain(SECTION_KEY);
      expect(AppRegistry.getSectionKeys()).not.toContain(APP_KEY);
    });
  });

  // No throwing/rejecting path exists on this surface (register/run/unmount all take a plain
  // string key and a plain object; there is no invalid shape they reject). The one alternative-
  // to-success outcome is silently ignoring an app key nothing registered — RN's own behavior
  // (AppRegistryImpl logs and returns), not an error condition — so it gets its own group instead
  // of a Negative one.
  describe('Silent no-op (unknown app key)', () => {
    // why: a typo'd or stale app key must not throw and must not mount anything — a host that
    // races a runApplication call against an app that hasn't registered yet (or was torn down)
    // should see nothing happen, not a crash.
    it('runApplication does nothing for a key nothing registered', async () => {
      AppRegistry.runApplication('does-not-exist', { rootTag: ROOT_TAG });
      await tick();

      expect(fabric.created).toHaveLength(0);
    });
  });

  // QUESTION: setWrapperComponentProvider's public signature takes TWrapperComponentProvider (not
  // `| undefined`), so once a test installs a wrapper there is no public API to clear it back to
  // "no wrapper" — the provider is a module-lifetime singleton (`let wrapperComponentProvider` in
  // createAppRegistry, core/engine/src/app-registry/index.ts:131), read live by every future
  // `runApplication`/host-invoked run in the whole process, including other test files that import
  // the same `@symbiote-native/vue` module instance without their own reset. That's a real
  // testability gap in `createAppRegistry`, not fixed here (production code is out of scope for
  // this sweep). Worked around by making this the LAST test in the file, so no other test here
  // observes the leaked wrapper; a future test file adding its own wrapper-provider coverage
  // should be aware it inherits whatever the last-run file left behind.
  describe('Positive (Vue-specific wrapper composition — run last, see QUESTION above)', () => {
    // why: the Vue-specific seam this file exists to prove beyond the entry point itself —
    // `runnableFor`'s Vue implementation has no createElement-style prop spread, so wrapping the
    // root is a default-slot render (`h(Wrapper, null, { default: renderRoot })`), unlike React's
    // `createElement(Wrapper, null, element)`. A break here (e.g. slot dropped, wrong prop shape)
    // would silently render just the wrapper with no app content, which no other test catches.
    // Also pins that the provider is read LIVE at run time, not snapshotted at registration —
    // registerComponent already ran in beforeEach, before setWrapperComponentProvider below.
    it('wraps the mounted root in the live wrapperComponentProvider and forwards appParameters', async () => {
      let receivedParams: IAppParameters | undefined;
      const Wrapper = defineComponent({
        setup(_props: unknown, { slots }: SetupContext) {
          return () =>
            h(View, { style: { flex: 1 } }, () => [
              h(Text, null, () => 'wrapped'),
              slots.default?.(),
            ]);
        },
      });
      AppRegistry.setWrapperComponentProvider(params => {
        receivedParams = params;
        return Wrapper;
      });

      AppRegistry.runApplication(APP_KEY, { rootTag: ROOT_TAG });
      await tick();

      expect(receivedParams).toEqual({ rootTag: ROOT_TAG });
      const texts = fabric.created
        .filter(n => n.viewName === 'RCTRawText')
        .map(n => n.props.text);
      expect(texts).toEqual(expect.arrayContaining(['wrapped', 'hi']));
    });
  });
});
