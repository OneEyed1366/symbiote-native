import type { IViewProps } from '@symbiote-native/react';
import { ParityCard } from './ParityCard';

const ROLES = ['dialog', 'tooltip', 'alert', 'menu'] as const satisfies readonly NonNullable<
  IViewProps['role']
>[];

// A role outside the old 28-name table used to reach Android as an invalid `accessibilityRole`
function RoleList() {
  return (
    <ParityCard
      title="role goes to native as written"
      rn="role travels next to accessibilityRole, any ARIA role is accepted"
      look="the four lines render. Android used to red-box on dialog. Inspector: role is read"
    >
      {ROLES.map(role => (
        <view key={role} accessible role={role} className="parity-role-row">
          <text className="parity-text">{`role="${role}"`}</text>
        </view>
      ))}
    </ParityCard>
  );
}

function AriaWinsOverLegacy() {
  return (
    <ParityCard
      title="aria-label beats accessibilityLabel"
      rn="View reads the aria-* prop before its accessibility* twin"
      look="VoiceOver or TalkBack reads 'from aria-label', never 'from the legacy prop'"
    >
      <view
        accessible
        aria-label="from aria-label"
        accessibilityLabel="from the legacy prop"
        className="parity-role-row"
      >
        <text className="parity-text">focus this row with a screen reader</text>
      </view>
    </ParityCard>
  );
}

function LoneAriaState() {
  return (
    <ParityCard
      title="A lone aria-busy reaches Android"
      rn="accessibilityState carries busy without the other fields being null"
      look="TalkBack announces the first row as busy, the second one is the plain control"
    >
      <view accessible aria-busy className="parity-role-row">
        <text className="parity-text">aria-busy only</text>
      </view>
      <view accessible className="parity-role-row">
        <text className="parity-text">no state</text>
      </view>
    </ParityCard>
  );
}

function ButtonEmptyAriaLabel() {
  return (
    <ParityCard
      title="Button with an empty aria-label"
      rn="an empty aria-label falls back to accessibilityLabel"
      look="a screen reader reads 'Pay the order', not an empty label"
    >
      <button
        title="Pay"
        aria-label=""
        accessibilityLabel="Pay the order"
        onPress={() => undefined}
      />
    </ParityCard>
  );
}

// The two images carry no uri at all: one empty source is committed instead of none
function ImageWithoutSource() {
  return (
    <ParityCard
      title="Image without a source"
      rn="commits one empty source, native reads scale 1 and a remote type"
      look="two empty frames and no red box. Metro logs a warning for the empty srcSet"
    >
      <view className="row">
        <image className="parity-image" />
        <image srcSet="" className="parity-image" />
      </view>
    </ParityCard>
  );
}

export function A11yParity() {
  return (
    <>
      <RoleList />
      <AriaWinsOverLegacy />
      <LoneAriaState />
      <ButtonEmptyAriaLabel />
      <ImageWithoutSource />
    </>
  );
}
