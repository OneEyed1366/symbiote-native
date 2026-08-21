// The imperative host-ref API — the seam reanimated / gesture-handler reach through. `measure`
// returns the box's real on-screen frame (only a live host can answer it); `setNativeProps`
// recolours the box bypassing Solid's reactive graph entirely; `findNodeHandle` reads the
// committed native tag. The flash holds until the next commit re-applies the declarative style,
// exactly RN's imperative-override semantics.
//
// Solid takes the ref on the public `View`, which forwards it (IViewProps.ref: Ref<IHostInstance>)
// — no hand-authored `symbiote-view` host tag, which is what Svelte's twin needs because its View
// has no bind:this escape hatch. And no shallowRef discipline either, which is Vue's concern: a
// Solid signal stores the node by identity, so the engine's WeakMap mirror still finds it.

import { createSignal, onMount } from 'solid-js';
import {
  Text,
  View,
  findNodeHandle,
  type IHostInstance,
} from '@symbiote-native/solid';
import { ActionButton } from './ActionButton';
import './RefApiDemo.css';

export function RefApiDemo() {
  const [box, setBox] = createSignal<IHostInstance | null>(null);
  const [frame, setFrame] = createSignal('tap “Measure”');
  const [tag, setTag] = createSignal<number | null>(null);
  // Imperative-only scratch flag: it drives no paint of its own, so a plain `let` is the right
  // lifetime — the body runs once.
  let flashed = false;

  // ONE MICROTASK LATE, ON PURPOSE. A tag exists only after Fabric commits, and this adapter
  // coalesces commits onto a microtask (SymbioteSurface.requestCommit). `onMount` still runs
  // inside the render tick, so reading there is a tick early and yields null; queueMicrotask from
  // inside it lands strictly after the commit that the same tick scheduled.
  onMount(() => {
    queueMicrotask(() => setTag(findNodeHandle(box())));
  });

  const onMeasure = (): void => {
    const instance = box();
    if (instance === null) return;
    instance.measure((x, y, width, height, pageX, pageY) => {
      setFrame(
        `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · page ${Math.round(pageX)},${Math.round(pageY)}`,
      );
    });
  };

  const onFlash = (): void => {
    const instance = box();
    if (instance === null) return;
    flashed = !flashed;
    instance.setNativeProps({
      style: { backgroundColor: flashed ? '#f6ad55' : '#7aa2e3' },
    });
  };

  return (
    <View class="section-nested">
      <Text class="section-label">
        Imperative ref · measure / setNativeProps / findNodeHandle
      </Text>
      <View ref={node => setBox(node)} testID="ref-box" class="ref-box">
        <Text class="ref-box-text">{`native tag ${tag() ?? '—'}`}</Text>
      </View>
      <Text testID="measure-frame" class="ref-frame-text">
        {`frame: ${frame()}`}
      </Text>
      <View class="row">
        <View class="flex1">
          <ActionButton
            testID="measure-btn"
            title="Measure"
            onPress={onMeasure}
            color="#7aa2e3"
          />
        </View>
        <View class="flex1">
          <ActionButton
            title="Flash (setNativeProps)"
            onPress={onFlash}
            color="#f6ad55"
          />
        </View>
      </View>
    </View>
  );
}
