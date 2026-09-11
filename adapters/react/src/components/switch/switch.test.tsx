// Proves the Switch primitive: the Fabric view name `Switch`, the
// `value` prop as a strict boolean, the trackColor/thumbColor/ios_backgroundColor ->
// native prop mapping, onValueChange's derivation from nativeEvent.value (one argument, the
// event, with `value` carried as a field — not a second `(value, event)` argument, which
// crashes Svelte's `target_handler` on an individual attribute), and the controlled snap-back: a
// rejected toggle commands the JS value back down via
// a `setValue` view command. No simulator: a failure here is in JS, not native.
//
// SCOPE: there is no component any more — `<switch>` is a bare tag and the whole machine lives in
// the engine (`core/components/src/behaviors/switch.ts`, wired by `../../register`). The suite
// passes unchanged apart from the spelling, which is the evidence that made deleting the wrapper
// safe: it was testing the controlled-toggle CONTRACT, never the wrapper's hook.
//
// No Negative group: nothing here rejects an input.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface ICommandCall {
  target: string | undefined;
  name: string;
  args: readonly unknown[];
}

// A FRESH ROOT TAG AND A FRESH testID PER CASE, and both are load-bearing now that the machine
// lives on the engine node rather than inside a React component.
//
// `afterCommit` is driven from a process-wide set of committed nodes, so EVERY commit re-evaluates
// EVERY live switch — including one a previous case left holding an unresolved disagreement
// (`lastNativeReport: true` against `value: false`), which `fabric.reset()` leaves reachable
// because it wipes the fake slot without telling the engine. That case's snap-back then lands
// inside the NEXT case, after its own `commands.length = 0`. Measured: three rows failed and the
// row that caused it passed — the misattribution is the whole hazard, so the recorder keeps each
// command's TARGET and every assertion filters by the id it just mounted. A component wrapper hid
// all of this by taking its machine down with the React tree.
let currentRootTag = 190;
let probeId = 'switch-0';
const SWITCH_VIEW = 'Switch';

const commands: ICommandCall[] = [];

// The snap-back cases assert the `setValue` command, so graft a recording `dispatchCommand` onto
// the live slot before any mount (the engine destructures it off the global on its first commit).
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (node, name, args) => {
  const target = node.props.testID;
  commands.push({
    target: typeof target === 'string' ? target : undefined,
    name,
    args,
  });
};

// Commands sent to the node THIS case mounted, and nothing else.
function commandsForProbe(): ICommandCall[] {
  return commands.filter(command => command.target === probeId);
}

// The snap-back check is DEFERRED by the behavior, deliberately — an accepted toggle updates the
// app's state, and that state reaches `node.props.value` only after the app's own reconciliation,
// which runs strictly after `onChange` returns (`behaviors/switch.ts` header). The wrapper this
// replaced ran the check in a synchronous `useLayoutEffect`, so every case that fires a change must
// now let the queue turn before reading `commands`, or it reads before the decision was made.
const settleSnapBack = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function mountFresh(element: ReactElement): void {
  currentRootTag += 1;
  mount(currentRootTag, element);
}

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (!node) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

let caseCount = 0;
beforeEach(() => {
  fabric.reset();
  commands.length = 0;
  caseCount += 1;
  probeId = `switch-${String(caseCount)}`;
});
afterEach(() => unmount(currentRootTag));

