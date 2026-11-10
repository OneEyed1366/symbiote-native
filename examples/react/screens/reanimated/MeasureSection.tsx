import { useState } from 'react';
import Animated, {
  dispatchCommand,
  measure,
  setNativeProps,
  TextInput,
  useAnimatedRef,
} from '@symbiote-native/reanimated/react';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const RUN_COLOR = '#4ea1ff';

// Animated refs reach a view from the UI thread: measure it, write a prop to it and send it a
// command, all without a render on the JS side
export function MeasureSection() {
  const boxRef = useAnimatedRef();
  const fieldRef = useAnimatedRef();
  const [measured, setMeasured] = useState('not measured yet');

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

  return (
    <Section
      title="Measure and refs"
      note="useAnimatedRef with measure, setNativeProps and dispatchCommand"
    >
      <Animated.View ref={boxRef} testID="ra-measure-box" className="ra-box" />
      <text className="ra-note">{measured}</text>
      <TextInput
        ref={fieldRef}
        testID="ra-measure-field"
        className="ra-field"
        placeholder="a field the UI thread writes to"
      />
      <view className="ra-wrap">
        <ActionButton
          testID="ra-measure-run"
          title="measure"
          onPress={onMeasure}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-measure-write"
          title="write text"
          onPress={onWrite}
          color={RUN_COLOR}
        />
        <ActionButton
          testID="ra-measure-focus"
          title="focus"
          onPress={onFocus}
          color={RUN_COLOR}
        />
      </view>
    </Section>
  );
}
