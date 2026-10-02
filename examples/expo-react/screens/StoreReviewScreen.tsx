import { useCallback, useEffect, useState } from 'react';
import {
  hasAction,
  isAvailableAsync,
  requestReview,
} from '@symbiote-native/store-review';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text className="value-text">{value}</text>
    </view>
  );
}

export function StoreReviewScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.StoreReview];
  const lineColor = LINE_COLOR[lineInfo.line];

  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [canRequestReview, setCanRequestReview] = useState<boolean | null>(
    null,
  );
  const [lastResult, setLastResult] = useState('idle');

  useEffect(() => {
    let isMounted = true;
    Promise.all([isAvailableAsync(), hasAction()]).then(
      ([available, action]) => {
        if (isMounted) {
          setIsAvailable(available);
          setCanRequestReview(action);
        }
      },
    );
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRequestReview = useCallback(() => {
    setLastResult('requesting…');
    requestReview()
      .then(() => setLastResult('resolved'))
      .catch((error: Error) => setLastResult(`rejected: ${error.message}`));
  }, []);

  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="store-review-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view className="hero-badge" style={{ backgroundColor: lineColor }}>
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">Store Review</text>
            <text className="hero-body">
              Ask happy users for a store rating without leaving the app, with
              the native App Store and Google Play review sheet.
            </text>
          </view>
        </view>

        <Scenario
          testID="store-review-scenario"
          title="Ask for a rating right after a good moment"
          why="Reviews convert best after a success, such as a finished order or a completed level. The stores limit how often the sheet appears, so ask once at the right time."
          steps={['Check that the native flow is available', 'Press Request Review', 'Read the last result']}
          expect="The review sheet may appear, but the stores never say whether it did. The result only says the call finished, and Android shows it only for Play-installed builds."
        />
        <view testID="store-review-capability-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Capability</text>
          </view>
          <ValueRow
            label="Native flow available"
            value={
              isAvailable === null ? 'checking…' : isAvailable ? 'Yes' : 'No'
            }
          />
          <ValueRow
            label="Can request review"
            value={
              canRequestReview === null
                ? 'checking…'
                : canRequestReview
                  ? 'Yes'
                  : 'No'
            }
          />
        </view>

        <view testID="store-review-action-card" className="feature-card">
          <view className="feature-card-header">
            <text className="feature-card-title">Request review</text>
          </view>
          <ActionButton
            testID="store-review-request-button"
            title="Request Review"
            onPress={handleRequestReview}
            color={lineColor}
          />
          <view className="capability-row">
            <text className="capability-label">Last result</text>
            <text testID="store-review-result" className="value-text">
              {lastResult}
            </text>
          </view>
          <text className="info-text">
            resolved means the call completed, not that a prompt appeared. On
            Android the Play dialog only shows for a build installed from Google
            Play (internal test track, internal app sharing, or production); a
            sideloaded debug build resolves silently. iOS shows it in debug
            builds. Both stores also enforce a quota.
          </text>
        </view>
      </scroll-view>
    </safe-area-view>
  );
}
