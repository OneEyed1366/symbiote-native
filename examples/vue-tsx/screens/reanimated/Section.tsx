import { defineComponent, type VNodeChild } from 'vue';

type ISlots = { default?: () => VNodeChild };

// One titled block of the Reanimated screen
export const Section = defineComponent<{ title: string; note?: string }>(
  (props, { slots }: { slots: ISlots }) => {
    return () => (
      <view class="ra-section">
        <text class="ra-section-title">{props.title}</text>
        {props.note === undefined ? null : (
          <text class="ra-note">{props.note}</text>
        )}
        {slots.default?.()}
      </view>
    );
  },
  { name: 'Section', props: ['title', 'note'] },
);
