// Stores (solid-js/store) — createStore · path setter · produce · reconcile · unwrap.
//
// A store is a deep proxy, and that is the one Solid API with a hard rule on this renderer: never
// put an engine node (a host `ref`, an IHostInstance) inside one. The engine keys its commit
// mirror on node IDENTITY through a WeakMap, and a proxy is a different key — every imperative
// command would silently miss. Stores here hold plain data only; refs stay in signals.
//
// What each button proves, on native views rather than in a console:
//   path setter — setProfile('address', 'city', v) writes one leaf. Only the city line repaints.
//   produce     — the same write spelled imperatively over a draft, still one leaf.
//   reconcile   — a WHOLE new object diffed against the old one instead of replacing it, so the
//                 unchanged fields keep their identity and their leaves are never touched.

import { createSignal } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.structure;

type IProfile = {
  name: string;
  visits: number;
  address: { city: string; zip: string };
  tags: readonly string[];
};

// A FACTORY, not a shared constant: createStore proxies the object it is given and writes through
// to it, so a module-level literal would be mutated by this demo and stop being a clean baseline
// for reconcile below.
function createInitialProfile(): IProfile {
  return {
    name: 'Ada',
    visits: 0,
    address: { city: 'London', zip: 'NW1' },
    tags: ['analytical', 'engine'],
  };
}

const CITIES: readonly string[] = ['London', 'Turin', 'Basel'];

export function StoreDemo() {
  const [profile, setProfile] = createStore<IProfile>(createInitialProfile());
  const [snapshot, setSnapshot] = createSignal('—');

  const nextCity = (): string => {
    const index = CITIES.indexOf(profile.address.city);
    return CITIES[(index + 1) % CITIES.length] ?? 'London';
  };

  return (
    <View class="section-nested">
      <Text class="section-label">
        createStore · produce · reconcile · unwrap
      </Text>
      <Text class="ap-value" testID="store-name">
        {`name: ${profile.name}`}
      </Text>
      <Text class="ap-value" testID="store-city">
        {`address.city: ${profile.address.city} (${profile.address.zip})`}
      </Text>
      <Text class="ap-value" testID="store-visits">
        {`visits: ${profile.visits} · tags: ${profile.tags.join(', ')}`}
      </Text>
      <View class="ap-wrap">
        <ActionButton
          testID="store-path-set"
          title="path setter → city"
          color={ACCENT}
          onPress={() => setProfile('address', 'city', nextCity())}
        />
        <ActionButton
          testID="store-produce"
          title="produce → visits + 1, push tag"
          color={ACCENT}
          onPress={() =>
            setProfile(
              produce(draft => {
                draft.visits += 1;
                draft.tags = [...draft.tags, `visit-${draft.visits}`];
              }),
            )
          }
        />
        <ActionButton
          testID="store-reconcile"
          title="reconcile → whole new object, diffed"
          color={ACCENT}
          onPress={() =>
            setProfile(
              reconcile({
                ...createInitialProfile(),
                name: profile.name === 'Ada' ? 'Grace' : 'Ada',
                visits: profile.visits,
                address: { city: profile.address.city, zip: 'RC-1' },
                tags: profile.tags,
              }),
            )
          }
        />
        <ActionButton
          testID="store-unwrap"
          title="unwrap → plain object"
          color={ACCENT}
          onPress={() => setSnapshot(JSON.stringify(unwrap(profile)))}
        />
      </View>
      <Text class="subtle" testID="store-snapshot">
        {`unwrap(): ${snapshot()}`}
      </Text>
    </View>
  );
}
