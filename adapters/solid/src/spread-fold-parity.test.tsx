// Does a lowered element with a SPREAD commit what the wrapper commits?
//
// `REFUSAL_CATEGORIES.unreadableAttributeSet` refuses a spread because a transform cannot enumerate
// a bag's keys and therefore cannot fold `id` -> `nativeID` at compile time. That reasoning is about
// the COMPILE-time fold, and this adapter also folds at RUNTIME (`renderer.ts`, `foldAliasKey` in
// `setProperty`), which sees every key whatever shape it arrived in. If the runtime fold covers it,
// the refusal protects nothing and costs lowering on a shape apps write constantly.
//
// The lowered arm is a hand-written intrinsic with a spread — exactly what the transform would emit
// if the refusal were lifted. vitest does not run the lowering plugin (`vitest.config.ts`), so an
// arm written as `<View {...bag} />` would be the wrapper twice over.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { View } from './components/view';

const fabric = installFabric();
const TARGET = 'spread-parity';
let nextRoot = 9200;

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

async function committed(
  render: () => unknown,
): Promise<Record<string, unknown>> {
  const root = (nextRoot += 1);
  mount(root, render as never);
  await flush();
  const hit = fabric.committed.map(find).find(n => n !== undefined);
  if (hit === undefined) throw new Error('nothing committed');
  const props = { ...hit.props };
  unmount(root);
  return props;
}

const BAG = { id: 'anchor', testID: TARGET, accessible: true };

describe('a spread on a lowered element', () => {
  it('commits the same payload the wrapper does', async () => {
    const lowered = await committed(() => <symbiote-view {...BAG} />);
    const component = await committed(() => <View {...BAG} />);

    expect(Object.keys(lowered).sort()).toEqual(Object.keys(component).sort());
    expect(lowered).toEqual(component);
  });

  it('folds id to nativeID through the spread, on both', async () => {
    const lowered = await committed(() => <symbiote-view {...BAG} />);
    const component = await committed(() => <View {...BAG} />);

    for (const arm of [lowered, component]) {
      expect(arm.nativeID).toBe('anchor');
      expect(Object.keys(arm)).not.toContain('id');
    }
  });
});

// The measurement above says the alias fold survives a spread — it does NOT say the spread refusal
// is dead. Lifting it was tried and compiled, and two other passes read the attribute list:
//
//   <TextInput {...bag} />  lowers to the SINGLE-line tag whatever `bag.multiline` holds — a
//                           different native view, unrepairable by any later prop write.
//   <Pressable {...bag} />  emits no `activeStyle`; the same functional style written directly
//                           does. A pressed style silently stops existing.
//
// Both are compile-time facts about the transform, so they are pinned there
// (`babel-lower-host-primitives.test.ts`) rather than here, where only the committed payload is
// visible. This note exists because a green file named "spread fold parity" reads like a licence to
// remove the refusal, and it is not one.
