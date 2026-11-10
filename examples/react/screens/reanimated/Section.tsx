import type { ReactNode } from 'react';

type ISectionProps = {
  title: string;
  note?: string;
  children: ReactNode;
};

// One titled block of the Reanimated screen
export function Section({ title, note, children }: ISectionProps) {
  return (
    <view className="ra-section">
      <text className="ra-section-title">{title}</text>
      {note === undefined ? null : <text className="ra-note">{note}</text>}
      {children}
    </view>
  );
}
