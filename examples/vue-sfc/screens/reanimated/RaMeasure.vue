<script setup lang="ts">
import { ref } from 'vue';
import {
  dispatchCommand,
  measure,
  setNativeProps,
  TextInput,
  useAnimatedRef,
} from '@symbiote-native/reanimated/vue';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import ActionButton from '../../components/ActionButton.vue';
import RaSection from './RaSection.vue';
import { ACCENT } from './constants';

// Animated refs reach a view from the UI thread: measure it, write a prop to it and send it a
// command, all without a render on the JS side
const boxRef = useAnimatedRef();
const fieldRef = useAnimatedRef();
const measured = ref('not measured yet');

const setMeasured = (text: string) => {
  measured.value = text;
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

<template>
  <RaSection
    title="Measure and refs"
    note="useAnimatedRef with measure, setNativeProps and dispatchCommand"
  >
    <view :ref="boxRef" testID="ra-measure-box" class="ra-box" />
    <text class="ra-note">{{ measured }}</text>
    <TextInput
      :ref="fieldRef"
      testID="ra-measure-field"
      class="ra-field"
      placeholder="a field the UI thread writes to"
    />
    <view class="ra-wrap">
      <ActionButton
        testID="ra-measure-run"
        title="measure"
        :onPress="onMeasure"
        :color="ACCENT"
      />
      <ActionButton
        testID="ra-measure-write"
        title="write text"
        :onPress="onWrite"
        :color="ACCENT"
      />
      <ActionButton
        testID="ra-measure-focus"
        title="focus"
        :onPress="onFocus"
        :color="ACCENT"
      />
    </view>
  </RaSection>
</template>
