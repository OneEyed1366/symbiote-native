import { Component, PureComponent, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type IRenderCounterProps = { value: number };

let regularRenders = 0;
class RegularChild extends Component<IRenderCounterProps> {
  render() {
    regularRenders += 1;
    return (
      <Text testID="pure-regular-renders" className="info-text">
        {`Component (no shouldComponentUpdate): rendered ${regularRenders} time(s)`}
      </Text>
    );
  }
}

let pureRenders = 0;
// PureComponent: implements shouldComponentUpdate with a shallow props/state comparison for
// you — re-rendering the parent with the SAME `value` skips this child entirely.
class PureChild extends PureComponent<IRenderCounterProps> {
  render() {
    pureRenders += 1;
    return (
      <Text testID="pure-pure-renders" className="info-text">
        {`PureComponent: rendered ${pureRenders} time(s)`}
      </Text>
    );
  }
}

export function PureComponentDemo() {
  const [value, setValue] = useState(0);
  const [unrelatedTick, setUnrelatedTick] = useState(0);

  return (
    <View className="section-nested">
      <Text className="section-label">PureComponent</Text>
      <RegularChild value={value} />
      <PureChild value={value} />
      <ActionButton
        testID="pure-change-value"
        title="Change value (both re-render)"
        onPress={() => setValue(current => current + 1)}
        color={LINE_COLOR.introspection}
      />
      <ActionButton
        testID="pure-unrelated-tick"
        title="Unrelated parent re-render (only regular moves)"
        onPress={() => setUnrelatedTick(current => current + 1)}
        color={LINE_COLOR.introspection}
      />
      <Text className="note-text">{`unrelated ticks: ${unrelatedTick}`}</Text>
    </View>
  );
}
