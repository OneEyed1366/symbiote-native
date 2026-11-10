import { Show, type JSX } from 'solid-js';

type ISectionProps = {
  title: string;
  note?: string;
  children: JSX.Element;
};

// One titled block of the Reanimated screen
export function Section(props: ISectionProps) {
  return (
    <view class="ra-section">
      <text class="ra-section-title">{props.title}</text>
      <Show when={props.note !== undefined}>
        <text class="ra-note">{props.note}</text>
      </Show>
      {props.children}
    </view>
  );
}
