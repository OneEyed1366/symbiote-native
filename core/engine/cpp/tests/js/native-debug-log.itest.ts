// The C++ half can say something without crashing — which until 2026-09-18 it could not.
//
// THE GAP THIS CLOSES. The commit path, the payload builder and every tag rule live in C++ now, and
// the only channel out of that translation unit was `throw jsi::JSError`. So a rule could CRASH or
// stay SILENT and nothing in between, while `<keep_logs_gate_behind_DEBUG>` asks new code with
// non-trivial runtime behavior to log at its seam as a matter of course. That rule was
// unsatisfiable on this side of the wire, and it stopped being academic when the first rule wanting
// a developer WARNING rather than a crash (ScrollView's ignored `horizontal`) came up for porting:
// moving it as written would have DELETED a diagnostic, which the same rule forbids.
//
// WHY THE LINES ARE RETAINED and not merely written to stderr: a diagnostic nobody can assert on is
// one that rots. Retention is what makes "the engine warned about that" a test rather than a human
// noticing a line scroll past — and it costs nothing when the switch is off, because nothing is
// called at all.
//
// THE MACRO IS THE CONTRACT, not the function. `SYMBIOTE_DLOG` tests the flag BEFORE evaluating its
// argument, so building a message costs nothing with logging off. C++ has exactly the trap
// `debug.ts`'s header describes for JS — an argument is evaluated at the call site — and the macro
// makes the cheap thing the default instead of a rule every call site has to remember.

import { registerScrollViewBehavior } from '@symbiote-native/components';

import {
  createElement,
  createSurface,
  setNativeDebug,
  setProp,
  takeNativeDebugLog,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerScrollViewBehavior();

/** Commit one node and hand back whatever the C++ side logged while doing it. */
function commitAndDrain(
  tag: string,
  props: Record<string, unknown>,
): readonly string[] {
  takeNativeDebugLog();
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTScrollView', false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  return takeNativeDebugLog();
}

const linesMentioning = (
  lines: readonly string[],
  needle: string,
): readonly string[] => lines.filter(line => line.includes(needle));

describe('the engine can warn without crashing', () => {
  // why: OFF IS THE DEFAULT and it is the half that matters in production — an engine that logged
  // unconditionally would write a line per node per commit on every app that ships.
  it('says nothing at all with the switch off', () => {
    setNativeDebug(false);

    expect(commitAndDrain('scroll-view', { horizontal: true }).length).toBe(0);
  });

  // why: the first real caller. `horizontal` on the vertical tag is IGNORED — the axis comes from
  // the tag, because a scroller whose axis disagreed with its content node's row style is a shape RN
  // cannot produce. Ignoring a prop silently is the failure this warning exists to prevent: the app
  // author sees a vertical list, writes `horizontal`, and nothing happens with nothing said.
  it('warns when a prop it must ignore was written anyway', () => {
    setNativeDebug(true);
    const lines = commitAndDrain('scroll-view', { horizontal: true });
    print(`DEBUG native log: ${lines.join(' | ')}`);

    const warned = linesMentioning(lines, 'horizontal');
    expect(warned.length).toBe(1);
    // The message has to name the FIX, not just the fault — a warning that says "ignored" and stops
    // leaves the author exactly as stuck as silence did.
    expect(warned[0]?.includes('horizontal-scroll-view')).toBe(true);
  });

  // why: the agreeing case must stay quiet, or the warning becomes noise on every horizontal list
  // and gets tuned out — which is the same as not having it.
  it('stays quiet when the prop agrees with the tag', () => {
    setNativeDebug(true);

    expect(
      linesMentioning(
        commitAndDrain('horizontal-scroll-view', { horizontal: true }),
        'horizontal=',
      ).length,
    ).toBe(0);
  });

  // why: and quiet when the app writes nothing, which is nearly every ScrollView ever rendered.
  it('stays quiet when the prop is absent', () => {
    setNativeDebug(true);

    expect(commitAndDrain('scroll-view', {}).length).toBe(0);
  });

  // why: the drain is a DRAIN — a second read must not re-report what the first already returned,
  // or a test that asserts a count becomes order-dependent on every test before it.
  it('hands each line out once', () => {
    setNativeDebug(true);
    commitAndDrain('scroll-view', { horizontal: true });

    expect(takeNativeDebugLog().length).toBe(0);
  });
});

report();
