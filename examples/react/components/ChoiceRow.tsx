type IChoiceRowProps<T extends string> = {
  testID: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  color: string;
};

const SELECTED_TEXT_COLOR = '#0b1622';

// A row of pills for an option with a few fixed values, the chosen one is filled
export function ChoiceRow<T extends string>({
  testID,
  value,
  options,
  onChange,
  color,
}: IChoiceRowProps<T>) {
  return (
    <view testID={testID} className="choice-row">
      {options.map(option => {
        const isSelected = option === value;
        return (
          <pressable
            key={option}
            testID={`${testID}-${option}`}
            className="choice-chip"
            onPress={() => onChange(option)}
            style={{
              borderColor: color,
              backgroundColor: isSelected ? color : 'transparent',
            }}
          >
            <text
              className="choice-chip-text"
              style={{ color: isSelected ? SELECTED_TEXT_COLOR : color }}
            >
              {option}
            </text>
          </pressable>
        );
      })}
    </view>
  );
}
