// TEMPORARY probe: enumerate the native nodes one benchmark row builds, by name.
// Not a regression test — deleted after the question it answers is answered.
import { describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 909;
const fabric = installFabric();

// Copied verbatim from examples/react/screens/BenchmarkScreen.tsx's BenchmarkRow.
function Row(): React.ReactElement {
  return (
    <view className="bench-row">
      <text className="bench-row-id">1</text>
      <pressable className="flex1" onPress={() => {}}>
        <text className="bench-row-label">label</text>
      </pressable>
      <pressable className="bench-row-remove" onPress={() => {}}>
        <text className="bench-row-remove-text">×</text>
      </pressable>
      <text-input className="bench-row-input" value="label" />
    </view>
  );
}

function census(): string[] {
  const names: string[] = [];
  const walk = (
    nodes: readonly { viewName: string; children: readonly unknown[] }[],
  ): void => {
    for (const node of nodes) {
      names.push(node.viewName);
      walk(node.children as never);
    }
  };
  walk(fabric.appRoot().children as never);
  return names;
}

describe('benchmark row census', () => {
  it('control: the harness sees a plain Text reach RCTRawText', () => {
    fabric.reset();
    mount(ROOT_TAG, <text>sentinel</text>);
    expect(census(), 'harness is live').toContain('RCTRawText');
    unmount(ROOT_TAG);
  });

  it('enumerates the row', () => {
    fabric.reset();
    mount(ROOT_TAG, <Row />);
    const names = census();
    const counts: Record<string, number> = {};
    for (const n of names) counts[n] = (counts[n] ?? 0) + 1;
    console.log('ROW CENSUS total=' + names.length);
    console.log('ROW CENSUS names=' + names.join(' '));
    console.log('ROW CENSUS counts=' + JSON.stringify(counts));
    unmount(ROOT_TAG);
    expect(names.length).toBeGreaterThan(0);
  });
});
