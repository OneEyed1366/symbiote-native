import { useCallback, useState } from 'react';
import {
  useFocusEffect,
  useIsFocused,
  useNavigationState,
} from '@symbiote-native/navigation/react';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

/**
 * Hooks demo: useFocusEffect increments a counter every time this screen (re)gains focus and logs
 * the moment it loses it; useIsFocused visibly renders the live true/false; useNavigationState
 * selects the whole route-name stack straight out of the root Stack's reducer state and renders
 * it as a list — navigate away and back (or push another screen) to watch all three update.
 */
export function HooksDemoScreen() {
  const [focusCount, setFocusCount] = useState(0);
  const [lastBlurAt, setLastBlurAt] = useState<number | undefined>(undefined);
  const isFocused = useIsFocused();
  const routeNames = useNavigationState(state =>
    state.routes.map(route => route.name),
  );
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.HooksDemo];

  useFocusEffect(
    useCallback(() => {
      setFocusCount(count => count + 1);
      return () => setLastBlurAt(Date.now());
    }, []),
  );

  return (
    <safe-area-view className="screen">
      <view className="section">
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR.introspection }}
          >
            <text className="hero-badge-text">HK</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Hooks</text>
            <text className="hero-body">
              useFocusEffect, useIsFocused, and useNavigationState —
              introspecting the navigator's own live state from inside a screen.
            </text>
          </view>
        </view>
        <text
          testID="hooks-is-focused"
          className="info-text"
        >{`useIsFocused(): ${isFocused}`}</text>
        <text
          testID="hooks-focus-count"
          className="info-text"
        >{`useFocusEffect focus count: ${focusCount}`}</text>
        <text className="info-text">
          {lastBlurAt === undefined
            ? 'not blurred yet'
            : `last blurred at ${lastBlurAt}`}
        </text>
        <text className="section-label">
          useNavigationState() · current route stack
        </text>
        {routeNames.map((name, index) => (
          <text
            key={`${name}-${index}`}
            className="list-row-text"
          >{`${index}. ${name}`}</text>
        ))}
      </view>
    </safe-area-view>
  );
}
