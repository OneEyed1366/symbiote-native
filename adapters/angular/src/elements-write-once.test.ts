// A STATIC ATTRIBUTE ON A TAG A DIRECTIVE MATCHES MUST REACH THE ENGINE ONCE.
//
// Found by building the directive-shaped bench arm (`core/engine/cpp/tests/js/
// angular-elements-suite.itest.ts`), which is the first Angular measurement in this repository to
// use the shape `examples/angular` actually runs. Its create reports `unchanged=3000` on a 1 000-row
// list where the bare-tag arm reports 0 — three per row, one per `<text ellipsizeMode="tail">`.
//
// `writesOfUnchanged` counts `setProp` ops that are dropped in the HOST, after the JSI conversion,
// because the node already held that value. So the crossing was paid and the conversion was done for
// nothing: 30% of that arm's prop writes.
//
// The mechanism is Angular's, and it is not a bug there. `ellipsizeMode` is a declared `@Input` of
// `TextElement` AND a static attribute in the template, so Ivy both writes the attribute onto the
// element and sets the directive input from it. In a browser those are two different things — an
// attribute and a property. Here they are the same prop, written twice.
//
// This file pins the COUNT and names the methods, because "which two calls" is the part a count
// alone cannot say and the part a fix has to aim at.

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { setTreeHost, treeHost } from '@symbiote-native/engine';
import {
  OP_SET_PROP,
  OP_STRIDE,
} from '@symbiote-native/engine/mutation-buffer';

import { mount, unmount } from './render';
import { SYMBIOTE_ELEMENTS } from './elements';
import { SymbioteRenderer } from './renderer';

const ROOT_TAG = 941;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let writes: { key: string; value: unknown }[] = [];
let probeNode: object | undefined;

// Installed ONCE — wrapping inside a case wraps the wrapper the last one left standing.
{
  const base = treeHost();
  if (base === undefined) throw new Error('no host installed');
  setTreeHost({
    ...base,
    applyOps: batch => {
      for (let at = 0; at + OP_STRIDE <= batch.ops.length; at += OP_STRIDE) {
        if (batch.ops[at] !== OP_SET_PROP) continue;
        const node = batch.handles[batch.ops[at + 1]];
        const key = batch.strings[batch.ops[at + 2]] ?? '?';
        const value = batch.values[batch.ops[at + 3]];
        if (key === 'testID' && value === 'probe') probeNode = node;
        if (node !== undefined) writes.push({ key, value });
      }
      base.applyOps(batch);
    },
  });
}

/** Every value written for `key`, on any node — the probe tree holds exactly one `<text>`. */
function writesOf(key: string): unknown[] {
  return writes.filter(one => one.key === key).map(one => one.value);
}

// Which RENDERER call carried each write. The count says there are two; only this says which two,
// and a fix has to aim at one of them. `setAttribute` and `setProperty` are the only two paths a
// prop can take, and Ivy uses a different one for a static attribute than for a directive input.
let callers: string[] = [];

function watchCallers(): () => void {
  const prototype: Record<string, unknown> = SymbioteRenderer.prototype;
  const originals = new Map<string, Function>(); // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  for (const name of ['setAttribute', 'setProperty']) {
    const original: unknown = prototype[name];
    if (typeof original !== 'function') continue;
    originals.set(name, original);
    prototype[name] = function watched(this: unknown, ...args: unknown[]) {
      if (args[1] === 'ellipsizeMode') callers.push(name);
      return Reflect.apply(original, this, args);
    };
  }
  return (): void => {
    for (const [name, original] of originals) prototype[name] = original;
  };
}

@Component({
  selector: 'write-once-host',
  standalone: true,
  imports: [SYMBIOTE_ELEMENTS],
  template: `<text testID="probe" ellipsizeMode="tail">hello</text>`,
})
class WriteOnceHost {}

beforeEach(() => {
  fabric.reset();
  writes = [];
  callers = [];
  probeNode = undefined;
});
afterEach(() => unmount(ROOT_TAG));

describe('a static attribute on a directive-matched tag', () => {
  // why: IT REACHED THE ENGINE TWICE UNTIL 2026-09-18, and this case pinned that as characterization
  // while saying in its own text that "the second one going away" would change the line. It went
  // away, so the line changed, and the rest of this comment is kept because it is the record of what
  // the second path WAS.
  //
  // Ivy's `setUpAttributes` writes every static attribute unconditionally, and `setInputsFromAttrs`
  // separately set the directive input the same attribute fed — correct in a browser, where an
  // attribute and a property are two different things, and a double write here, where they are one
  // prop. It read `unchanged=3000` on the directive bench arm's create against 0 on the bare one,
  // about 30% of that arm's prop writes, and the note concluded that neither write could be dropped
  // from the outside without a props MIRROR in JS.
  //
  // WHAT ACTUALLY DROPPED IT was not a mirror and was not aimed at this at all: `./runtime-matching`
  // withholds the tag directives from Angular's matcher, so no input claims the name and the input
  // path simply does not exist. A second, unpriced consequence of that change, found by this test.
  //
  // The COUNT is still what is watched — a path reappearing changes this line as surely as one
  // leaving did.
  it('reaches the engine once, by the attribute path alone', async () => {
    const restore = watchCallers();
    mount(ROOT_TAG, WriteOnceHost);
    await tick();
    restore();

    expect(writesOf('ellipsizeMode')).toEqual(['tail']);
    expect(callers, 'the attribute path, and no input path behind it').toEqual([
      'setAttribute',
    ]);
  });

  // why: THE TWO-SIDED HALF. A renderer that dropped the write entirely would satisfy a count of
  // one just as well as a count of zero would satisfy "fewer" — so the committed node has to carry
  // it. The node is located by the write the test itself watched, which is what `probeNode` is for.
  it('still commits the value it was given', async () => {
    mount(ROOT_TAG, WriteOnceHost);
    await tick();

    expect(probeNode, 'the probe node committed').toBeDefined();
    expect(
      fabric.find(one => one.handle === probeNode)?.props.ellipsizeMode,
    ).toBe('tail');
  });
});
