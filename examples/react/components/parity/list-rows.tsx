export type IRow = { id: string; label: string };

export const ROWS: IRow[] = Array.from({ length: 12 }, (_unused, index) => ({
  id: `row-${index}`,
  label: `Row ${index}`,
}));

export const rowIdOf = (row: IRow): string => row.id;

export function renderPlainRow({ item }: { item: IRow }) {
  return (
    <view className="parity-list-row parity-tint-a">
      <text className="parity-text">{item.label}</text>
    </view>
  );
}
