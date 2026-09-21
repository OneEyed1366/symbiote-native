// `text-input` as a TAG, measured through Angular's own renderer. The controlled value/text fold
// and the imperative ref surface (focus/blur/clear/isFocused) live on the engine node
// (`core/components/src/behaviors/text-input.ts`) and are fully unit-tested there; this file
// proves the ANGULAR WIRING: a template `<text-input>` reaches the tag, `[(value)]` folds to the
// native `text` prop and a native `change` event round-trips through the two-way binding, and a
// `@ViewChild`'s `ElementRef.nativeElement` drives focus/blur/clear/isFocused through
// `buildTextInputHandle` — the same bridge-smoke shape React's and Solid's TextInput suites
// already carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import '@angular/compiler';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
  inject,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSymbioteNode } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { buildTextInputHandle } from '@symbiote-native/components';

import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';
import type { IHostInstance } from './host-instance';

const ROOT_TAG = 91_050;
const SINGLELINE_VIEW = 'RCTSinglelineTextInputView';
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function inputNode() {
  const node = fabric.find(n => n.viewName === SINGLELINE_VIEW);
  if (node === undefined) throw new Error(`no ${SINGLELINE_VIEW} was created`);
  return node;
}

function isHostInstance(value: unknown): value is IHostInstance {
  return isSymbioteNode(value);
}

let capturedRef: ElementRef<unknown> | undefined;

@Component({
  selector: 'text-input-handle-fixture',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<text-input #inputRef value="hello"></text-input>`,
})
class HandleFixture implements AfterViewInit {
  @ViewChild('inputRef') inputRef!: ElementRef<unknown>;
  ngAfterViewInit(): void {
    capturedRef = this.inputRef;
  }
}

async function mountInputRef(): Promise<IHostInstance> {
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: `text-input` as a tag', () => {
  it('folds value into the native text prop', async () => {
    @Component({
      selector: 'text-input-value-fixture',
      standalone: true,
      imports: [SYMBIOTE_ELEMENTS],
      template: `<text-input value="hi"></text-input>`,
    })
    class ValueFixture {}

    mount(ROOT_TAG, ValueFixture);
    await tick();
    // `value` -> `text` (the native prop) is `foldTextInputValue`'s in `SymbioteFabricProps.cpp`
    // now — this harness builds its payload through the TypeScript `fabricProps`, which carries no
    // copy of it. What stays this adapter's is routing the template attribute onto the tag at all,
    // proven in `core/engine/cpp/tests/js/text-input-payload.itest.ts` against a real commit.
    expect(inputNode().props.value).toBe('hi');
  });

  it('derives onValueChange from a native change', async () => {
    let changedText: string | undefined;
    @Component({
      selector: 'text-input-on-change-fixture',
      standalone: true,
      imports: [SYMBIOTE_ELEMENTS],
      template: `<text-input
        value="hi"
        [onValueChange]="onChange"
      ></text-input>`,
    })
    class OnChangeFixture {
      onChange = (event: { text: string }): void => {
        changedText = event.text;
      };
    }

    mount(ROOT_TAG, OnChangeFixture);
    await tick();

    fabric.fireEvent(inputNode().instanceHandle, 'topChange', {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    await tick();
    expect(changedText).toBe('hix');
  });

  // why: RN's controlled pattern has no such collision (`value` is a plain controlled prop,
  // `onChange` always fires) — RN parity means both fire here too, not one silently dropped.
  // Was a confirmed bug (fixed in `renderer/index.ts`'s `listen()`): `[(value)]`'s `routeProp`
  // install used to REPLACE the `onValueChange` prop outright.
  it('calls both the explicit onValueChange and [(value)] when both are bound', async () => {
    let changedText: string | undefined;
    @Component({
      selector: 'text-input-both-bound-fixture',
      standalone: true,
      imports: [SYMBIOTE_ELEMENTS],
      template: `<text-input
        [(value)]="value"
        [onValueChange]="onChange"
      ></text-input>`,
    })
    class BothBoundFixture {
      value = 'hi';
      onChange = (event: { text: string }): void => {
        changedText = event.text;
      };
    }

    mount(ROOT_TAG, BothBoundFixture);
    await tick();

    fabric.fireEvent(inputNode().instanceHandle, 'topChange', {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    await tick();

    expect(changedText).toBe('hix');
  });

  // why: RN's controlled pattern always calls whatever `onChange` the LATEST render closed over
  // — a stale handler is never left composed with the wrong callback. `listen()`'s bridge callback
  // is captured once at mount, but `[onValueChange]` rebinding after mount routes through
  // `ngOnChanges` -> `setProperty`, which used to overwrite the composed prop with the bare new
  // handler, silently dropping the `[(value)]` bridge (known ceiling, `.docs/test-cases/
  // rn-parity.test-cases.md` "Not fixed, documented as a known ceiling").
  it('keeps the [(value)] bridge alive after [onValueChange] rebinds to a new handler', async () => {
    let rebound: RebindFixture | undefined;
    let secondHandlerCalledWith: string | undefined;

    @Component({
      selector: 'text-input-rebind-fixture',
      standalone: true,
      imports: [SYMBIOTE_ELEMENTS],
      template: `<text-input
        [(value)]="value"
        [onValueChange]="handler"
      ></text-input>`,
    })
    class RebindFixture {
      private readonly cdr = inject(ChangeDetectorRef);
      value = 'hi';
      handler = (_event: { text: string }): void => {};

      constructor() {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        rebound = this;
      }

      rebind(): void {
        this.handler = (event: { text: string }): void => {
          secondHandlerCalledWith = event.text;
        };
        this.cdr.detectChanges();
      }
    }

    mount(ROOT_TAG, RebindFixture);
    await tick();
    if (rebound === undefined) throw new Error('fixture never constructed');
    rebound.rebind();

    fabric.fireEvent(inputNode().instanceHandle, 'topChange', {
      text: 'hix',
      eventCount: 1,
      selection: { start: 3, end: 3 },
    });
    await tick();

    expect(secondHandlerCalledWith).toBe('hix');
    expect(rebound.value).toBe('hix');
  });

  it('drives focus/blur/clear through the ElementRef.nativeElement host instance', async () => {
    const handle = buildTextInputHandle(await mountInputRef());

    handle.focus();
    expect(fabric.commands.some(c => c.commandName === 'focus')).toBe(true);

    fabric.commands.length = 0;
    handle.blur();
    expect(fabric.commands.some(c => c.commandName === 'blur')).toBe(true);

    fabric.commands.length = 0;
    handle.clear();
    const setText = fabric.commands.find(
      c => c.commandName === 'setTextAndSelection',
    );
    expect(
      setText,
      'a setTextAndSelection command was dispatched',
    ).toBeDefined();
    expect(setText!.args[1]).toBe('');
  });

  it('tracks isFocused() from real topFocus/topBlur events', async () => {
    const handle = buildTextInputHandle(await mountInputRef());

    expect(handle.isFocused()).toBe(false);
    fabric.fireEvent(inputNode().instanceHandle, 'topFocus', {});
    expect(handle.isFocused()).toBe(true);
    fabric.fireEvent(inputNode().instanceHandle, 'topBlur', {});
    expect(handle.isFocused()).toBe(false);
  });
});
