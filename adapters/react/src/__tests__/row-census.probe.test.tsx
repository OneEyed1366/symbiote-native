// TEMPORARY probe: enumerate the native nodes one benchmark row builds, by name.
// Not a regression test — deleted after the question it answers is answered.
import { describe, expect, it } from 'vitest';
import {
  Pressable,
  Text,
  TextInput,
  View,
  mount,
  unmount,
} from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 909;
const fabric = installFabric();

// Copied verbatim from examples/react/screens/BenchmarkScreen.tsx's BenchmarkRow.
function Row(): React.ReactElement {
  return (
    <View className="bench-row">
      <Text className="bench-row-id">1</Text>
      <Pressable className="flex1" onPress={() => {}}>
        <Text className="bench-row-label">label</Text>
      </Pressable>
      <Pressable className="bench-row-remove" onPress={() => {}}>
        <Text className="bench-row-remove-text">×</Text>
      </Pressable>
      <TextInput className="bench-row-input" value="label" />
    </View>
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
    mount(ROOT_TAG, <Text>sentinel</Text>);
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
