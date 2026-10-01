import { For } from 'solid-js';
import type { JSX } from 'solid-js';
import { ActionButton } from './ActionButton';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

type IScreenShellProps = {
  route: ITourRouteName;
  title: string;
  body: string;
  testID: string;
  children: JSX.Element;
};

// Line tag + hero card + scroll container shared by every demo screen
export function ScreenShell(props: IScreenShellProps) {
  const lineInfo = () => ROUTE_LINE_INFO[props.route];
  return (
    <safe-area-view class="screen">
      <scroll-view
        testID={props.testID}
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class={`line-tag line-tag-${lineInfo().line}`}>
          <text class="line-tag-text">{`${lineInfo().code} · ${lineInfo().label}`}</text>
        </view>
        <view class="hero-card">
          <view
            class="hero-badge"
            style={{ backgroundColor: LINE_COLOR[lineInfo().line] }}
          >
            <text class="hero-badge-text">{lineInfo().code}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">{props.title}</text>
            <text class="hero-body">{props.body}</text>
          </view>
        </view>
        {props.children}
      </scroll-view>
    </safe-area-view>
  );
}

export function lineColorOf(route: ITourRouteName): string {
  return LINE_COLOR[ROUTE_LINE_INFO[route].line];
}

type ICardProps = { testID: string; title: string; children: JSX.Element };

export function Card(props: ICardProps) {
  return (
    <view testID={props.testID} class="feature-card">
      <view class="feature-card-header">
        <text class="feature-card-title">{props.title}</text>
      </view>
      {props.children}
    </view>
  );
}

type IResultRowProps = { testID: string; label: string; value: string };

export function ResultRow(props: IResultRowProps) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <text testID={props.testID} class="value-text">
        {props.value}
      </text>
    </view>
  );
}

type IFieldProps = {
  testID: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
};

export function Field(props: IFieldProps) {
  return (
    <view>
      <text class="capability-label">{props.label}</text>
      <text-input
        testID={props.testID}
        value={props.value}
        onValueChange={event => props.onChange(event.text)}
        placeholder={props.placeholder}
        placeholderTextColor="#41506a"
        autoCapitalize="none"
        multiline={props.multiline}
        class="text-input"
      />
    </view>
  );
}

type IChoiceRowProps<T extends string | number | boolean | undefined> = {
  testID: string;
  label: string;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  color: string;
};

export function ChoiceRow<T extends string | number | boolean | undefined>(
  props: IChoiceRowProps<T>,
) {
  return (
    <view testID={props.testID}>
      <text class="capability-label">{props.label}</text>
      <view class="button-row">
        <For each={props.options}>
          {option => (
            <ActionButton
              testID={`${props.testID}-${option.label}`}
              title={option.value === props.value ? `● ${option.label}` : option.label}
              onPress={() => props.onChange(option.value)}
              color={props.color}
            />
          )}
        </For>
      </view>
    </view>
  );
}

type IToggleRowProps = {
  testID: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
};

export function ToggleRow(props: IToggleRowProps) {
  return (
    <view class="capability-row">
      <text class="capability-label">{props.label}</text>
      <switch
        testID={props.testID}
        value={props.value}
        onValueChange={event => props.onChange(event.value)}
        trackColor={{ true: props.color }}
      />
    </view>
  );
}
