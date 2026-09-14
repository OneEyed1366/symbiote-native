import { Component, createRef, useState } from 'react';
import { findNodeHandle, type IHostInstance } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { LINE_COLOR } from '../navigation-lines';

type ILegacyRefHolderProps = Record<string, never>;
type ILegacyRefHolderState = { tag: number | null };

// createRef(): a ref object created OUTSIDE render, primarily for class components — the
// `ref` prop below attaches it to a host View exactly like a Hook-based ref would.
class LegacyRefHolder extends Component<
  ILegacyRefHolderProps,
  ILegacyRefHolderState
> {
  boxRef = createRef<IHostInstance>();
  state: ILegacyRefHolderState = { tag: null };

  componentDidMount(): void {
    this.setState({ tag: findNodeHandle(this.boxRef.current) });
  }

  render() {
    return (
      <view ref={this.boxRef} testID="refs-createref-box" className="ref-box">
        <text className="ref-box-text">{`createRef() target — tag ${this.state.tag ?? '—'}`}</text>
      </view>
    );
  }
}

export function RefsApiDemo() {
  const [attachLog, setAttachLog] = useState('not attached yet');
  const [showCallbackTarget, setShowCallbackTarget] = useState(true);

  return (
    <view className="section-nested">
      <text className="section-label">
        ref prop · ref callback with cleanup · createRef()
      </text>
      {showCallbackTarget && (
        // A ref callback returning a cleanup function (React 19): fires on attach, then the
        // returned function fires on detach — proven by toggling the target below.
        <view
          testID="refs-callback-box"
          className="ref-box"
          ref={node => {
            setAttachLog(`attached, tag ${findNodeHandle(node)}`);
            return () => setAttachLog('detached (cleanup ran)');
          }}
        >
          <text className="ref-box-text">ref callback target</text>
        </view>
      )}
      <text
        testID="refs-attach-log"
        className="info-text"
      >{`ref callback: ${attachLog}`}</text>
      <ActionButton
        testID="refs-toggle-callback-target"
        title={showCallbackTarget ? 'Unmount (triggers cleanup)' : 'Mount'}
        onPress={() => setShowCallbackTarget(current => !current)}
        color={LINE_COLOR.introspection}
      />
      <LegacyRefHolder />
    </view>
  );
}
