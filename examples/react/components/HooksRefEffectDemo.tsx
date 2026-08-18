import {
  forwardRef,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Text,
  View,
  findNodeHandle,
  type IHostInstance,
} from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type IKnobHandle = { bump: () => void };
type IKnobProps = { value: number };

// useImperativeHandle: exposes a curated bump() instead of the raw host instance — the same
// shape RN's own imperative components (ScrollView.scrollTo, TextInput.focus) use.
const Knob = forwardRef<IKnobHandle, IKnobProps>(function KnobImpl(
  { value },
  ref,
) {
  const [bumps, setBumps] = useState(0);
  useImperativeHandle(
    ref,
    () => ({ bump: () => setBumps(current => current + 1) }),
    [],
  );
  return (
    <Text
      testID="hooks-knob"
      className="info-text"
    >{`knob value=${value} bumps=${bumps}`}</Text>
  );
});

export function HooksRefEffectDemo() {
  // useRef: mutating .current does NOT itself trigger a re-render — the count below only moves
  // when something else (the button) forces one.
  const renderCount = useRef(0);
  renderCount.current += 1;
  const boxRef = useRef<IHostInstance | null>(null);
  const knobRef = useRef<IKnobHandle | null>(null);
  const [syncNote, setSyncNote] = useState('measuring…');
  const [ticks, setTicks] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [loggedText, setLoggedText] = useState('waiting for the first tick…');
  const [, forceRerender] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTicks(current => current + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // useLayoutEffect fires synchronously right after the commit — host-config.ts commits
  // SYNCHRONOUSLY (resetAfterCommit -> surface.commit()), so boxRef already carries a real
  // native tag here, unlike Vue's microtask-coalesced requestCommit() (vue-adapter-reactivity).
  useLayoutEffect(() => {
    const tag = findNodeHandle(boxRef.current);
    setSyncNote(
      tag === null
        ? 'no tag yet'
        : `native tag ${tag} already committed inside useLayoutEffect`,
    );
  }, []);

  // useEffectEvent: reads the LATEST multiplier without needing it in the effect's own deps —
  // the interval effect above never restarts when multiplier changes.
  const logTick = useEffectEvent((tick: number) => {
    setLoggedText(
      `tick ${tick} × multiplier ${multiplier} = ${tick * multiplier}`,
    );
  });
  useEffect(() => {
    logTick(ticks);
  }, [ticks]);

  return (
    <View className="section-nested">
      <Text className="section-label">
        useRef · useImperativeHandle · useEffect · useLayoutEffect ·
        useEffectEvent
      </Text>
      <View ref={boxRef} testID="hooks-layout-box" className="ref-box">
        <Text className="ref-box-text">{syncNote}</Text>
      </View>
      <Text testID="hooks-render-count" className="info-text">
        {`useRef render count (mutation alone never re-renders): ${renderCount.current}`}
      </Text>
      <ActionButton
        testID="hooks-force-rerender"
        title="Force a re-render"
        onPress={() => forceRerender(current => current + 1)}
        color={LINE_COLOR.introspection}
      />
      <Text className="info-text">{`useEffect ticks: ${ticks}`}</Text>
      <Text
        testID="hooks-effect-event-log"
        className="info-text"
      >{`useEffectEvent: ${loggedText}`}</Text>
      <ActionButton
        testID="hooks-multiplier"
        title={multiplier === 1 ? 'Multiplier 1 → 3' : 'Multiplier 3 → 1'}
        onPress={() => setMultiplier(current => (current === 1 ? 3 : 1))}
        color={LINE_COLOR.introspection}
      />
      <Knob ref={knobRef} value={ticks} />
      <ActionButton
        testID="hooks-bump-knob"
        title="Bump knob via ref"
        onPress={() => knobRef.current?.bump()}
        color={LINE_COLOR.introspection}
      />
    </View>
  );
}
