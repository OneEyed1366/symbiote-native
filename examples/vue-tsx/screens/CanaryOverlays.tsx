import { defineComponent, ref } from 'vue';
import { Modal } from '@symbiote-native/vue';
import type { IHostInstance } from '@symbiote-native/vue';
// The metro config aliases 'vue' to @vue/runtime-core, so Teleport needs the validating wrapper
import { Teleport } from '@symbiote-native/vue/runtime-helpers';
import { tunnelDemo } from '../tunnel-demo';
import { ACCENT } from './canary-shared';

export const CanaryModal = defineComponent({
  name: 'CanaryModal',
  setup() {
    const isOpen = ref(false);
    return () => (
      <>
        <button testID="modal-open" title="Open modal" onPress={() => (isOpen.value = true)} color={ACCENT} />
        <Modal
          visible={isOpen.value}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            isOpen.value = false;
          }}
        >
          {/* A transparent modal paints its own dim layer */}
          <view class="modal-overlay">
            <view testID="modal-card" class="modal-card">
              <text class="modal-title">It's a Modal</text>
              <text class="modal-body">
                Rendered through ModalHostView — its own native window, same Fabric tree.
              </text>
              <button testID="modal-close" title="Close" onPress={() => (isOpen.value = false)} color={ACCENT} />
            </view>
          </view>
        </Modal>
      </>
    );
  },
});

// Teleport moves the card into the overlay host, a sibling of the scroll view on the same surface
export const CanaryPortal = defineComponent<{ host: IHostInstance | null }>(
  props => {
    const isShown = ref(false);
    return () => (
      <>
        <button testID="toast-open" title="Show toast (Teleport)" onPress={() => (isShown.value = true)} color={ACCENT} />
        {props.host && (
          <Teleport to={props.host}>
            {isShown.value && (
              <view testID="toast-card" class="modal-card">
                <text class="modal-body">Ported via Teleport ✦</text>
                <button testID="toast-dismiss" title="Dismiss" onPress={() => (isShown.value = false)} color={ACCENT} />
              </view>
            )}
          </Teleport>
        )}
      </>
    );
  },
  { name: 'CanaryPortal', props: ['host'] },
);

// createTunnel needs no ref or target: In registers its children, Out reads them back anywhere
export const CanaryTunnel = defineComponent({
  name: 'CanaryTunnel',
  setup() {
    const isShown = ref(false);
    return () => (
      <>
        <button
          testID="tunnel-toast-open"
          title="Show toast (createTunnel)"
          onPress={() => (isShown.value = true)}
          color={ACCENT}
        />
        {isShown.value && (
          <tunnelDemo.In>
            <view testID="tunnel-toast-card" class="modal-card">
              <text class="modal-body">Ported via createTunnel ✦</text>
              <button
                testID="tunnel-toast-dismiss"
                title="Dismiss"
                onPress={() => (isShown.value = false)}
                color={ACCENT}
              />
            </view>
          </tunnelDemo.In>
        )}
      </>
    );
  },
});
