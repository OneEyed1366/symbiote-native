// Async / Control Flow — <ErrorBoundary> and catchError.
//
// <ErrorBoundary> catches only what is thrown while RENDERING or updating its subtree. An error
// thrown from an event handler — an onPress — never reaches it, in Solid exactly as in React, so
// the second half of this demo uses catchError, which is the tool for that case. Both are on
// screen because knowing which one applies is the whole difficulty.
//
// `reset()` re-runs the subtree. It cannot un-throw on its own: the condition that made the child
// throw has to be cleared first, which is why the reset button below does both.

import { ErrorBoundary, Show, catchError, createSignal } from 'solid-js';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.introspection;

// `: never` is load-bearing, not decoration — a function DECLARATION whose body only throws
// infers `void`, which TS then rejects as a JSX element type (TS2786).
function Exploder(): never {
  throw new Error('thrown from Exploder during render');
}

export function ErrorBoundaryDemo() {
  const [exploding, setExploding] = createSignal(false);
  const [caught, setCaught] = createSignal('—');

  const throwInsideHandler = (): void => {
    // catchError runs its first argument and routes a synchronous throw to the handler instead of
    // letting it escape. Nothing above sees it, and no boundary is involved.
    catchError(
      () => {
        throw new Error('thrown inside an onPress handler');
      },
      error =>
        setCaught(error instanceof Error ? error.message : String(error)),
    );
  };

  return (
    <view class="section-nested">
      <text class="section-label">ErrorBoundary · catchError</text>

      <ErrorBoundary
        fallback={(error: unknown, reset: () => void) => (
          <view class="ap-panel">
            <text class="ap-note" testID="boundary-fallback">
              {`ErrorBoundary caught: ${error instanceof Error ? error.message : String(error)}`}
            </text>
            <ActionButton
              testID="boundary-reset"
              title="clear the cause, then reset()"
              color={ACCENT}
              onPress={() => {
                setExploding(false);
                reset();
              }}
            />
          </view>
        )}
      >
        <Show
          when={exploding()}
          fallback={
            <text class="ap-value" testID="boundary-content">
              subtree is healthy
            </text>
          }
        >
          <Exploder />
        </Show>
      </ErrorBoundary>

      <view class="ap-wrap">
        <ActionButton
          testID="boundary-throw"
          title="throw during render"
          color={ACCENT}
          onPress={() => setExploding(true)}
        />
        <ActionButton
          testID="boundary-handler-throw"
          title="throw inside a handler (catchError)"
          color={ACCENT}
          onPress={throwInsideHandler}
        />
      </view>
      <text class="subtle" testID="boundary-caught">
        {`catchError saw: ${caught()}`}
      </text>
    </view>
  );
}