describe('React <switch> on the engine', () => {
  // why: RN's real Switch view name is `Switch` — a wrong native view name means the host
  // simply never resolves a component, which no JS-level check would otherwise catch.
  it('emits the Fabric view name Switch and passes value through as a strict boolean', () => {
    mountFresh(<switch value />);
    expect(switchNode().props.value).toBe(true);
  });

  // why: RN sends `value === true` to the native side (Switch.js) — an absent `value` prop must
  // fold to a real `false`, not ride through as `undefined`, which native would reject/misread.
  it('folds an undefined value to a strict false', () => {
    mountFresh(<switch />);
    expect(switchNode().props.value).toBe(false);
  });

  // why: trackColor/thumbColor/ios_backgroundColor are RN's public prop names, but native reads
  // them under different keys (onTintColor/tintColor/thumbTintColor/backgroundColor) — using the
  // public names on the wire would just silently not paint on device.
  it('maps color + disabled props to the native iOS prop names', () => {
    mountFresh(
      <switch
        value
        disabled
        trackColor={{ false: '#767577', true: '#81b0ff' }}
        thumbColor="#f5dd4b"
        ios_backgroundColor="#3e3e3e"
      />,
    );
    const props = switchNode().props;
    expect(props.onTintColor).toBe('#81b0ff');
    expect(props.tintColor).toBe('#767577');
    expect(props.thumbTintColor).toBe('#f5dd4b');
    expect(props.disabled).toBe(true);
    // ios_backgroundColor folds into the style, which the commit engine flattens onto the
    // node, so backgroundColor lands as a top-level committed prop.
    expect(props.backgroundColor).toBe('#3e3e3e');
  });

  // why: onValueChange hands the caller ONE event, with the derived boolean carried as `.value`
  // on it — a consumer that reads `event.nativeEvent.value` (RN's own event shape) must still work.
  it('derives onValueChange with both the value and the raw event from nativeEvent.value', async () => {
    let changedValue: boolean | undefined;
    let rawEventValue: unknown;
    mountFresh(
      <switch
        value={false}
        onValueChange={event => {
          changedValue = event.value;
          rawEventValue = event.nativeEvent.value;
        }}
      />,
    );
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settleSnapBack();
    expect(changedValue).toBe(true);
    expect(rawEventValue).toBe(true);
  });

  // why: valueFromChange narrows nativeEvent.value to a strict boolean — a malformed change
  // payload (not a boolean) must be silently ignored (no callback, no reducer dispatch), never
  // crash or forward garbage to the caller as if it were a real toggle.
  it('ignores a change event whose nativeEvent.value is not a boolean', async () => {
    let calls = 0;
    mountFresh(
      <switch
        testID={probeId}
        value={false}
        onValueChange={() => {
          calls++;
        }}
      />,
    );
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', {
      value: 'not-a-boolean',
    });
    await settleSnapBack();
    expect(calls).toBe(0);
    // and no snap-back command either — the reducer never saw a report to disagree with.
    expect(commandsForProbe()).toEqual([]);
  });

  // why: shouldSnapBack only fires once native has actually reported a value (lastNativeReport
  // !== null) — the behavior's own `afterCommit` run at mount must not misread the pre-report
  // `null` state as a disagreement and issue a spurious snap-back before any real toggle happened.
  it('issues no snap-back command on initial mount, before any native report', async () => {
    mountFresh(<switch testID={probeId} value onValueChange={() => {}} />);
    await settleSnapBack();
    expect(commandsForProbe()).toEqual([]);
  });

  // why: native flips its own visual grip optimistically before JS approves — if the parent's
  // onValueChange is a no-op, the `value` prop never changes, so a plain prop re-push can't
  // correct native; the ONLY way to un-stick it is the imperative setValue command.
  it('snaps native back via a setValue command when a no-op handler rejects the toggle', async () => {
    function Stuck(): ReactElement {
      // value is pinned false; the handler deliberately ignores the new value.
      const [value] = useState(false);
      return <switch testID={probeId} value={value} onValueChange={() => {}} />;
    }
    mountFresh(<Stuck />);
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settleSnapBack();

    const setValue = commandsForProbe().find(c => c.name === 'setValue');
    expect(
      setValue,
      'a setValue command after a rejected toggle',
    ).toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });

  // why: the counterpart to the case above — when the parent DOES accept the toggle (value
  // catches up with native's report), the effect must recognize agreement and stay silent; an
  // always-fire snap-back would fight every legitimate toggle right after it succeeds.
  it('issues no snap-back command when the parent accepts the toggle', async () => {
    function Accepting(): ReactElement {
      const [value, setValue] = useState(false);
      return (
        <switch
          testID={probeId}
          value={value}
          onValueChange={event => setValue(event.value)}
        />
      );
    }
    mountFresh(<Accepting />);
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settleSnapBack();

    expect(commandsForProbe()).toEqual([]);
  });
});
