import { splitProps } from 'solid-js';
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
export function LabeledChoice<T extends string>(props: ILabeledChoiceProps<T>) {
  const [own, choice] = splitProps(props, ['label']);
  return (
    <>
      <text class="switch-label">{own.label}</text>
      <ChoiceRow {...choice} />
    </>
  );
}
