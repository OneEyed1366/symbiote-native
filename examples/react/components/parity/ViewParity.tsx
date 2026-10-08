import { useState } from 'react';
import { LayoutAnimation } from '@symbiote-native/react';
import { ActionButton } from '../ActionButton';
import { PARITY_COLOR, ParityCard } from './ParityCard';

const GLIDE_MS = 600;
const BOX_SMALL = 'parity-grow parity-grow-small';
const BOX_LARGE = 'parity-grow parity-grow-large';

// One touch runs three steps: capture on the way down, the target, the bubble back up
function TouchOrder() {
  const [order, setOrder] = useState<string[]>([]);
  const push = (step: string) => setOrder(steps => [...steps, step]);
  return (
    <ParityCard
      title="Touch handlers reach an ancestor"
      rn="onTouchStart and its Capture twin run on every ancestor of the touched view"
      look="touch the inner box: capture, then target, then bubble, in that order"
    >
      <view
        className="parity-touch-outer"
        onTouchStartCapture={() => setOrder(['parent capture'])}
        onTouchStart={() => push('parent bubble')}
      >
        <view className="parity-touch-inner" onTouchStart={() => push('target')}>
          <text className="parity-box-text">touch me</text>
        </view>
      </view>
      <text className="parity-detail">{order.join(' > ') || 'no touch yet'}</text>
    </ParityCard>
  );
}

// `display: contents` takes the wrapper out of layout, so its two boxes become row children
function LayoutConformanceRow() {
  return (
    <ParityCard
      title="LayoutConformance is not a layout box"
      rn="the wrapper is replaced by display: contents, whatever style it carries"
      look="the two boxes sit side by side in one row. Stacked in a column is FAIL"
    >
      <view className="row">
        <layout-conformance mode="strict">
          <view className="parity-swatch parity-swatch-a" />
          <view className="parity-swatch parity-swatch-b" />
        </layout-conformance>
      </view>
    </ParityCard>
  );
}

// A config without `duration` times as 0 + 17 ms, so it jumps where a 600 ms one glides
function LayoutAnimationDuration() {
  const [isLarge, setIsLarge] = useState(false);
  const toggle = (duration?: number) => {
    LayoutAnimation.configureNext({
      duration,
      update: { type: 'easeInEaseOut' },
    });
    setIsLarge(value => !value);
  };
  return (
    <ParityCard
      title="LayoutAnimation without a duration"
      rn="configureNext without duration runs for 17 ms: a jump, not a glide"
      look="the first button jumps the box, the second one glides it over 600 ms"
    >
      <view className="row">
        <ActionButton title="No duration" color={PARITY_COLOR} onPress={() => toggle()} />
        <ActionButton
          title={`${GLIDE_MS} ms`}
          color={PARITY_COLOR}
          onPress={() => toggle(GLIDE_MS)}
        />
      </view>
      <view className={isLarge ? BOX_LARGE : BOX_SMALL} />
    </ParityCard>
  );
}

export function ViewParity() {
  return (
    <>
      <TouchOrder />
      <LayoutConformanceRow />
      <LayoutAnimationDuration />
    </>
  );
}
