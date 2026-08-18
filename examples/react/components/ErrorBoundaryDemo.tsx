import { Component, captureOwnerStack, useState, type ReactNode } from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type IErrorBoundaryProps = { children: ReactNode };
type IErrorBoundaryState = { error: Error | null; ownerStack: string | null };

// Error Boundaries only exist as a class-component pattern — there's no Hook equivalent.
// getDerivedStateFromError swaps in the fallback UI; componentDidCatch is where you'd report
// it (render.ts's onCaughtError ALSO reports it to the native redbox channel, so the developer
// still hears about it even though this boundary renders a friendly fallback).
class Boundary extends Component<IErrorBoundaryProps, IErrorBoundaryState> {
  state: IErrorBoundaryState = { error: null, ownerStack: null };

  static getDerivedStateFromError(error: Error): Partial<IErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(): void {
    // captureOwnerStack: the "which component rendered the thing that threw" trace, dev-only.
    this.setState({ ownerStack: captureOwnerStack() });
  }

  onReset = (): void => {
    this.setState({ error: null, ownerStack: null });
  };

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <View testID="error-boundary-fallback" className="error-fallback">
        <Text className="error-fallback-title">{`caught: ${this.state.error.message}`}</Text>
        {this.state.ownerStack !== null && (
          <Text className="note-text">{`owner stack: ${this.state.ownerStack || '(empty — release build)'}`}</Text>
        )}
        <ActionButton
          testID="error-boundary-reset"
          title="Reset boundary"
          onPress={this.onReset}
          color={LINE_COLOR.introspection}
        />
      </View>
    );
  }
}

function Bomb(): ReactNode {
  throw new Error('boom — thrown on purpose by the API Playground');
}

function BombTrigger() {
  const [armed, setArmed] = useState(false);
  if (armed) return <Bomb />;
  return (
    <ActionButton
      testID="error-boundary-throw"
      title="Throw an error (render-time, not onPress)"
      onPress={() => setArmed(true)}
      color={LINE_COLOR.introspection}
    />
  );
}

export function ErrorBoundaryDemo() {
  return (
    <View className="section-nested">
      <Text className="section-label">
        Error Boundaries · static getDerivedStateFromError · componentDidCatch ·
        captureOwnerStack
      </Text>
      <Boundary>
        <BombTrigger />
      </Boundary>
    </View>
  );
}
