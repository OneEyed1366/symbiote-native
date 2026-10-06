import { defineComponent, onMounted, ref, shallowRef } from 'vue';
import { findNodeHandle } from '@symbiote-native/vue';
import type { IHostInstance } from '@symbiote-native/vue';

const ACCENT = '#42b883';
const FLASH = '#f6ad55';

// The seam reanimated and gesture-handler reach through. setNativeProps bypasses Vue entirely,
// so the flash holds until the next commit re-applies the declarative style
export const RefApiDemo = defineComponent({
  name: 'RefApiDemo',
  setup() {
    // shallowRef: the engine node is held by identity, a ref would wrap it in a proxy
    const boxRef = shallowRef<IHostInstance | null>(null);
    let isFlashed = false;
    const frame = ref('tap “Measure”');
    const tag = ref<number | null>(null);

    // The tag exists only after the first commit
    onMounted(() => {
      tag.value = findNodeHandle(boxRef.value);
    });

    // x/y are the offset inside the parent and do not change on scroll, pageX/pageY come from the root
    const onMeasure = (): void => {
      const box = boxRef.value;
      if (box === null) return;
      box.measure((x, y, width, height, pageX, pageY) => {
        frame.value =
          `in parent x${Math.round(x)} y${Math.round(y)} · ${Math.round(width)}×${Math.round(height)}` +
          ` · from root ${Math.round(pageX)},${Math.round(pageY)}`;
      });
    };

    const onFlash = (): void => {
      const box = boxRef.value;
      if (box === null) return;
      isFlashed = !isFlashed;
      box.setNativeProps({ style: { backgroundColor: isFlashed ? FLASH : ACCENT } });
    };

    return () => (
      <view class="section-nested">
        <text class="section-label">Imperative ref · measure / setNativeProps / findNodeHandle</text>
        <view ref={boxRef} testID="ref-box" class="ref-box">
          <text class="ref-box-text">{`native tag ${tag.value ?? '—'}`}</text>
        </view>
        <text testID="measure-frame" class="info-text">{`measure · ${frame.value}`}</text>
        <view class="row">
          <view class="flex1">
            <button testID="measure-btn" title="Measure" onPress={onMeasure} color={ACCENT} />
          </view>
          <view class="flex1">
            <button title="Flash (setNativeProps)" onPress={onFlash} color={FLASH} />
          </view>
        </view>
      </view>
    );
  },
});
