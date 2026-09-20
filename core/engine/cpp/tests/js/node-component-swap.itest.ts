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
//
// **The swap is driven View -> ScrollView, not Singleline -> Multiline, and that is a property of
// this harness rather than of the rule.** A descriptor for either `TextInputView` needs React
// Native's codegen output (`FBReactNativeSpec/EventEmitters.h`), which only exists once codegen has
// run for an app, so the six registered here are the whole vocabulary. An unregistered name does
// not fail — it falls back to a plain View — so naming one would have produced a wrong shape rather
// than an error. The mechanism under test does not read the name, only whether it changed.

import {
  appendChild,
  createElement,
  createSurface,
  routeProp,
  setNodeComponent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  committedShape,
  describe,
  expect,
  findAllCommitted,
  findCommitted,
  it,
  report,
} from './harness';

function mount(node: ISymbioteNode) {
  const surface = createSurface(1);
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function viewNames(): string[] {
  return findAllCommitted(() => true).map(node => node.viewName);
}

describe('setNodeComponent', () => {
  describe('Positive', () => {
    // why: the whole mechanism. Without the swap the committed tree keeps the view chosen at
    // create, which is the silent wrong-view outcome the refusal category exists for.
    it('re-commits the node under the new view name', () => {
      const node = createElement('RCTView');
      routeProp(node, 'testID', 'swapped');
      const surface = mount(node);
      expect(viewNames()).toContain('View');

      setNodeComponent(node, 'RCTScrollView');
      surface.commit();

      expect(viewNames()).toContain('ScrollView');
      expect(committedShape()).toBe('RootView(View(ScrollView()))');
    });

    // why: THE reason this is a swap rather than a re-creation by the renderer. An app holding a
    // ref, a host behavior bound at create, and the children all reference this object — replacing
    // it would strand every one of them, and nothing would report it.
    it('keeps the engine node identity', () => {
      const node = createElement('RCTView');
      const surface = mount(node);
      const before = node;

      setNodeComponent(node, 'RCTScrollView');
      surface.commit();

      expect(node).toBe(before);
      expect(node.component).toBe('RCTScrollView');
    });

    // why: props written before the swap must survive it — the new native view is created from the
    // node's current props, not from an empty payload, or a controlled input would blank on flip.
    it('carries the props across the swap', () => {
      const node = createElement('RCTView');
      routeProp(node, 'testID', 'input');
      const surface = mount(node);

      setNodeComponent(node, 'RCTScrollView');
      surface.commit();

      const committed = findCommitted(one => one.viewName === 'ScrollView');
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

      expect(viewNames()).toContain('ScrollView');
      expect(findCommitted(one => one.props.testID === 'kid')).toBeDefined();
    });
  });

  describe('Negative', () => {
    // why: a renderer calls this on EVERY update so it does not have to compare first, and this row
    // is what makes that safe. A swap that re-created on an unchanged name would turn every commit
    // on a TextInput into a full native re-creation.
    //
    // Asserted on the TAG rather than on a creation count: the tag is minted when the node is
    // created, so a node that kept its tag across a commit is a node the renderer did not rebuild.
    // That is a stronger statement than a counter, and it comes from the renderer.
    it('is a no-op when the name is unchanged', () => {
      const node = createElement('RCTView');
      routeProp(node, 'testID', 'stable');
      const surface = mount(node);
      const tagBefore = findCommitted(
        one => one.props.testID === 'stable',
      )?.tag;
      // Or the comparison below is two undefineds agreeing, which passes for a node that vanished.
      expect(tagBefore).toBeDefined();

      setNodeComponent(node, 'RCTView');
      surface.commit();

      expect(findCommitted(one => one.props.testID === 'stable')?.tag).toBe(
        tagBefore,
      );
    });
  });
});

report();
