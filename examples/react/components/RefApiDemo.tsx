import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  findNodeHandle,
  type IHostInstance,
} from '@symbiote-native/react';
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
    // The two halves answer different questions and only one of them moves when you scroll, which
    // reads as a bug until the labels say so. `measure`'s x/y are the node's offset inside its
    // PARENT (`DOM.cpp`'s `originRelativeToParent`) — scrolling does not change that — while
    // pageX/pageY are measured from the root and do.
    box.measure((x, y, width, height, pageX, pageY) => {
      setFrame(
        `in parent x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · from root ${Math.round(pageX)},${Math.round(pageY)}`,
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
    <View className="section-nested">
      <Text className="section-label">
        Imperative ref · measure / setNativeProps / findNodeHandle
      </Text>
      <View ref={boxRef} testID="ref-box" className="ref-box">
        <Text className="ref-box-text">{`native tag ${tag ?? '—'}`}</Text>
      </View>
      <Text
        testID="measure-frame"
        className="info-text"
      >{`measure · ${frame}`}</Text>
      <View className="row">
        <View className="flex1">
          <ActionButton
            testID="measure-btn"
            title="Measure"
            onPress={onMeasure}
            color="#7fb5ff"
          />
        </View>
        <View className="flex1">
          <ActionButton
            title="Flash (setNativeProps)"
            onPress={onFlash}
            color="#f6ad55"
          />
        </View>
      </View>
    </View>
  );
}
