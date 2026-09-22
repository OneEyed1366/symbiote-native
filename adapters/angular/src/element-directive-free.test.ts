// An intrinsic tag is a plain element at run time, the way `<div>` is in a browser.
//
// `SYMBIOTE_ELEMENTS` exists so ngtsc type-checks `<text-input [value]>`; at run time each matched
// directive is an instance per element — ~8 us for `text-input`, ~1.4 us for the thinnest style claim
// on the Hermes -O bench. None is left:
//
//   read-back tags   the synchronous flush finds the node's view when an event fires
//                    (`change-detection-flush.ts`), instead of a directive injecting one per element
//   [style]/[class]  go through Angular's own styling engine to `setStyle`/`addClass`, as on a DOM
//                    element; an RN style ARRAY or press-state FUNCTION is `[styleProp]`, an ordinary
//                    property binding the renderer routes to `style`
//
// The flush stays covered in `change-detection-flush.test.ts`, styling in `bare-intrinsic-tag.test.ts`
// and `__tests__/reactive-style-grid.test.ts`: this file pins only that no instance is built.
//
// No Negative group: nothing here throws.
import '@angular/compiler';
import {
  Component,
  ElementRef,
  ViewChild,
  ɵgetDirectives as getDirectives,
  ɵgetLContext as getLContext,
} from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';

import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 91_150;
installRecordingFabric();
// `getDirectives` opens with `node instanceof Text` to skip DOM text nodes; there is no DOM here.
if (!('Text' in globalThis)) Reflect.set(globalThis, 'Text', class {});
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let fixture: DirectiveFreeFixture | undefined;

// Each tag at the TEMPLATE ROOT: Angular patches a root element with its view, so discovery answers
// for it whether or not a directive matched. A nested element answers only as a directive host,
// which would make "no directives" indistinguishable from "not found".
@Component({
  selector: 'directive-free-fixture',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `
    <text-input #input [(value)]="text" [style]="box"></text-input>
    <text-input-multiline #multiline [(value)]="text"></text-input-multiline>
    <switch #toggle [(value)]="on"></switch>
    <refresh-control #refresh [refreshing]="refreshing"></refresh-control>
    <view #view [style]="box" [class]="classes"></view>
    <text #text [style]="box">label</text>
    <pressable #pressable [styleProp]="[box, { opacity: 0.5 }]"></pressable>
  `,
})
class DirectiveFreeFixture {
  text = '';
  on = false;
  refreshing = false;
  box = { width: 10, height: 10 };
  classes = 'a b';

  @ViewChild('input', { read: ElementRef }) input?: ElementRef<unknown>;
  @ViewChild('multiline', { read: ElementRef })
  multiline?: ElementRef<unknown>;
  @ViewChild('toggle', { read: ElementRef }) toggle?: ElementRef<unknown>;
  @ViewChild('refresh', { read: ElementRef }) refresh?: ElementRef<unknown>;
  @ViewChild('view', { read: ElementRef }) view?: ElementRef<unknown>;
  @ViewChild('text', { read: ElementRef }) text2?: ElementRef<unknown>;
  @ViewChild('pressable', { read: ElementRef })
  pressable?: ElementRef<unknown>;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    fixture = this;
  }
}

afterEach(() => unmount(ROOT_TAG));

describe('an intrinsic tag at run time', () => {
  // why: a thousand-row list paid a directive instance per element for a type check that already
  // happened at compile time; a tag must cost what a bare element costs.
  it.each([
    'input',
    'multiline',
    'toggle',
    'refresh',
    'view',
    'text2',
    'pressable',
  ] as const)('%s carries no directive instance', async name => {
    fixture = undefined;
    mount(ROOT_TAG, DirectiveFreeFixture);
    await tick();

    const ref = fixture?.[name];
    if (ref === undefined) throw new Error(`#${name} never resolved`);
    // The control: an element discovery cannot find ALSO reads as no directives.
    expect(getLContext(ref.nativeElement)).not.toBeNull();
    expect(getDirectives(ref.nativeElement)).toEqual([]);
  });
});
