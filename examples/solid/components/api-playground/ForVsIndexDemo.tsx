// Control Flow — <For> vs <Index>, and createSelector.
//
// The distinction is usually explained with DOM nodes; here it is native views, so it is worth
// making measurable rather than descriptive. Each row stamps the render pass that BORN it:
//
//   rename first row → the value at index 0 changes identity.
//                      <For> keys by value → row 0 is torn down and a new native view is created.
//                      <Index> keys by position → the same view survives, only its text is set.
//   rotate           → the same three values move position.
//                      <For> moves the existing views. <Index> keeps the views and rewrites all
//                      three labels.
//
// createSelector is the third piece: selecting a row updates exactly the two rows whose state
// changed, not the whole list, because it keeps a per-key subscriber set instead of one signal
// every row reads.

import { For, Index, createSelector, createSignal } from 'solid-js';
import { Pressable, Text, View } from '@symbiote-native/solid';
import { ActionButton } from '../ActionButton';
import { LINE_COLOR } from '../../navigation-lines';

const ACCENT = LINE_COLOR.structure;
const INITIAL_LABELS: readonly string[] = ['alpha', 'beta', 'gamma'];

export function ForVsIndexDemo() {
  const [labels, setLabels] = createSignal<readonly string[]>(INITIAL_LABELS);
  const [pass, setPass] = createSignal(0);
  const [selected, setSelected] = createSignal(0);

  // Per-key boolean accessor. A row reads isSelected(i) and only the two rows whose answer
  // actually flipped re-run.
  const isSelected = createSelector(selected);

  const bump = (): void => {
    setPass(value => value + 1);
  };

  const renameFirst = (): void => {
    bump();
    setLabels(current => [`alpha-${pass() + 1}`, ...current.slice(1)]);
  };

  const rotate = (): void => {
    bump();
    setLabels(current => [...current.slice(1), ...current.slice(0, 1)]);
  };

  return (
    <View class="section-nested">
      <Text class="section-label">For · Index · createSelector</Text>

      <Text class="subtle">{`<For> — keyed by value · pass ${pass()}`}</Text>
      <For each={labels()}>
        {(label, position) => {
          // Runs once per KEY, under its own root, so a plain const is right: a new value means a
          // new row, and this stamp is exactly what makes that visible.
          const bornAt = pass();
          return (
            <Pressable
              class={isSelected(position()) ? 'ap-item ap-item-on' : 'ap-item'}
              testID={`for-row-${position()}`}
              onPress={() => setSelected(position())}
            >
              {() => (
                <Text class="ap-item-text">
                  {`${label} · row created on pass ${bornAt}`}
                </Text>
              )}
            </Pressable>
          );
        }}
      </For>

      <Text class="subtle">{`<Index> — keyed by position · pass ${pass()}`}</Text>
      <Index each={labels()}>
        {(label, position) => {
          const bornAt = pass();
          return (
            <View class="ap-item">
              <Text class="ap-item-text" testID={`index-row-${position}`}>
                {`${label()} · row created on pass ${bornAt}`}
              </Text>
            </View>
          );
        }}
      </Index>

      <View class="ap-wrap">
        <ActionButton
          testID="list-rename"
          title="rename first"
          color={ACCENT}
          onPress={renameFirst}
        />
        <ActionButton
          testID="list-rotate"
          title="rotate"
          color={ACCENT}
          onPress={rotate}
        />
        <ActionButton
          testID="list-reset"
          title="reset"
          color={ACCENT}
          onPress={() => {
            bump();
            setLabels(INITIAL_LABELS);
          }}
        />
      </View>
    </View>
  );
}
