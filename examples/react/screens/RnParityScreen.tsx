import { A11yParity } from '../components/parity/A11yParity';
import { ListParity } from '../components/parity/ListParity';
import { ListSlotsParity } from '../components/parity/ListSlotsParity';
import {
  AppStateWatch,
  BackHandlerWatch,
  KeyboardWatch,
  NativeValueListener,
} from '../components/parity/LiveEvents';
import { ModuleProbes } from '../components/parity/ModuleProbes';
import { isAndroid } from '../components/parity/ParityCard';
import { TextInputParity } from '../components/parity/TextInputParity';
import { TextParity } from '../components/parity/TextParity';
import { ViewParity } from '../components/parity/ViewParity';
import { ROUTE_NAME } from '../routes';
import { ROUTE_LINE_INFO } from '../navigation-lines';
import './RnParity.css';

function ParityHero() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.RnParity];
  return (
    <>
      <view className="line-tag line-tag-introspection">
        <text className="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
      </view>
      <view className="hero-card">
        <view className="parity-hero-badge">
          <text className="hero-badge-text">RN</text>
        </view>
        <view className="hero-copy">
          <text className="hero-title">RN behavior parity</text>
          <text className="hero-body">
            One card per behavior that was changed to match React Native 0.86.
            PASS and FAIL are decided by the code, LOOK is for your eyes or a
            screen reader.
          </text>
        </view>
      </view>
    </>
  );
}

function Section({ title }: { title: string }) {
  return <text className="parity-section">{title}</text>;
}

export function RnParityScreen() {
  return (
    <safe-area-view className="screen">
      <scroll-view
        testID="rn-parity-scroll"
        className="screen"
        contentContainerStyle="scroll-content"
        keyboardShouldPersistTaps="handled"
      >
        <ParityHero />
        <Section title="RUNTIME MODULES, SELF-CHECKING" />
        <ModuleProbes />
        <Section title="LIVE EVENTS" />
        <NativeValueListener />
        <AppStateWatch />
        <KeyboardWatch />
        {isAndroid && <BackHandlerWatch />}
        <Section title="TEXT" />
        <TextParity />
        <Section title="TEXTINPUT" />
        <TextInputParity />
        <Section title="VIEWS AND TOUCH" />
        <ViewParity />
        <Section title="ACCESSIBILITY AND IMAGE" />
        <A11yParity />
        <Section title="LISTS" />
        <ListParity />
        <ListSlotsParity />
      </scroll-view>
    </safe-area-view>
  );
}
