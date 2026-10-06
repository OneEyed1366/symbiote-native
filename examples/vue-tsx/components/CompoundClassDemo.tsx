import { defineComponent, ref } from 'vue';

// `.badge.loud` restates only two colors, so `.badge`'s padding and radius must survive on an
// element with both tokens. The dynamic label stays constant, a screenshot diff proves the rule
export const CompoundClassDemo = defineComponent({
  name: 'CompoundClassDemo',
  setup() {
    const isLoud = ref(false);
    return () => (
      <view class="section-nested">
        <text class="section-label">Compound class · App.css</text>
        <view class="row">
          <view class="badge" testID="compound-badge-plain">
            <text class="badge-text">plain</text>
          </view>
          <view class="badge loud" testID="compound-badge-loud">
            <text class="badge-text">loud</text>
          </view>
          {/* Built at runtime, so the resolver sees a string it never saw at build time */}
          <view class={isLoud.value ? 'badge loud' : 'badge'} testID="compound-badge-dynamic">
            <text class="badge-text">dynamic</text>
          </view>
        </view>
        <text class="note-text" testID="compound-badge-readout">
          {isLoud.value
            ? 'dynamic badge carries both tokens — accent border, same pill shape'
            : 'dynamic badge carries only .badge — grey border'}
        </text>
        <button
          testID="compound-badge-toggle"
          title={isLoud.value ? 'Drop .loud' : 'Add .loud'}
          onPress={() => (isLoud.value = !isLoud.value)}
          color="#42b883"
        />
      </view>
    );
  },
});
