// ANGULAR HAS A THIRD DEV SWITCH, and until 2026-09-18 nothing in this project turned it off.
//
// `ngDevMode` is not `__DEV__` and not `NODE_ENV`. When the global is undefined — which is what a
// Metro bundle leaves it as, since `@react-native/babel-preset` inlines `__DEV__` and knows nothing
// about Angular — `initNgDevMode()` turns it ON (`ng_dev_mode.ts:85`). So every release build made
// with this adapter has shipped dev-mode Angular: `inject()` of a special token builds a
// `new NodeInjector` and emits two profiler events PER ELEMENT, and component definitions carry
// debugName metadata.
//
// Measured on `angular-elements-suite.itest.ts`, `build-release`, three runs each, with the census
// byte-identical on both sides (created=10000 setProps=10000 unchanged=3000 nodes=10003) and
// walk/apply/fabric/layout unmoved — so the whole delta is pass 1, inside Angular:
//
//   create   312.3 / 291.3 / 301.2  ->  220.8 / 221.7 / 246.3
//   replace  320.6 / 309.7 / 312.9  ->  235.2 / 234.8 / 263.5
//   append   298.7 / 305.7 / 319.6  ->  226.6 / 226.5 / 233.6
//
// AN EXPLICIT `false` IS THE ONLY THING THAT COUNTS AS A RELEASE, and that asymmetry is the whole
// safety of this. A host that never defines `__DEV__` — a bare JSI runtime, a test process, an
// embedding we have not met — reads `undefined`, and turning Angular's assertions off there would
// trade every NG-code diagnostic for a speed-up nobody asked for. Metro's preset writes a literal
// `true` or `false` into the bundle, so the signal is present exactly when it is trustworthy.
// The component below is compiled JIT here, and so is every injectable `mount` pulls in.
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import { mount, unmount } from './index';

installRecordingFabric();

const ROOT_TAG = 9400;

@Component({
  selector: 'prod-mode-host',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<view testID="probe"></view>`,
})
class ProdModeHost {}

// What `initNgDevMode()` left when `@angular/core` was imported above — a counters OBJECT, not a
// boolean. Captured rather than reconstructed, because the teardown cannot simply delete the global:
// under vitest this repo resolves Angular to its vendored SOURCE, where `ngDevMode` is read as a
// bare identifier, so an absent property is a `ReferenceError` rather than an `undefined`. The first
// spelling of this file deleted it and turned all three cases red from the teardown alone.
const DEV_MODE_AT_IMPORT: unknown = Reflect.get(globalThis, 'ngDevMode');

function devModeFlag(): unknown {
  return Reflect.get(globalThis, 'ngDevMode');
}

function setBundleFlag(value: unknown): void {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, '__DEV__');
    return;
  }
  Reflect.set(globalThis, '__DEV__', value);
}

afterEach(() => {
  unmount(ROOT_TAG);
  setBundleFlag(undefined);
  // Back to what Angular itself left at import. Leaving it `false` would hand every later case in
  // this file a prod-mode Angular and silence the assertions the first two cases are about.
  Reflect.set(globalThis, 'ngDevMode', DEV_MODE_AT_IMPORT);
});

describe('angular dev mode across a bundle boundary', () => {
  // why: the ORDER matters — this case must run before the release one, because turning dev mode
  // off is a global the teardown can only approximate. Asserting the conservative direction first
  // also means a broken guard fails here rather than silently passing later.
  it('stays on when the bundle never says which build this is', () => {
    setBundleFlag(undefined);
    mount(ROOT_TAG, ProdModeHost);
    expect(devModeFlag(), 'an unknown host keeps its assertions').toBeTruthy();
  });

  // why: a dev bundle is an explicit `true`, and it must read the same as an unknown one. A guard
  // written as `!__DEV__` would turn assertions off in a host that defines nothing — the case
  // above — so the two are asserted separately rather than as one.
  it('stays on in a development bundle', () => {
    setBundleFlag(true);
    mount(ROOT_TAG, ProdModeHost);
    expect(devModeFlag(), 'a dev bundle keeps its assertions').toBeTruthy();
  });

  // why: THE WHOLE POINT. A release bundle pays ~25% of an Angular create for assertions its users
  // can never see, and Metro is the only thing that knows which build this is.
  it('goes off in a release bundle', () => {
    setBundleFlag(false);
    mount(ROOT_TAG, ProdModeHost);
    expect(devModeFlag(), 'a release bundle drops them').toBeFalsy();
  });
});
