<script lang="ts">
  import { hostInstance } from '@symbiote-native/svelte';
  import {
    dispatchCommand,
    measure,
    setNativeProps,
    useAnimatedRef,
  } from '@symbiote-native/reanimated/svelte';
  import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
  import ActionButton from '../../components/ActionButton.svelte';
  import { ACCENT } from './colors';
  import RaSection from './RaSection.svelte';

  // Animated refs reach a view from the UI thread: measure it, write a prop to it and send it a
  // command, all without a render on the JS side
  const boxRef = useAnimatedRef();
  const fieldRef = useAnimatedRef();
  let box: unknown = $state.raw(undefined);
  let field: unknown = $state.raw(undefined);
  let measured = $state('not measured yet');

  // A tag gives back a shim element, so each animated ref is told the node under it
  $effect(() => {
    boxRef(hostInstance(box) ?? null);
  });
  $effect(() => {
    fieldRef(hostInstance(field) ?? null);
  });

  const setMeasured = (text: string) => {
    measured = text;
  };

  const onMeasure = () => {
    scheduleOnUI(() => {
      'worklet';
      const size = measure(boxRef);
      scheduleOnRN(
        setMeasured,
        size === null
          ? 'measure returned null'
          : `${Math.round(size.width)} x ${Math.round(size.height)} at ${Math.round(size.pageX)}, ${Math.round(size.pageY)}`,
      );
    });
  };

  const onWrite = () => {
    scheduleOnUI(() => {
      'worklet';
      setNativeProps(fieldRef, { text: 'written from the UI thread' });
    });
  };

  const onFocus = () => {
    scheduleOnUI(() => {
      'worklet';
      dispatchCommand(fieldRef, 'focus');
    });
  };
</script>

<RaSection
  title="Measure and refs"
  note="useAnimatedRef with measure, setNativeProps and dispatchCommand"
>
  <view bind:this={box} testID="ra-measure-box" class="ra-box" />
  <text class="ra-note">{measured}</text>
  <text-input
    bind:this={field}
    testID="ra-measure-field"
    class="ra-field"
    placeholder="a field the UI thread writes to"
  />
  <view class="ra-wrap">
    <ActionButton
      testID="ra-measure-run"
      title="measure"
      onPress={onMeasure}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-measure-write"
      title="write text"
      onPress={onWrite}
      color={ACCENT}
    />
    <ActionButton
      testID="ra-measure-focus"
      title="focus"
      onPress={onFocus}
      color={ACCENT}
    />
  </view>
</RaSection>
