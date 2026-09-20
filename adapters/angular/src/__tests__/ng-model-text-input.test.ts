// `[(ngModel)]` on a `<text-input>` tag — the path `TextInputValueAccessor` exists for, and one
// that had never run on a device until 2026-09-14.
//
// IT COULD NOT HAVE. `examples/angular`'s ApiPlaygroundScreen imported `TextInputElement` by name
// and not the accessor, so @angular/forms had no `ControlValueAccessor` to select for that element
// at all; `SYMBIOTE_ELEMENTS` is what brought one into scope (commit 054f85da). So the first
// device run of this binding is also the first exercise of everything below it.
//
// The route is the one no other change-detection test here reaches:
// `registerOnChange` -> `Renderer2.listen('valueChange')` -> `routeProp('onValueChange')`, with
// `registerOnTouched` writing an `onBlur` FUNCTION PROP through `Renderer2.setProperty` beside it
// — which the renderer WRAPS since 2026-09-18, so a blur now runs a synchronous `detectChanges()`
// from inside the native dispatch.
//
// WHAT THIS HARNESS DOES NOT SEE, said plainly rather than implied by a green run: the device
// reported a hard crash on the first keystroke on 2026-09-20 and all three cases below pass. So
// either the cause is above the adapter (the JIT compiler vitest runs is not the linked AOT
// artifact Metro ships — `style-input-aot.test.ts` §header) or it is native. This file pins the
// path; it is not evidence that the path is whole.
import '@angular/compiler';
import { Component } from '@angular/core';
// NOT `@angular/common` — this package does not depend on it, so the legacy `*ngIf`/`[ngClass]`
// halves of the canary screen are out of headless reach here and the built-in control flow stands
// in for them.
import { FormsModule } from '@angular/forms';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf, propsOf } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import '../register';
import { mount, unmount } from '../render';
import { SYMBIOTE_ELEMENTS } from '../elements';
import { SymbioteHostPropsDirective } from '../primitives/shared';

const ROOT_TAG = 9487;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

@Component({
  selector: 'ng-model-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule],
  // A plain field and a static `class`, which is exactly what the canary screen writes.
  template: `
    <text-input testID="probe" class="ti" [(ngModel)]="value"></text-input>
    <text testID="readout">{{ value }}</text>
  `,
})
class NgModelHost {
  value = 'edit me';
}

// The keystroke's flush is `detectChanges()` on the WHOLE screen view, synchronously, inside the
// native event dispatch — so every other binding on that screen re-runs on every character. This
// arm carries the shapes ApiPlaygroundScreen puts beside its `[(ngModel)]`, since a throw from any
// of them lands on the keystroke rather than on the screen that opened cleanly.
@Component({
  selector: 'ng-model-screen',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS, FormsModule, SymbioteHostPropsDirective],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="pg-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class="hero-badge" [style]="heroBadgeStyle">
          <text class="hero-badge-text">AP</text>
        </view>
        @if (legacyVisible) {
          <text class="info-text">visible</text>
        }
        @for (tag of legacyTags; track tag) {
          <text class="list-row-text">{{ tag }}</text>
        }
        @switch (legacyMode) {
          @case ('a') {
            <text class="info-text">a</text>
          }
          @default {
            <text class="info-text">default</text>
          }
        }
        @for (row of attrDemoRows; track row) {
          <view [symbioteHostProps]="attrRowProps(row)" class="pg-row"></view>
        }
        <view
          [class.pg-hb-active]="styleDotActive"
          testID="pg-classdot"
          class="pg-swatch"
        ></view>
        <view
          [style.borderWidth.px]="styleDotActive ? 4 : 1"
          class="pg-swatch"
          testID="pg-styledot"
        ></view>
        <text-input
          testID="probe"
          placeholder="type here"
          class="text-input"
          [(ngModel)]="value"
        ></text-input>
        <text testID="readout">{{ value }}</text>
      </scroll-view>
    </safe-area-view>
  `,
})
class NgModelScreen {
  value = 'edit me';
  legacyVisible = true;
  legacyMode = 'a';
  styleDotActive = false;
  readonly legacyTags: readonly string[] = ['alpha', 'beta'];
  readonly attrDemoRows: readonly number[] = [0, 1, 2];
  readonly heroBadgeStyle = { backgroundColor: '#dd0031' };

  // A FRESH object per call, as the screen writes it: every flush re-runs this binding.
  attrRowProps(row: number): { testID: string } {
    return { testID: `pg-attr-row-${row}` };
  }
}

function readout(): string | undefined {
  const node = fabric.find(n => n.props.testID === 'readout');
  if (node === undefined) return undefined;
  const [rawText] = childrenOf(node.handle);
  if (rawText === undefined) return undefined;
  const text = propsOf(rawText).text;
  return typeof text === 'string' ? text : undefined;
}

function handle(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('[(ngModel)] on a text-input tag', () => {
  it('carries a keystroke into the model and back onto the screen', async () => {
    mount(ROOT_TAG, NgModelHost);
    await tick();
    expect(readout()).toBe('edit me');

    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'edit mee',
      eventCount: 1,
    });
    await tick();
    await tick();

    expect(readout()).toBe('edit mee');
  });

  it('survives a keystroke on a screen whose flush re-runs every other binding', async () => {
    mount(ROOT_TAG, NgModelScreen);
    await tick();
    expect(readout()).toBe('edit me');

    fabric.fireEvent(handle('probe'), 'topChange', {
      text: 'edit mee',
      eventCount: 1,
    });
    await tick();
    await tick();

    expect(readout()).toBe('edit mee');
  });

  // The real gesture, in the real order. `registerOnTouched` writes `onBlur` as a FUNCTION PROP
  // through `Renderer2.setProperty`, which the renderer now WRAPS — so blur runs a synchronous
  // `detectChanges()` from inside the native dispatch, which it did not before 2026-09-18.
  it('survives focus, several keystrokes and blur in one gesture', async () => {
    mount(ROOT_TAG, NgModelScreen);
    await tick();

    const probe = handle('probe');
    fabric.fireEvent(probe, 'topFocus', {});
    await tick();

    let eventCount = 0;
    for (const text of ['edit mee', 'edit meee', 'edit me']) {
      eventCount += 1;
      fabric.fireEvent(probe, 'topChange', { text, eventCount });
      await tick();
      await tick();
      expect(readout()).toBe(text);
    }

    fabric.fireEvent(probe, 'topBlur', {});
    await tick();
    expect(readout()).toBe('edit me');
  });
});
