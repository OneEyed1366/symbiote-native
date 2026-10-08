import { Component, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { IHostInstance } from '@symbiote-native/react';
import { textInputOf } from '@symbiote-native/components';
import { INPUT_HINT } from '../../screens/canary-shared';
import { ActionButton } from '../ActionButton';
import { PARITY_COLOR, ParityCard, VERDICT, isAndroid } from './ParityCard';

const SELECTION_RED = '#ff3b30';
const CURSOR_GREEN = '#34c759';
const HANDLE_BLUE = '#007aff';
const SAMPLE = 'select part of me';
const SELECT_FROM = 7;
const SELECT_TO = 11;

function ChildrenAsContent() {
  return (
    <ParityCard
      title="A string child is the input's text"
      rn="<TextInput>hello</TextInput> shows hello, it does not throw"
      look="the field reads 'from a child'. 'must be rendered inside a <text>' is FAIL"
    >
      <text-input className="text-input">from a child</text-input>
    </ParityCard>
  );
}

// RN's ref callback puts these methods on the instance, `textInputOf` is the typed view of it
function RefMethods() {
  const inputRef = useRef<IHostInstance>(null);
  const [focus, setFocus] = useState('unknown');
  const handle = () => textInputOf(inputRef.current);
  return (
    <ParityCard
      title="TextInput ref methods"
      rn="the ref answers clear, isFocused and setSelection, focus goes through TextInputState"
      look="Select highlights 'part', Clear empties the field, Focus? reads true while focused"
    >
      <text-input
        ref={inputRef}
        defaultValue={SAMPLE}
        placeholder="empty now"
        placeholderTextColor={INPUT_HINT}
        className="text-input"
      />
      <view className="row">
        <ActionButton
          title="Select"
          color={PARITY_COLOR}
          onPress={() => handle()?.setSelection(SELECT_FROM, SELECT_TO)}
        />
        <ActionButton
          title="Clear"
          color={PARITY_COLOR}
          onPress={() => handle()?.clear()}
        />
        <ActionButton
          title="Focus?"
          color={PARITY_COLOR}
          onPress={() => setFocus(String(handle()?.isFocused()))}
        />
      </view>
      <text className="parity-detail">{`isFocused(): ${focus}`}</text>
    </ParityCard>
  );
}

// iOS has one selection colour, Android has three; the extra two are dropped on iOS
function SelectionColors() {
  return (
    <ParityCard
      title="selectionColor, cursorColor, selectionHandleColor"
      rn="iOS sends selectionColor alone, Android coalesces the three"
      look="iOS: caret and selection are red. Android: red selection, green caret, blue handles"
    >
      <text-input
        defaultValue={SAMPLE}
        selectionColor={SELECTION_RED}
        cursorColor={CURSOR_GREEN}
        selectionHandleColor={HANDLE_BLUE}
        className="text-input"
      />
    </ParityCard>
  );
}

type IBoundaryState = { message: string | null };

class ErrorCatcher extends Component<{ children: ReactNode }, IBoundaryState> {
  state: IBoundaryState = { message: null };

  static getDerivedStateFromError(error: Error): IBoundaryState {
    return { message: error.message };
  }

  render() {
    const { message } = this.state;
    if (message !== null) {
      return <text className="parity-detail">{`caught: ${message}`}</text>;
    }
    return this.props.children;
  }
}

// Android's TextInput.js throws once a child lands under a `value`, iOS accepts the pair
function ValueWithChildren() {
  const [isMounted, setIsMounted] = useState(false);
  return (
    <ParityCard
      title="value together with children"
      rn="throws 'Cannot specify both value and children.' when the child is inserted"
      look="Mount shows 'caught: Cannot specify both value and children.'"
      verdict={isMounted ? VERDICT.pass : VERDICT.look}
    >
      <ActionButton
        title="Mount"
        color={PARITY_COLOR}
        onPress={() => setIsMounted(true)}
      />
      {isMounted && (
        <ErrorCatcher>
          <text-input
            value="typed"
            onChangeText={() => undefined}
            className="text-input"
          >
            a child
          </text-input>
        </ErrorCatcher>
      )}
    </ParityCard>
  );
}

export function TextInputParity() {
  return (
    <>
      <ChildrenAsContent />
      <RefMethods />
      <SelectionColors />
      {isAndroid && <ValueWithChildren />}
    </>
  );
}
