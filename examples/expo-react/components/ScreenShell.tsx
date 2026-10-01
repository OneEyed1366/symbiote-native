import type { ReactNode } from 'react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import type { ITourRouteName } from '../navigation-lines';

type IScreenShellProps = {
  route: ITourRouteName;
  title: string;
  body: string;
  testID: string;
  children: ReactNode;
};

// Line tag + hero card + scroll container shared by every demo screen
export function ScreenShell({
  route,
  title,
  body,
  testID,
  children,
}: IScreenShellProps) {
  const lineInfo = ROUTE_LINE_INFO[route];
  return (
    <safe-area-view className="screen">
      <scroll-view
        testID={testID}
        className="screen"
        contentContainerStyle="scroll-content"
      >
        <view className={`line-tag line-tag-${lineInfo.line}`}>
          <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
        </view>
        <view className="hero-card">
          <view
            className="hero-badge"
            style={{ backgroundColor: LINE_COLOR[lineInfo.line] }}
          >
            <text className="hero-badge-text">{lineInfo.code}</text>
          </view>
          <view className="hero-copy">
            <text className="hero-title">{title}</text>
            <text className="hero-body">{body}</text>
          </view>
        </view>
        {children}
      </scroll-view>
    </safe-area-view>
  );
}

export function lineColorOf(route: ITourRouteName): string {
  return LINE_COLOR[ROUTE_LINE_INFO[route].line];
}

type ICardProps = { testID: string; title: string; children: ReactNode };

export function Card({ testID, title, children }: ICardProps) {
  return (
    <view testID={testID} className="feature-card">
      <view className="feature-card-header">
        <text className="feature-card-title">{title}</text>
      </view>
      {children}
    </view>
  );
}

type IResultRowProps = { testID: string; label: string; value: string };

export function ResultRow({ testID, label, value }: IResultRowProps) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <text testID={testID} className="value-text">
        {value}
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

export function Field({
  testID,
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: IFieldProps) {
  return (
    <view>
      <text className="capability-label">{label}</text>
      <text-input
        testID={testID}
        value={value}
        onValueChange={event => onChange(event.text)}
        placeholder={placeholder}
        placeholderTextColor="#41506a"
        autoCapitalize="none"
        multiline={multiline}
        className="text-input"
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

export function ChoiceRow<T extends string | number | boolean | undefined>({
  testID,
  label,
  options,
  value,
  onChange,
  color,
}: IChoiceRowProps<T>) {
  return (
    <view testID={testID}>
      <text className="capability-label">{label}</text>
      <view className="button-row">
        {options.map(option => (
          <ActionButton
            key={option.label}
            testID={`${testID}-${option.label}`}
            title={option.value === value ? `● ${option.label}` : option.label}
            onPress={() => onChange(option.value)}
            color={color}
          />
        ))}
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

export function ToggleRow({
  testID,
  label,
  value,
  onChange,
  color,
}: IToggleRowProps) {
  return (
    <view className="capability-row">
      <text className="capability-label">{label}</text>
      <switch
        testID={testID}
        value={value}
        onValueChange={event => onChange(event.value)}
        trackColor={{ true: color }}
      />
    </view>
  );
}
