import { For } from 'solid-js';

type IChoiceRowProps<T extends string> = {
  testID: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  color: string;
};

const SELECTED_TEXT_COLOR = '#0b1622';

// A row of pills for an option with a few fixed values, the chosen one is filled
export function ChoiceRow<T extends string>(props: IChoiceRowProps<T>) {
  return (
    <view testID={props.testID} class="choice-row">
      <For each={props.options}>
        {option => {
          const isSelected = () => option === props.value;
          return (
            <pressable
              testID={`${props.testID}-${option}`}
              class="choice-chip"
              onPress={() => props.onChange(option)}
              style={{
                borderColor: props.color,
                backgroundColor: isSelected() ? props.color : 'transparent',
              }}
            >
              <text
                class="choice-chip-text"
                style={{ color: isSelected() ? SELECTED_TEXT_COLOR : props.color }}
              >
                {option}
              </text>
            </pressable>
          );
        }}
      </For>
    </view>
  );
}
