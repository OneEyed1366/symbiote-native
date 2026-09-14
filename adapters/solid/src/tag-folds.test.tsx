// Which prop KEYS a Solid tag commits.
//
// The defect class, found on Angular 2026-08-31 and invisible to every suite: a tag inherits
// nothing a component wrapper used to do — no prop defaults, no alias renames, no bag folds.
// Angular's `text` lost `ellipsizeMode: 'tail'` and `allowFontScaling: true` (text truncated with
// no ellipsis) and `id -> nativeID` never applied, so `id` reached Fabric as an unknown key. Totals
// matched for a day and said nothing — only the KEY NAMES differed.
//
// So the expectations below are ABSOLUTE and name the value the fold PRODUCES. This file used to
// mount two arms and compare them, and both were spelled as the same tag — a comparison that
// measures nothing (`test-harness-false-greens.md` §12); an expectation restating the input would
// be the same false green one level down.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

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

describe('the folds a tag commits', () => {
  it('view — id folds to nativeID', async () => {
    const props = await committed(() => <view id="anchor" testID={TARGET} />);

    expect(props.nativeID).toBe('anchor');
    expect(Object.keys(props)).not.toContain('id');
  });

  it('view — no id leaves no nativeID key', async () => {
    const props = await committed(() => <view testID={TARGET} />);

    expect(Object.keys(props)).not.toContain('nativeID');
  });

  it('text — RN’s two defaults land unwritten', async () => {
    const props = await committed(() => <text testID={TARGET}>y</text>);

    expect(props.ellipsizeMode).toBe('tail');
    expect(props.allowFontScaling).toBe(true);
  });

  // A FOLD per key, not a default VALUE: `resolveTextProps` reads `ellipsizeMode ?? 'tail'`, so a
  // null has to resolve to the default too. Substituting only on `undefined` committed the null.
  it('text — an explicit null still resolves to the default', async () => {
    const props = await committed(() => (
      <text testID={TARGET} ellipsizeMode={null}>
        y
      </text>
    ));

    expect(props.ellipsizeMode).toBe('tail');
  });
});
