// Shared subscribe/unsubscribe lifecycle for every panel in this plugin — each panel is its own
// Rozenite tab (own React tree, own useRozeniteDevToolsClient call), but they all want the exact
// same "subscribe on mount, unsubscribe on unmount, collect snapshots" behavior against the same
// app-side broadcast (react-native.ts's registerPostCommit hook sends one snapshot per commit to
// every subscribed panel, regardless of how many are open).
import { useEffect, useState } from 'react';
import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import {
  DEVTOOLS_PLUGIN_ID,
  type IDevtoolsEvents,
  type ISerializedSurface,
} from './protocol';

export function useDevtoolsSnapshot(): {
  client: ReturnType<typeof useRozeniteDevToolsClient<IDevtoolsEvents>>;
  surfaces: ISerializedSurface[];
} {
  const client = useRozeniteDevToolsClient<IDevtoolsEvents>({
    pluginId: DEVTOOLS_PLUGIN_ID,
  });
  const [surfaces, setSurfaces] = useState<ISerializedSurface[]>([]);

  useEffect(() => {
    if (!client) return;

    client.send('subscribe', null);
    const subscription = client.onMessage('snapshot', setSurfaces);

    return () => {
      subscription.remove();
      client.send('unsubscribe', null);
    };
  }, [client]);

  return { client, surfaces };
}
