type IHeaderTapViewProps = {
  testID: string;
  label: string;
  onPress: () => void;
};

// A small tappable pill for the custom views of a native header
export function HeaderTapView({ testID, label, onPress }: IHeaderTapViewProps) {
  return (
    <pressable testID={testID} onPress={onPress} className="header-view">
      <text className="header-view-text">{label}</text>
    </pressable>
  );
}
