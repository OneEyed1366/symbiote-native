// Does a LOWERED primitive commit the same prop KEYS as the component it replaced?
//
// The defect class, found on Angular 2026-08-31 and invisible to every suite: a lowered element
// inherits nothing the component wrapper did — no prop defaults, no alias renames, no bag folds.
// Angular's `symbiote-text` lost `ellipsizeMode: 'tail'` and `allowFontScaling: true` (text
// truncated with no ellipsis) and `id -> nativeID` never applied, so `id` reached Fabric as an
// unknown key. Totals matched for a day and said nothing — only the KEY NAMES differed.
//
// So this compares names, not counts, and it mounts both forms with identical props rather than
// asserting against a written-down expectation, which would just restate whichever path was read.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { View } from './components/view';
import { Text } from './components/text';

const fabric = installFabric();
const TARGET = 'fold-parity';
let nextRoot = 8100;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function find(node: IFakeNode): IFakeNode | undefined {
  if (node.props.testID === TARGET) return node;
  for (const child of node.children) {
    const hit = find(child);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/** The committed props of the one tagged node, after a full mount+commit. */
async function committed(
  render: () => unknown,
): Promise<Record<string, unknown>> {
  const root = (nextRoot += 1);
  mount(root, render as never);
  await flush();
  const hit = fabric.committed.map(find).find(n => n !== undefined);
  if (hit === undefined)
    throw new Error('nothing committed with the target testID');
  const props = { ...hit.props };
  unmount(root);
  return props;
}

const keysOf = (props: Record<string, unknown>): string[] =>
  Object.keys(props).sort();

describe('lowered vs component: committed prop KEYS', () => {
  it('View — id folds to nativeID on both paths', async () => {
    const lowered = await committed(() => (
      <symbiote-view id="anchor" testID={TARGET} />
    ));
    const component = await committed(() => (
      <View id="anchor" testID={TARGET} />
    ));
    expect(keysOf(lowered)).toEqual(keysOf(component));
    expect(lowered.nativeID).toBe('anchor');
    expect(lowered.id).toBeUndefined();
  });

  it('View — no id on either path leaves no nativeID key', async () => {
    const lowered = await committed(() => <symbiote-view testID={TARGET} />);
    const component = await committed(() => <View testID={TARGET} />);
    expect(keysOf(lowered)).toEqual(keysOf(component));
    expect(keysOf(lowered)).not.toContain('nativeID');
  });

  it('Text — the two defaults land on both paths', async () => {
    const lowered = await committed(() => (
      <symbiote-text testID={TARGET}>y</symbiote-text>
    ));
    const component = await committed(() => <Text testID={TARGET}>y</Text>);
    expect(keysOf(lowered)).toEqual(keysOf(component));
    expect(lowered.ellipsizeMode).toBe(component.ellipsizeMode);
    expect(lowered.allowFontScaling).toBe(component.allowFontScaling);
  });

  it('Text — an explicit null still resolves to the default on both paths', async () => {
    const lowered = await committed(() => (
      <symbiote-text testID={TARGET} ellipsizeMode={null}>
        y
      </symbiote-text>
    ));
    const component = await committed(() => (
      <Text testID={TARGET} ellipsizeMode={null}>
        y
      </Text>
    ));
    expect(lowered.ellipsizeMode).toBe(component.ellipsizeMode);
  });
});
