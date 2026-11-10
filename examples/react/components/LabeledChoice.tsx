import { ChoiceRow } from './ChoiceRow';

type ILabeledChoiceProps<T extends string> = {
  testID: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  color: string;
};

// A caption over a row of pills, for panels that hold several choices
export function LabeledChoice<T extends string>({
  label,
  ...choice
}: ILabeledChoiceProps<T>) {
  return (
    <>
      <text className="switch-label">{label}</text>
      <ChoiceRow {...choice} />
    </>
  );
}
