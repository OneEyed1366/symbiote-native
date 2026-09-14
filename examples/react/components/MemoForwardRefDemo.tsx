import { forwardRef, memo, useImperativeHandle, useRef, useState } from 'react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type IMemoChildProps = { label: string };

let memoChildRenders = 0;

// memo(): skips re-rendering when props are shallow-equal to the last render — `label` only
// changes when the "change label" button fires, not when the unrelated tick button does.
const MemoChild = memo(function MemoChildImpl({ label }: IMemoChildProps) {
  memoChildRenders += 1;
  return (
    <text testID="memo-child-renders" className="info-text">
      {`MemoChild rendered ${memoChildRenders} time(s), label="${label}"`}
    </text>
  );
});

type IFocusHintHandle = { focusHint: () => void };
type IFocusHintBoxProps = { children: string };

// forwardRef: forwards the parent's ref down to an inner host view, wrapped in a small curated
// handle — the same shape ScrollView/TextInput/VirtualizedList use to forward a ref to their
// underlying Symbiote host instance.
const FocusHintBox = forwardRef<IFocusHintHandle, IFocusHintBoxProps>(
  function FocusHintBoxImpl({ children }, ref) {
    const [hinted, setHinted] = useState(false);
    useImperativeHandle(ref, () => ({ focusHint: () => setHinted(true) }), []);
    return (
      <view className="ref-box">
        <text className="ref-box-text">
          {hinted ? `${children} (hinted)` : children}
        </text>
      </view>
    );
  },
);

export function MemoForwardRefDemo() {
  const [label, setLabel] = useState('a');
  const [ticks, setTicks] = useState(0);
  const focusHintRef = useRef<IFocusHintHandle | null>(null);

  return (
    <view className="section-nested">
      <text className="section-label">memo · forwardRef</text>
      <MemoChild label={label} />
      <ActionButton
        testID="memo-change-label"
        title="Change memo child's label"
        onPress={() => setLabel(current => (current === 'a' ? 'b' : 'a'))}
        color={LINE_COLOR.introspection}
      />
      <ActionButton
        testID="memo-unrelated-tick"
        title="Re-render parent only (unrelated tick)"
        onPress={() => setTicks(current => current + 1)}
        color={LINE_COLOR.introspection}
      />
      <text className="note-text">
        {`unrelated ticks: ${ticks} — MemoChild's render count above should NOT move`}
      </text>
      <FocusHintBox ref={focusHintRef}>forwardRef target</FocusHintBox>
      <ActionButton
        testID="memo-focus-hint"
        title="Trigger via forwardRef handle"
        onPress={() => focusHintRef.current?.focusHint()}
        color={LINE_COLOR.introspection}
      />
    </view>
  );
}
