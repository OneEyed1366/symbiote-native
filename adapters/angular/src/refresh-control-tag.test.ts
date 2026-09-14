// `refresh-control` as a TAG, measured through Angular's own renderer. The placement and the
// controlled-spinner handshake itself (lastNativeReport, the deferred snap-back check) live on the
// engine node (`core/components/src/behaviors/refresh-control.ts`) and are fully unit-tested there;
// this file proves the ANGULAR WIRING: template binding reaches the tag, its props (refreshing, the
// Android-only `enabled`, `title`) forward to native, its `topRefresh` event reaches `onRefresh`,
// and the snap-back command fires/stays silent through Angular's own change detection — the same
// bridge-smoke shape React's, Vue's and Solid's RefreshControl suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// `RefreshControlElement` extends `ReadBackElement`, NOT `ValueChangeElement` — `refreshing` is a
// plain `@Input()`, not a `[(value)]` two-way alias, so the ValueChangeElement drop bug
// (`.claude/skills/symbiote-rn-parity-sweep/SKILL.md`, TextInput/Switch) does not apply here; no
// `[(refreshing)]` syntax exists to collide with an explicit `[onRefresh]`.
//
// No Negative group: nothing here throws.
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what runs the machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_993;
const MAX_SETTLE_TICKS = 20;
const REFRESH_CONTROL_VIEW = 'PullToRefreshView';
const fabric = installFabric();

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function flushUntilSettled(): Promise<void> {
  let previous = -1;
  for (let index = 0; index < MAX_SETTLE_TICKS; index += 1) {
    await tick();
    const current = fabric.counts.completeRoot;
    if (current === previous && current > 0) return;
    previous = current;
  }
  throw new Error('the tree never settled');
}

function refreshNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === REFRESH_CONTROL_VIEW);
  if (node === undefined)
    throw new Error(`no ${REFRESH_CONTROL_VIEW} was created`);
  return node;
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ commandName: string; args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

let fixtureId = 0;

async function mountTemplate(
  template: string,
  bindings: Record<string, unknown> = {},
): Promise<void> {
  fixtureId += 1;
  @Component({
    // Unique per mount: a repeated selector makes Angular log an NG0912 component-id collision.
    selector: `refresh-control-tag-fixture-${fixtureId}`,
    standalone: true,
    imports: [SYMBIOTE_ELEMENTS],
    template,
  })
  class Fixture {
    [key: string]: unknown;
    constructor() {
      Object.assign(this, bindings);
    }
  }

  mount(ROOT_TAG, Fixture satisfies Type<unknown>);
  await flushUntilSettled();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `refresh-control` as a tag', () => {
  it('forwards refreshing, the Android-only enabled prop, and title to native', async () => {
    await mountTemplate(
      `<refresh-control [refreshing]="false" [enabled]="true" [title]="'Pull to refresh'"></refresh-control>`,
    );

    const props = refreshNode().props;
    expect(props.refreshing).toBe(false);
    expect(props.enabled).toBe(true);
    expect(props.title).toBe('Pull to refresh');
  });

  it('calls onRefresh when topRefresh fires on the refresh-control node', async () => {
    let refreshed = false;
    await mountTemplate(
      `<refresh-control [refreshing]="false" [onRefresh]="onRefresh"></refresh-control>`,
      {
        onRefresh: () => {
          refreshed = true;
        },
      },
    );

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(true);
  });

  // why: native has already started spinning by the time onRefresh runs; a handler that leaves
  // `refreshing` false must command native back down (RefreshControl.js:145-166) — proven here
  // through Angular's own event dispatch, not core's raw routeProp.
  it('commands native back down when the handler leaves refreshing false', async () => {
    await mountTemplate(
      `<refresh-control [refreshing]="false" [onRefresh]="onRefresh"></refresh-control>`,
      { onRefresh: () => {} },
    );

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    await tick();
    await tick();

    expect(
      commandsNamed('setNativeRefreshing').map(entry => entry.args),
    ).toEqual([[false]]);
  });

  // why: Angular's own change detection reaching `props.refreshing` is itself scheduled — the
  // deferred snap-back check must see the ACCEPTED value, not fire against the stale pre-accept
  // one (core module header, same reasoning as Switch's `[(value)]` twin case).
  it('issues no snap-back command when the app accepts via a plain property update', async () => {
    fixtureId += 1;
    @Component({
      selector: `refresh-control-tag-fixture-${fixtureId}`,
      standalone: true,
      imports: [SYMBIOTE_ELEMENTS],
      template: `<refresh-control
        [refreshing]="refreshing"
        [onRefresh]="accept"
      ></refresh-control>`,
    })
    class AcceptingFixture {
      refreshing = false;
      accept = (): void => {
        this.refreshing = true;
      };
    }

    mount(ROOT_TAG, AcceptingFixture);
    await flushUntilSettled();

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    await tick();
    await tick();

    expect(commandsNamed('setNativeRefreshing')).toEqual([]);
  });
});
