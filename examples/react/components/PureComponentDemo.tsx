import { Component, PureComponent, useState } from 'react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type IRenderCounterProps = { value: number };

let regularRenders = 0;
class RegularChild extends Component<IRenderCounterProps> {
  render() {
    regularRenders += 1;
    return (
      <text testID="pure-regular-renders" className="info-text">
        {`Component (no shouldComponentUpdate): rendered ${regularRenders} time(s)`}
      </text>
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
      <text testID="pure-pure-renders" className="info-text">
        {`PureComponent: rendered ${pureRenders} time(s)`}
      </text>
    );
  }
}

export function PureComponentDemo() {
  const [value, setValue] = useState(0);
  const [unrelatedTick, setUnrelatedTick] = useState(0);

  return (
    <view className="section-nested">
      <text className="section-label">PureComponent</text>
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
      <text className="note-text">{`unrelated ticks: ${unrelatedTick}`}</text>
    </view>
  );
}
