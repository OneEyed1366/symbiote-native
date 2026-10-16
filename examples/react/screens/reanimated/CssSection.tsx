import { useState } from 'react';
import Animated, { css } from '@symbiote-native/reanimated/react';
import { ActionButton } from '../../components/ActionButton';
import { Section } from './Section';

const TOGGLE_COLOR = '#bb86fc';
const LIFT = -16;

// The same animation through the JS API: keyframes made once, a style that names them
const bounce = css.keyframes({
  from: { transform: [{ translateY: 0 }] },
  to: { transform: [{ translateY: LIFT }] },
});

const jsStyles = css.create({
  ball: {
    animationName: bounce,
    animationDuration: '600ms',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
});

// CSS animations, transitions and states from a stylesheet, and the same through a style object.
// Keyframes live in this folder's keyframes.css and in sections.css, and are shared between them
export function CssSection() {
  const [isLong, setIsLong] = useState(false);
  const [ends, setEnds] = useState(0);

  return (
    <Section
      title="CSS"
      note="animation, transition, @keyframes across files, onCSS callbacks, :active and :focus"
    >
      <text className="ra-note">
        keyframes from another file, and from this one
      </text>
      <view className="ra-row">
        <view testID="ra-css-spinner" className="ra-spinner" />
        <view testID="ra-css-pulse" className="ra-pulse" />
        <Animated.View
          testID="ra-css-ball"
          className="ra-ball"
          style={jsStyles.ball}
        />
      </view>

      <text className="ra-note">
        transition on the width, and a callback when it ends
      </text>
      <Animated.View
        testID="ra-css-bar"
        className={isLong ? 'ra-bar ra-bar-long' : 'ra-bar ra-bar-short'}
        onCSSTransitionEnd={() => setEnds(ends + 1)}
      />
      <text className="ra-note">{`transitions ended: ${ends}`}</text>
      <ActionButton
        testID="ra-css-toggle"
        title="toggle bar"
        onPress={() => setIsLong(!isLong)}
        color={TOGGLE_COLOR}
      />

      <text className="ra-note">states of the node, served by Reanimated</text>
      <view testID="ra-css-press" className="ra-press">
        <text className="ra-press-text">press and hold</text>
      </view>
      <text-input
        testID="ra-css-field"
        className="ra-field"
        placeholder="focus me"
      />
    </Section>
  );
}
