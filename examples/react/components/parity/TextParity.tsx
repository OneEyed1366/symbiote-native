import { useState } from 'react';
import { ParityCard } from './ParityCard';

const LONG_TEXT =
  'One long sentence that wraps over several lines so a line limit has something to cut: ' +
  'the quick brown fox jumps over the lazy dog, again and again, until the line runs out.';
const SELECTABLE = { userSelect: 'text' } as const;
const MIDDLE = { verticalAlign: 'middle' } as const;

// Only the OUTER text carries the defaults, the inner one inherits them through Fabric's merge
function NestedTextDefaults() {
  return (
    <ParityCard
      title="Nested Text keeps the outer defaults"
      rn="allowFontScaling, accessible and ellipsizeMode are written on the outer text only"
      look="set the OS font size to the largest: the whole line, inner part included, must not grow"
    >
      <text allowFontScaling={false} className="parity-text">
        outer is not scaled,
        <text className="parity-text-accent"> and neither is this inner part</text>
      </text>
    </ParityCard>
  );
}

function LineLimit() {
  return (
    <ParityCard
      title="Negative numberOfLines"
      rn="a negative value resolves to 0, which means no limit"
      look="the first paragraph shows every line, the second stops at two"
    >
      <text numberOfLines={-1} className="parity-text">
        {LONG_TEXT}
      </text>
      <text numberOfLines={2} className="parity-text">
        {LONG_TEXT}
      </text>
    </ParityCard>
  );
}

function StyleAliases() {
  return (
    <ParityCard
      title="userSelect and verticalAlign on Text"
      rn="userSelect maps to selectable, verticalAlign to textAlignVertical"
      look="long-press the first line: it selects. Android: the second line sits in the middle"
    >
      <text style={SELECTABLE} className="parity-text">
        long-press me, I am selectable through style.userSelect
      </text>
      <text style={MIDDLE} className="parity-text parity-tall">
        vertically centered on Android
      </text>
    </ParityCard>
  );
}

function DisabledText() {
  return (
    <ParityCard
      title="Disabled Text is announced as disabled"
      rn="disabled folds into accessibilityState.disabled"
      look="VoiceOver or TalkBack: this line reads as dimmed or disabled, the next one does not"
    >
      <text disabled accessible className="parity-text">
        disabled text
      </text>
      <text accessible className="parity-text">
        enabled text
      </text>
    </ParityCard>
  );
}

// RN clones the responder handlers onto the Text child, so the Text itself is pressable
function TextUnderTouchable() {
  const [taps, setTaps] = useState(0);
  return (
    <ParityCard
      title="Text under a touchable is pressable"
      rn="TouchableWithoutFeedback clones its handlers onto the Text, which then reads as a link"
      look="tap the line: the counter grows. A screen reader calls it a link"
    >
      <touchable-without-feedback onPress={() => setTaps(count => count + 1)}>
        <text className="parity-text-accent">{`tap this text, taps: ${taps}`}</text>
      </touchable-without-feedback>
    </ParityCard>
  );
}

export function TextParity() {
  return (
    <>
      <NestedTextDefaults />
      <LineLimit />
      <StyleAliases />
      <DisabledText />
      <TextUnderTouchable />
    </>
  );
}
