// The THIRD adapter driving the real engine, and the one that decides whether a compiler step can
// live in this harness at all.
//
// Vue and React are plain JavaScript: their runtimes evaluate here as-is. Solid is not. Its JSX is
// compiled by `babel-preset-solid` into calls on a custom renderer, and `adapters/solid` ships with
// `jsx: 'preserve'` precisely so that compilation happens downstream — in an app's Metro, in
// vitest's Vite, and now in this bundle step. If this file renders, the same shape opens for Svelte
// and Angular, which also need a compiler; if it does not, ~180 adapter files have no route here
// and that is worth knowing early.
//
// The two options below the runner pins (`generate: 'universal'`, the renderer's `moduleName`) are
// the same two the app's babel preset and `vitest.config.ts` pin. A drift would compile DOM calls
// that never happen on a device.

import { createSignal, type JSX } from 'solid-js';
import {
  findNodeHandle,
  mount,
  unmount,
  type IHostInstance,
} from '@symbiote-native/solid';

import {
  committedShape,
  committedTexts,
  describe,
  expect,
  findByTestId,
  flushTimers,
  it,
  report,
} from './harness';

const ROOT_TAG = 1;

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

// `mount` hands back the surface, and committing is the caller's call — the same shape the Vue and
// React itests use, and the same one an adapter test uses, because a commit is where the engine
// hands Fabric anything at all.
function render(component: () => JSX.Element): void {
  mount(ROOT_TAG, component).commit();
}

describe('the Solid adapter on the real engine', () => {
  // why: the smallest proof that compiled Solid JSX reaches Fabric. One element, and the assertion
  // is on the tree React Native committed — not on what the renderer was asked to do.
  it('renders a host element into the committed tree', () => {
    render(() => <view testID="from-solid" />);

    expect(committedShape()).toBe('RootView(View(View()))');
    unmount(ROOT_TAG);
  });

  // why: nesting through the adapter's own reconciler, which is the path every adapter test walks.
  it('renders nested host elements in order', () => {
    render(() => (
      <view testID="outer">
        <view testID="first" />
        <view testID="second" />
      </view>
    ));

    expect(committedShape()).toBe('RootView(View(View(View()View())))');
    unmount(ROOT_TAG);
  });
});

// why: the shape an adapter test almost always has — change state, let the framework schedule, then
// read the committed tree. Solid's is fine-grained rather than scheduled, so this also checks that
// a signal write reaches Fabric without a framework tick at all.
it('re-renders on a signal change', async () => {
  const [isExpanded, setExpanded] = createSignal(false);
  render(() => (
    <view testID="container">
      <view testID="always" />
      {isExpanded() ? <view testID="sometimes" /> : null}
    </view>
  ));
  expect(committedShape()).toBe('RootView(View(View(View())))');

  setExpanded(true);
  await tick();

  expect(committedShape()).toBe('RootView(View(View(View()View())))');
  unmount(ROOT_TAG);
});

// why: `<Text>` inside `<Text>` commits as virtual text, and the rename is the COMMIT WALK's —
// `viewNameFor` threads `hasTextAncestor` down and re-creates the node when the kind flips. No
// adapter implements it and none may; Solid emits a flat text element either way. So the claim is
// only readable where a real commit happens: `componentOf` reports the name the node was CREATED
// under, which stays `RCTText` for both. The `adapters/solid` twin of these two cases moved here
// rather than being weakened into a reading of the authored name.
it('commits a nested text as virtual text, flat element and all', () => {
  render(() => (
    <text testID="outer">
      outer <text testID="inner">inner</text>
    </text>
  ));

  expect(committedShape()).toBe(
    'RootView(View(Paragraph(RawText()Text(RawText()))))',
  );
  unmount(ROOT_TAG);
});

// why: the kind is POSITION-dependent, so it has to be re-resolved when the position changes at
// runtime rather than read once at mount. A text that moves out from under a text ancestor must
// become a real paragraph.
it('flips back to a paragraph when the text ancestor goes away', async () => {
  const [isNested, setNested] = createSignal(true);
  render(() => (
    <view>
      {isNested() ? (
        <text>
          outer <text testID="probe">moving</text>
        </text>
      ) : (
        <text testID="probe">moving</text>
      )}
    </view>
  ));
  expect(committedShape()).toBe(
    'RootView(View(View(Paragraph(RawText()Text(RawText())))))',
  );

  setNested(false);
  await tick();

  expect(committedShape()).toBe('RootView(View(View(Paragraph(RawText()))))');
  unmount(ROOT_TAG);
});

// why: an interpolation that empties out must stop PAINTING, and "stop painting" is a commit rule —
// the engine keeps the raw text node with an empty string on it, and `AttributedString::append-
// Fragment` is what drops the empty fragment. So the authored tree still holds the node and only
// the committed one does not, which is why this cannot be asserted off a tree reader. The static
// shape of the same rule is `text-nesting.itest.ts`'s "skips an empty raw text"; this is the
// dynamic one, driven through a real adapter's update path.
it('stops committing a raw text whose expression empties out', async () => {
  const [name, setName] = createSignal('Ada');
  render(() => <text>{name()} — hello</text>);
  expect(committedTexts().join('|')).toBe('Ada| — hello');

  setName('');
  await tick();

  expect(committedTexts().join('|')).toBe(' — hello');
  unmount(ROOT_TAG);
});

// why: `findNodeHandle` exists to hand an interop library the NATIVE TAG of a ref'd view, and a tag
// is the one thing no stand-in can produce — headless, both sides of the comparison come out as the
// same sentinel and the assertion passes while proving nothing. So the claim lives here, where the
// number on the left comes from the adapter and the number on the right comes from the tree Fabric
// actually committed. The `adapters/solid` twin of this case keeps the half that IS readable
// without a renderer: that the ref hands back the very engine node the tree holds.
it('resolves a ref to the tag Fabric committed for that view', () => {
  const [node, setNode] = createSignal<IHostInstance | undefined>();
  // A signal setter rather than `ref={el}`: the compiler rewrites a bare `ref` binding into an
  // assignment the adapter never sees.
  render(() => (
    <text testID="ref-probe" ref={setNode}>
      hi
    </text>
  ));

  const committed = findByTestId('ref-probe');
  expect(committed !== undefined).toBe(true);
  expect(findNodeHandle(node)).toBe(committed?.tag);
  unmount(ROOT_TAG);
});

report();
