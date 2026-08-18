// Control Flow — <Show> (fallback, non-keyed accessor child, keyed value child) and <Switch>/<Match>.
//
// THE ONE NAME THAT MOVES. `Switch` and `Match` are imported from `solid-js` here, not from
// `@symbiote-native/solid` — that barrel deliberately withholds both, because RN's own <Switch>
// component owns the name and P0 parity pins it there. The adapter withholds `Match` alongside it
// on purpose: a lone re-exported `Match` next to a `Switch` that means the toggle would compile
// fine and fail at runtime. Aliasing at the import is the whole workaround, and the note under
// the buttons says so on screen rather than only here.
//
// keyed vs non-keyed is a real difference on this renderer, not a style choice. Non-keyed hands
// the child an ACCESSOR and compares its condition with `!a === !b`, so a truthy→truthy change
// updates the leaf and rebuilds nothing. `keyed` hands the raw value and rebuilds the subtree on
// every change — which, with no reconciler underneath, means fresh native views each time.

import { Match, Show, Switch as SwitchFlow, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.presentation;

type IPhase = 'idle' | 'running' | 'done';
type IProfile = { id: number; label: string };

const PROFILES: readonly IProfile[] = [
  { id: 1, label: 'Ada' },
  { id: 2, label: 'Grace' },
  { id: 3, label: 'Barbara' },
];

const PHASES: readonly IPhase[] = ['idle', 'running', 'done'];

export function ShowSwitchDemo() {
  const [index, setIndex] = createSignal(0);
  const [visible, setVisible] = createSignal(true);
  const [phase, setPhase] = createSignal<IPhase>('idle');

  const selected = (): IProfile | undefined =>
    visible() ? PROFILES[index() % PROFILES.length] : undefined;

  return (
    <View class="section-nested">
      <Text class="section-label">Show · Switch · Match</Text>

      <Show
        when={selected()}
        fallback={
          <Text class="subtle" testID="show-fallback">
            fallback — `when` is undefined
          </Text>
        }
      >
        {/* The annotation is REQUIRED, and the reason is the JSX namespace: <Show>'s children
            prop is `JSX.Element | ((item: Accessor<T>) => JSX.Element)` against SOLID-JS's
            Element, which collapses to `any` in a DOM-less program — so the union gives TS no
            signature to infer from and noImplicitAny fires
            (.claude/rules/solid-jsx-namespace.md). Every render-prop child in this app needs one. */}
        {(profile: Accessor<IProfile>) => (
          <View class="ap-panel">
            <Text class="ap-value" testID="show-nonkeyed">
              {`non-keyed child · accessor → ${profile().label} (#${profile().id})`}
            </Text>
          </View>
        )}
      </Show>

      <Show when={selected()} keyed>
        {(profile: IProfile) => (
          <Text class="ap-value" testID="show-keyed">
            {`keyed child · plain value → ${profile.label} (this subtree is rebuilt on every change)`}
          </Text>
        )}
      </Show>

      <SwitchFlow
        fallback={
          <Text class="subtle">no Match matched — Switch fallback</Text>
        }
      >
        <Match when={phase() === 'idle'}>
          <Text class="ap-value" testID="switch-idle">
            Match: idle
          </Text>
        </Match>
        <Match when={phase() === 'running'}>
          <Text class="ap-value" testID="switch-running">
            Match: running
          </Text>
        </Match>
        <Match when={phase() === 'done'}>
          <Text class="ap-value" testID="switch-done">
            Match: done
          </Text>
        </Match>
      </SwitchFlow>

      <View class="ap-wrap">
        <ActionButton
          testID="show-next"
          title="next profile"
          color={ACCENT}
          onPress={() => setIndex(value => value + 1)}
        />
        <ActionButton
          testID="show-toggle"
          title={visible() ? 'clear (show fallback)' : 'restore'}
          color={ACCENT}
          onPress={() => setVisible(value => !value)}
        />
        <ActionButton
          testID="switch-cycle"
          title="cycle phase"
          color={ACCENT}
          onPress={() =>
            setPhase(
              current =>
                PHASES[(PHASES.indexOf(current) + 1) % PHASES.length] ?? 'idle',
            )
          }
        />
      </View>

      <Text class="ap-note" testID="switch-name-note">
        `Switch`/`Match` come from `solid-js` directly: @symbiote-native/solid
        gives the `Switch` name to RN's toggle component, so the control-flow
        pair keeps its canonical home and is aliased at the import.
      </Text>
    </View>
  );
}
