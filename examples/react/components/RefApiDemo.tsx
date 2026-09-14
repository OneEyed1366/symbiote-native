import { useEffect, useRef, useState } from 'react';
import { findNodeHandle, type IHostInstance } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';

// Imperative host-ref API: the seam reanimated / gesture-handler reach through.
// `measure` returns the box's real on-screen frame (only a live host can answer it);
// `setNativeProps` recolors the box bypassing React entirely (no state, no re-render);
// `findNodeHandle` reads the committed native tag. The flash holds until the next React
// commit re-applies the declarative style, exactly RN's imperative-override semantics.
export function RefApiDemo() {
  const boxRef = useRef<IHostInstance | null>(null);
  const flashedRef = useRef(false);
  const [frame, setFrame] = useState('tap “Measure”');
  const [tag, setTag] = useState<number | null>(null);

  useEffect(() => {
    // The tag exists only after the first commit, so read it post-mount.
    setTag(findNodeHandle(boxRef.current));
  }, []);

  const onMeasure = (): void => {
    const box = boxRef.current;
    if (box === null) return;
    box.measure((x, y, width, height, pageX, pageY) => {
      setFrame(
        `x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · page ${Math.round(pageX)},${Math.round(pageY)}`,
      );
    });
  };

  const onFlash = (): void => {
    const box = boxRef.current;
    if (box === null) return;
    flashedRef.current = !flashedRef.current;
    box.setNativeProps({
      style: { backgroundColor: flashedRef.current ? '#f6ad55' : '#7fb5ff' },
    });
  };

  return (
    <view className="section-nested">
      <text className="section-label">
        Imperative ref · measure / setNativeProps / findNodeHandle
      </text>
      <view ref={boxRef} testID="ref-box" className="ref-box">
        <text className="ref-box-text">{`native tag ${tag ?? '—'}`}</text>
      </view>
      <text
        testID="measure-frame"
        className="info-text"
      >{`frame: ${frame}`}</text>
      <view className="row">
        <view className="flex1">
          <ActionButton
            testID="measure-btn"
            title="Measure"
            onPress={onMeasure}
            color="#7fb5ff"
          />
        </view>
        <view className="flex1">
          <ActionButton
            title="Flash (setNativeProps)"
            onPress={onFlash}
            color="#f6ad55"
          />
        </view>
      </view>
    </view>
  );
}
