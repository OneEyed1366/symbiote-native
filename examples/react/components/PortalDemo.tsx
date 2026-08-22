import { useState } from 'react';
import {
  View,
  Text,
  createPortal,
  type IHostInstance,
} from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { CaveatNote } from './CaveatNote';
import { LINE_COLOR } from '../navigation-lines';

export function PortalDemo() {
  // A ref callback (not useRef): refs attach during commit, after render returns, so a plain
  // useRef would still read null on the very first render — same reasoning as CanaryScreen's
  // own overlayHost.
  const [portalHost, setPortalHost] = useState<IHostInstance | null>(null);
  const [visible, setVisible] = useState(false);

  return (
    <View className="section-nested">
      <Text className="section-label">createPortal</Text>
      <ActionButton
        testID="portal-toggle"
        title={
          visible ? 'Hide ported content' : 'Show ported content (createPortal)'
        }
        onPress={() => setVisible(current => !current)}
        color={LINE_COLOR.introspection}
      />
      <Text className="note-text">
        host box below is a sibling in this same tree — createPortal moves
        content into it without moving it in the JSX tree
      </Text>
      {/* The portal TARGET: an already-mounted, empty sibling view — createPortal below reaches
          into it from elsewhere in the tree, mirroring CanaryScreen's overlay-host/toast pair. */}
      <View ref={setPortalHost} testID="portal-host" className="ref-box">
        <Text className="ref-box-text">portal host</Text>
      </View>
      {visible &&
        portalHost !== null &&
        createPortal(
          <Text testID="portal-content" className="ref-box-text">
            ported content
          </Text>,
          portalHost,
        )}
      <CaveatNote testID="portal-caveat">
        This adapter's createPortal is same-surface-only — the target must
        already be mounted in the SAME surface as the call site
        (react-adapter-portal skill); it can't reach a second,
        independently-mounted surface the way react-dom's createPortal reaches
        an arbitrary DOM node.
      </CaveatNote>
    </View>
  );
}
