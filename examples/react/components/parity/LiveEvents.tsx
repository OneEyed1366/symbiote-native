import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  BackHandler,
  Keyboard,
  Platform,
} from '@symbiote-native/react';
import { INPUT_HINT } from '../../screens/canary-shared';
import { ActionButton } from '../ActionButton';
import { PARITY_COLOR, ParityCard, VERDICT } from './ParityCard';

const NATIVE_DURATION_MS = 2_000;
const MAX_LOG = 4;

function appendLog(log: string[], entry: string): string[] {
  return [entry, ...log].slice(0, MAX_LOG);
}

// RN binds the AppState module to its emitter on iOS only, native emits only to counted observers
export function AppStateWatch() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state =>
      setLog(current => appendLog(current, String(state))),
    );
    return () => subscription.remove();
  }, []);
  return (
    <ParityCard
      title="AppState change events"
      rn="the module is observed on iOS, the device bus alone on Android"
      look="press Home, come back: background then active are listed"
    >
      <text className="parity-detail">{`now: ${AppState.currentState}`}</text>
      <text className="parity-detail">{log.join(' <- ') || 'no change yet'}</text>
    </ParityCard>
  );
}

// Same split as AppState: observed through the module on iOS only
export function KeyboardWatch() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () =>
      setLog(current => appendLog(current, `shown, ${Keyboard.metrics()?.height}`)),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () =>
      setLog(current => appendLog(current, 'hidden')),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return (
    <ParityCard
      title="Keyboard events"
      rn="show and hide reach JS on both platforms, with the keyboard height"
      look="focus the field, then dismiss: shown with a height, then hidden"
    >
      <text-input
        placeholder="focus me"
        placeholderTextColor={INPUT_HINT}
        className="text-input"
      />
      <text className="parity-detail">{log.join(' <- ') || 'no event yet'}</text>
    </ParityCard>
  );
}

// Shown on Android only, RN listens on the device bus and never binds the module
export function BackHandlerWatch() {
  const [isTrapping, setIsTrapping] = useState(false);
  const [presses, setPresses] = useState(0);
  useEffect(() => {
    if (!isTrapping) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setPresses(count => count + 1);
      return true;
    });
    return () => subscription.remove();
  }, [isTrapping]);
  return (
    <ParityCard
      title="BackHandler hardware back"
      rn="a subscribed handler that returns true consumes the back press"
      look="trap, then press Back: the counter grows and the screen stays"
    >
      <ActionButton
        title={isTrapping ? 'Release back button' : 'Trap back button'}
        color={PARITY_COLOR}
        onPress={() => setIsTrapping(value => !value)}
      />
      <text className="parity-detail">{`back presses caught: ${presses}`}</text>
    </ParityCard>
  );
}

// RN hands the Animated module to its emitter on iOS only: that is how native counts the
// observer, and a native value streams its frames back only to a counted observer
export function NativeValueListener() {
  const value = useRef(new Animated.Value(0)).current;
  const [streamed, setStreamed] = useState<number | null>(null);
  useEffect(() => {
    const id = value.addListener(({ value: next }) => {
      if (typeof next === 'number') setStreamed(next);
    });
    return () => value.removeListener(id);
  }, [value]);
  const run = () => {
    value.setValue(0);
    Animated.timing(value, {
      toValue: 1,
      duration: NATIVE_DURATION_MS,
      useNativeDriver: true,
    }).start();
  };
  const verdict = streamed === null ? VERDICT.look : VERDICT.pass;
  return (
    <ParityCard
      title="Listener on a native-driven value"
      rn="addListener on a useNativeDriver value streams native frames back to JS"
      look="Run: the box fades in and the number climbs to 1. A number stuck at none is FAIL"
      verdict={verdict}
    >
      <ActionButton title="Run 2s native fade" color={PARITY_COLOR} onPress={run} />
      <Animated.View style={{ opacity: value }} className="parity-box">
        <text className="parity-box-text">native opacity</text>
      </Animated.View>
      <text className="parity-detail">
        {`streamed value: ${streamed === null ? 'none' : streamed.toFixed(2)} (${Platform.OS})`}
      </text>
    </ParityCard>
  );
}
