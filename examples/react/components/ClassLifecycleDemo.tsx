import { Component, useState } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type ILifecycleDemoClassProps = {
  seed: number;
  skipUpdates: boolean;
  label?: string;
  onLog: (entry: string) => void;
};

type ILifecycleDemoClassState = {
  count: number;
  derivedSeed: number;
};

class LifecycleDemoClass extends Component<
  ILifecycleDemoClassProps,
  ILifecycleDemoClassState
> {
  // static defaultProps: fills in `label` when the caller omits it.
  static defaultProps = { label: 'lifecycle demo' };

  constructor(props: ILifecycleDemoClassProps) {
    super(props);
    // constructor(props): the only place this.state is assigned directly — everywhere else
    // goes through this.setState.
    this.state = { count: 0, derivedSeed: props.seed };
  }

  // static getDerivedStateFromProps: recomputed before EVERY render, props-in state-out —
  // mirrors `seed` into state whenever the parent changes it.
  static getDerivedStateFromProps(
    props: ILifecycleDemoClassProps,
    state: ILifecycleDemoClassState,
  ): Partial<ILifecycleDemoClassState> | null {
    if (props.seed === state.derivedSeed) return null;
    return { derivedSeed: props.seed };
  }

  // shouldComponentUpdate: the parent's `skipUpdates` toggle lets us observe this actually
  // skipping a render — forceUpdate below is the documented bypass.
  shouldComponentUpdate(
    nextProps: ILifecycleDemoClassProps,
    nextState: ILifecycleDemoClassState,
  ): boolean {
    if (nextProps.skipUpdates && nextState.count === this.state.count)
      return false;
    return true;
  }

  // getSnapshotBeforeUpdate: captured right before the update commits, handed to
  // componentDidUpdate as its third argument.
  getSnapshotBeforeUpdate(
    _prevProps: ILifecycleDemoClassProps,
    prevState: ILifecycleDemoClassState,
  ): number {
    return prevState.count;
  }

  componentDidMount(): void {
    this.props.onLog(`mounted with seed=${this.props.seed}`);
  }

  componentDidUpdate(
    _prevProps: ILifecycleDemoClassProps,
    prevState: ILifecycleDemoClassState,
    snapshot: number,
  ): void {
    if (this.state.count !== prevState.count) {
      this.props.onLog(
        `count ${snapshot} -> ${this.state.count} (getSnapshotBeforeUpdate carried the pre-update value)`,
      );
    }
    if (this.state.derivedSeed !== prevState.derivedSeed) {
      this.props.onLog(
        `derivedSeed -> ${this.state.derivedSeed} (static getDerivedStateFromProps)`,
      );
    }
  }

  componentWillUnmount(): void {
    this.props.onLog('componentWillUnmount fired');
  }

  onIncrement = (): void => {
    this.setState(current => ({ ...current, count: current.count + 1 }));
  };

  onForce = (): void => {
    this.forceUpdate();
    this.props.onLog('forceUpdate() called (bypasses shouldComponentUpdate)');
  };

  render() {
    return (
      <View className="section-tight">
        <Text testID="class-lifecycle-count" className="info-text">
          {`${this.props.label}: count=${this.state.count}, derivedSeed=${this.state.derivedSeed}`}
        </Text>
        <View className="row-tight">
          <ActionButton
            testID="class-lifecycle-increment"
            title="setState (+1)"
            onPress={this.onIncrement}
            color={LINE_COLOR.introspection}
          />
          <ActionButton
            testID="class-lifecycle-force"
            title="forceUpdate()"
            onPress={this.onForce}
            color={LINE_COLOR.introspection}
          />
        </View>
      </View>
    );
  }
}

export function ClassLifecycleDemo() {
  const [mounted, setMounted] = useState(true);
  const [seed, setSeed] = useState(0);
  const [skipUpdates, setSkipUpdates] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const onLog = (entry: string): void => {
    setLog(current => [...current.slice(-4), entry]);
  };

  return (
    <View className="section-nested">
      <Text className="section-label">
        class extends Component · constructor · render ·
        componentDidMount/Update/WillUnmount · shouldComponentUpdate · static
        getDerivedStateFromProps · getSnapshotBeforeUpdate ·
        this.setState/forceUpdate · static defaultProps
      </Text>
      {mounted && (
        <LifecycleDemoClass
          seed={seed}
          skipUpdates={skipUpdates}
          onLog={onLog}
        />
      )}
      <View className="row-tight">
        <ActionButton
          testID="class-lifecycle-toggle-mount"
          title={mounted ? 'Unmount' : 'Mount'}
          onPress={() => setMounted(current => !current)}
          color={LINE_COLOR.introspection}
        />
        <ActionButton
          testID="class-lifecycle-bump-seed"
          title="Bump seed prop"
          onPress={() => setSeed(current => current + 1)}
          color={LINE_COLOR.introspection}
        />
        <ActionButton
          testID="class-lifecycle-toggle-skip"
          title={skipUpdates ? 'skipUpdates: on' : 'skipUpdates: off'}
          onPress={() => setSkipUpdates(current => !current)}
          color={LINE_COLOR.introspection}
        />
      </View>
      <View testID="class-lifecycle-log" className="log-box">
        {log.length === 0 && (
          <Text className="note-text">no lifecycle events logged yet</Text>
        )}
        {log.map((entry, index) => (
          <Text key={`${index}-${entry}`} className="note-text">
            {entry}
          </Text>
        ))}
      </View>
    </View>
  );
}
