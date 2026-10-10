// The scope a list shares with the lists nested in its cells (RN's `VirtualizedListContext`)
// Every adapter only carries this object down its own context mechanism, the rules live here

export type IChildRegistry<TList> = {
  add(list: TList, cellKey: string): void;
  remove(list: TList): void;
  forEach(visit: (list: TList) => void): void;
  forEachInCell(cellKey: string, visit: (list: TList) => void): void;
  anyInCell(cellKey: string, test: (list: TList) => boolean): boolean;
  size(): number;
};

// The nested lists of one parent, grouped by the cell they sit in
export function createChildRegistry<TList>(): IChildRegistry<TList> {
  const byCell = new Map<string, Set<TList>>();
  const cellOf = new Map<TList, string>();
  return {
    add(list, cellKey): void {
      if (cellOf.has(list)) {
        throw new Error('Trying to add already present child list');
      }
      const lists = byCell.get(cellKey) ?? new Set<TList>();
      lists.add(list);
      byCell.set(cellKey, lists);
      cellOf.set(list, cellKey);
    },
    remove(list): void {
      const cellKey = cellOf.get(list);
      if (cellKey === undefined) {
        throw new Error('Trying to remove non-present child list');
      }
      cellOf.delete(list);
      const lists = byCell.get(cellKey);
      lists?.delete(list);
      if (lists?.size === 0) byCell.delete(cellKey);
    },
    forEach(visit): void {
      for (const lists of byCell.values()) {
        for (const list of lists) visit(list);
      }
    },
    forEachInCell(cellKey, visit): void {
      for (const list of byCell.get(cellKey) ?? []) visit(list);
    },
    anyInCell(cellKey, test): boolean {
      for (const list of byCell.get(cellKey) ?? []) {
        if (test(list)) return true;
      }
      return false;
    },
    size: (): number => cellOf.size,
  };
}
