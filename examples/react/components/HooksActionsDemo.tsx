import {
  createContext,
  Suspense,
  use,
  useActionState,
  useOptimistic,
  useState,
} from 'react';
import { Text, View } from '@symbiote-native/react';
import { ActionButton } from './ActionButton';
import { CaveatNote } from './CaveatNote';
import { LINE_COLOR } from '../navigation-lines';

const GreetingContext = createContext('hello');

// A promise created ONCE at module scope — use() re-suspends on a NEW promise identity every
// render if you construct one inline, which would never settle.
const greetingDataPromise: Promise<string> = new Promise(resolve => {
  setTimeout(() => resolve('symbiote server data (simulated)'), 300);
});

type IUsePromiseDemoProps = { showContext: boolean };

function UsePromiseDemo({ showContext }: IUsePromiseDemoProps) {
  // use(Promise): suspends on first render until greetingDataPromise settles, then reads its
  // value directly — no useEffect/useState round trip needed.
  const serverData = use(greetingDataPromise);
  // use(Context): unlike useContext, `use` can be called conditionally — this branch is real.
  const greeting = showContext ? use(GreetingContext) : 'context skipped';
  return (
    <Text
      testID="hooks-actions-use"
      className="info-text"
    >{`use(): "${serverData}" · ${greeting}`}</Text>
  );
}

async function submitName(_previous: string, payload: string): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 250));
  return `saved "${payload}"`;
}

export function HooksActionsDemo() {
  const [showContext, setShowContext] = useState(true);
  const [savedName, submitAction, isSubmitting] = useActionState<
    string,
    string
  >(submitName, 'nothing saved yet');
  const [realItems, setRealItems] = useState<string[]>(['starter item']);
  const [items, addOptimisticItem] = useOptimistic<string[], string>(
    realItems,
    (current, newItem) => [...current, `${newItem} (saving…)`],
  );

  const onAddOptimistic = (): void => {
    // Shown immediately, then reconciled once the "save" resolves — React docs pair this with
    // startTransition inside a form Action; called directly here for a single onPress demo.
    const label = `item ${realItems.length + 1}`;
    addOptimisticItem(label);
    setTimeout(() => setRealItems(current => [...current, label]), 500);
  };

  return (
    <GreetingContext value="hello from GreetingContext">
      <View className="section-nested">
        <Text className="section-label">
          useActionState · useOptimistic · use
        </Text>
        <Suspense
          fallback={<Text className="info-text">loading via use()…</Text>}
        >
          <UsePromiseDemo showContext={showContext} />
        </Suspense>
        <ActionButton
          testID="hooks-actions-toggle-context"
          title="Toggle conditional use(Context) branch"
          onPress={() => setShowContext(current => !current)}
          color={LINE_COLOR.introspection}
        />
        <Text testID="hooks-actions-state" className="info-text">
          {`useActionState: ${savedName}${isSubmitting ? ' (pending…)' : ''}`}
        </Text>
        <ActionButton
          testID="hooks-actions-submit"
          title="Submit name via Action"
          onPress={() => submitAction('symbiote')}
          color={LINE_COLOR.introspection}
        />
        {items.map((item, index) => (
          <Text key={`${item}-${index}`} className="list-row-text">
            {item}
          </Text>
        ))}
        <ActionButton
          testID="hooks-actions-optimistic"
          title="Add item optimistically"
          onPress={onAddOptimistic}
          color={LINE_COLOR.introspection}
        />
        <CaveatNote testID="hooks-actions-caveat">
          useActionState has no form primitive to integrate with (Symbiote has
          no form component), so it's driven manually from onPress; it's also
          built on Transitions, so it shares useTransition's LegacyRoot caveat —
          the pending flag collapses onto the sync lane.
        </CaveatNote>
      </View>
    </GreetingContext>
  );
}
