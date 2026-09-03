// Async — createResource · <Suspense> · refetch · mutate · startTransition / useTransition.
//
// Until this screen, createResource had zero coverage in this repo and <Suspense> was only
// name-checked, so everything below is a first real run against a Fabric tree rather than a port
// of a working demo.
//
// The fetcher is a timer, not a network call: the point is the SUSPENSION, and a real request adds
// only flakiness. The 700ms is what makes the fallback long enough to see on device.
//
// The two ways of changing the source are the interesting pair:
//   plain setUserId    — the boundary drops the content and paints the fallback. Native views for
//                        the old profile are torn down and rebuilt when it resolves.
//   startTransition    — the boundary KEEPS the resolved content on screen and reports pending
//                        instead, so nothing is destroyed while the next value is in flight.

import {
  Suspense,
  createResource,
  createSignal,
  startTransition,
  useTransition,
} from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.routing;
const LATENCY_MS = 700;

type IUser = { id: number; name: string; role: string };

const NAMES: readonly string[] = ['Ada', 'Grace', 'Barbara', 'Katherine'];

function fetchUser(id: number): Promise<IUser> {
  return new Promise(resolve => {
    setTimeout(
      () =>
        resolve({
          id,
          name: NAMES[id % NAMES.length] ?? 'Unknown',
          role: id % 2 === 0 ? 'engine' : 'renderer',
        }),
      LATENCY_MS,
    );
  });
}

export function ResourceSuspenseDemo() {
  const [userId, setUserId] = createSignal(0);
  const [user, { refetch, mutate }] = createResource(userId, fetchUser);

  // The pending accessor is global to Solid's transition state, so it reports on the standalone
  // startTransition above just as it would on this tuple's own start function.
  const [pending] = useTransition();

  return (
    <View class="section-nested">
      <Text class="section-label">
        createResource · Suspense · refetch · mutate · transitions
      </Text>

      <Suspense
        fallback={
          <Text class="subtle" testID="resource-fallback">
            Suspense fallback — resource pending
          </Text>
        }
      >
        <View class="ap-panel">
          <Text class="ap-value" testID="resource-user">
            {`#${user()?.id ?? '—'} ${user()?.name ?? ''} · ${user()?.role ?? ''}`}
          </Text>
        </View>
      </Suspense>

      <Text class="subtle" testID="resource-state">
        {`state=${user.state} · loading=${String(user.loading)} · transition pending=${String(pending())}`}
      </Text>

      <View class="ap-wrap">
        <ActionButton
          testID="resource-next-plain"
          title="next user (fallback shows)"
          color={ACCENT}
          onPress={() => setUserId(id => id + 1)}
        />
        <ActionButton
          testID="resource-next-transition"
          title="next user (startTransition)"
          color={ACCENT}
          onPress={() => {
            startTransition(() => setUserId(id => id + 1));
          }}
        />
        <ActionButton
          testID="resource-refetch"
          title="refetch()"
          color={ACCENT}
          onPress={() => {
            refetch();
          }}
        />
        <ActionButton
          testID="resource-mutate"
          title="mutate() — local write, no fetch"
          color={ACCENT}
          onPress={() =>
            mutate(current =>
              current === undefined
                ? current
                : { ...current, name: `${current.name} (mutated)` },
            )
          }
        />
      </View>
    </View>
  );
}
