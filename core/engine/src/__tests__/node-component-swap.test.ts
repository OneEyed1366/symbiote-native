// Changing which Fabric view a node commits as, WITHOUT changing the node's identity.
//
// A primitive whose native view depends on a prop — `TextInput`'s `multiline` — can have that prop
// change on an update, and no prop write moves a Fabric node between view types. Until this existed
// the choice was only made at create, so a runtime flip silently kept the view chosen first: the
// wrong native view, uncorrectable, with nothing red. That is why Solid keeps
// `dynamicIntrinsicChoice` as a refusal, and this is what lets that refusal eventually go.
//
// The identity half is the point. The engine node survives, so an app's ref, the host behavior and
// the children all stay attached while the native side is rebuilt underneath — the browser's own
// semantics for `<input type>`, where the element survives and its internal representation does not.
import { afterEach, describe, expect, it } from 'vitest';
import { installFabric } from '@symbiote-native/test-utils';
import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
  setNodeComponent,
  type ISymbioteNode,
} from '../index';

const fabric = installFabric();
let nextRootTag = 8900;

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function viewNames(): string[] {
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

afterEach(() => fabric.reset());

describe('setNodeComponent', () => {
  describe('Positive', () => {
    // why: the whole mechanism. Without the swap the committed tree keeps the view chosen at
    // create, which is the silent wrong-view outcome the refusal category exists for.
    it('re-commits the node under the new view name', () => {
      const node = createElement('RCTSinglelineTextInputView');
      const surface = mount(node);
      expect(viewNames()).toContain('RCTSinglelineTextInputView');

      setNodeComponent(node, 'RCTMultilineTextInputView');
      surface.commit();

      expect(viewNames()).toContain('RCTMultilineTextInputView');
      expect(viewNames()).not.toContain('RCTSinglelineTextInputView');
    });

    // why: THE reason this is a swap rather than a re-creation by the renderer. An app holding a
    // ref, a host behavior bound at create, and the children all reference this object — replacing
    // it would strand every one of them, and nothing would report it.
    it('keeps the engine node identity', () => {
      const node = createElement('RCTSinglelineTextInputView');
      const surface = mount(node);
      const before = node;

      setNodeComponent(node, 'RCTMultilineTextInputView');
      surface.commit();

      expect(node).toBe(before);
      expect(node.component).toBe('RCTMultilineTextInputView');
    });

    // why: props written before the swap must survive it — the new native view is created from the
    // node's current props, not from an empty payload, or a controlled input would blank on flip.
    it('carries the props across the swap', () => {
      const node = createElement('RCTSinglelineTextInputView');
      routeProp(node, 'testID', 'input');
      const surface = mount(node);

      setNodeComponent(node, 'RCTMultilineTextInputView');
      surface.commit();

      const committed = fabric.find(
        n => n.viewName === 'RCTMultilineTextInputView',
      );
      expect(committed?.props.testID).toBe('input');
    });

    // why: a swapped node is re-created, and its children's committed parent goes with it. If they
    // were not re-parented the subtree would vanish from the native tree while the JS tree still
    // holds it — the shape that reads as "the input lost its content".
    it('brings its children along', () => {
      const node = createElement('RCTView');
      const child = createElement('RCTText', true);
      routeProp(child, 'testID', 'kid');
      appendChild(node, child);
      const surface = mount(node);

      setNodeComponent(node, 'RCTScrollView');
      surface.commit();

      expect(viewNames()).toContain('RCTScrollView');
      expect(fabric.find(n => n.props.testID === 'kid')).toBeDefined();
    });
  });

  describe('Negative', () => {
    // why: a renderer calls this on EVERY update so it does not have to compare first, and this row
    // is what makes that safe. A swap that re-created on an unchanged name would turn every commit
    // on a TextInput into a full native re-creation.
    it('is a no-op when the name is unchanged', () => {
      const node = createElement('RCTSinglelineTextInputView');
      const surface = mount(node);
      const created = fabric.created.length;

      setNodeComponent(node, 'RCTSinglelineTextInputView');
      surface.commit();

      expect(fabric.created.length).toBe(created);
    });
  });
});
