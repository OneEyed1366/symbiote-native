import { createContext, useContext, useReducer, useState } from 'react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type ICounterAction = { type: 'increment' } | { type: 'reset' };

function counterReducer(count: number, action: ICounterAction): number {
  if (action.type === 'increment') return count + 1;
  return 0;
}

const StepContext = createContext(1);

function ReducerCounter() {
  // useContext: reads the step size from the nearest StepContext provider above — the same
  // subscription mechanism host-config.ts's own HostTransitionContext relies on internally.
  const step = useContext(StepContext);
  const [count, dispatch] = useReducer(counterReducer, 0);
  return (
    <view className="row-tight">
      <text
        testID="hooks-reducer-count"
        className="info-text"
      >{`useReducer count: ${count} (step ${step})`}</text>
      <ActionButton
        testID="hooks-reducer-increment"
        title={`+${step}`}
        onPress={() => {
          for (let i = 0; i < step; i += 1) dispatch({ type: 'increment' });
        }}
        color={LINE_COLOR.introspection}
      />
      <ActionButton
        testID="hooks-reducer-reset"
        title="reset"
        onPress={() => dispatch({ type: 'reset' })}
        color={LINE_COLOR.introspection}
      />
    </view>
  );
}

export function HooksStateContextDemo() {
  const [name, setName] = useState('symbiote');
  const [step, setStep] = useState(1);

  return (
    <view className="section-nested">
      <text className="section-label">useState · useReducer · useContext</text>
      <text
        testID="hooks-state-name"
        className="info-text"
      >{`useState: hello, ${name}`}</text>
      <ActionButton
        testID="hooks-state-toggle"
        title="Rename"
        onPress={() =>
          setName(current => (current === 'symbiote' ? 'react' : 'symbiote'))
        }
        color={LINE_COLOR.introspection}
      />
      <StepContext value={step}>
        <ReducerCounter />
      </StepContext>
      <ActionButton
        testID="hooks-context-step"
        title="Change context step"
        onPress={() => setStep(current => (current === 1 ? 5 : 1))}
        color={LINE_COLOR.introspection}
      />
    </view>
  );
}
