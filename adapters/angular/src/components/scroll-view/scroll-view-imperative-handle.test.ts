// RN parity: a ScrollView ref exposes scrollTo/scrollToEnd/flashScrollIndicators
// (`.claude/rules/adapter-parity-audit.md`'s "imperative scroll handle" surface item). The
// commands themselves are engine-level (`core/components/src/scroll-view-commands.ts`, already
// tested there) — what's unproven for Angular specifically is that a template ref on a bare
// `<scroll-view>` actually reaches a node carrying them, through Angular's own `ElementRef`
// indirection (`.nativeElement`). Angular's own `host-instance.test.ts` only proves
// `findNodeHandle` resolution to a native TAG (a number) — not that the resolved instance itself
// carries the imperative scroll commands.
//
// No Negative group: scrollTo/flashScrollIndicators take no input this adapter can reject.
import '@angular/compiler';
import {
  AfterViewInit,
  Component,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSymbioteNode } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';

import '../../register';
import { mount, unmount } from '../../render';
import type { IHostInstance } from '../../host-instance';

const ROOT_TAG = 91_040;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The component writes its own @ViewChild out to this closure the moment Angular resolves it
// (ngAfterViewInit), the same trick Svelte's scroll-view.smoke.test.ts uses via `window.__scrollRef`
// — `mount()` here hands back the surface, not the component instance, so there is no other way to
// read a ViewChild from outside the class.
let capturedRef: ElementRef<unknown> | undefined;

@Component({
  selector: 'scroll-view-handle-fixture',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<scroll-view #scrollRef><text>sv</text></scroll-view>`,
})
class HandleFixture implements AfterViewInit {
  @ViewChild('scrollRef') scrollRef!: ElementRef<unknown>;
  ngAfterViewInit(): void {
    capturedRef = this.scrollRef;
  }
}

function isHostInstance(value: unknown): value is IHostInstance {
  return (
    isSymbioteNode(value) &&
    typeof Reflect.get(value, 'scrollTo') === 'function'
  );
}

async function mountScrollRef(): Promise<IHostInstance> {
  capturedRef = undefined;
  mount(ROOT_TAG, HandleFixture);
  await tick();
  if (capturedRef === undefined)
    throw new Error('ViewChild never resolved via ngAfterViewInit');
  const native = capturedRef.nativeElement;
  if (!isHostInstance(native))
    throw new Error('template ref never resolved to a host instance');
  return native;
}

describe('Angular <scroll-view> imperative handle', () => {
  it('dispatches scrollTo through the ElementRef.nativeElement host instance', async () => {
    const handle = await mountScrollRef();
    handle.scrollTo({ x: 0, y: 42, animated: false });

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('scrollTo');
    expect(fabric.commands[0]?.args).toEqual([0, 42, false]);
    expect(fabric.commands[0]?.node.viewName).toBe('RCTScrollView');
  });

  it('dispatches flashScrollIndicators through the same handle', async () => {
    const handle = await mountScrollRef();
    handle.flashScrollIndicators();

    expect(fabric.commands).toHaveLength(1);
    expect(fabric.commands[0]?.commandName).toBe('flashScrollIndicators');
    expect(fabric.commands[0]?.args).toEqual([]);
  });
});
