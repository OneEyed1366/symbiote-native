// Which cells of a list render and which collapse into spacers, a port of RN's `CellRenderMask`
// Regions are inclusive ranges that tile `0..numCells-1`, a spacer region is a run left unrendered

export type ICellRegion = {
  first: number;
  last: number;
  isSpacer: boolean;
};

type ICellRange = { first: number; last: number };

export class CellRenderMask {
  private readonly cellCount: number;
  private readonly regions: ICellRegion[];

  constructor(numCells: number) {
    if (numCells < 0) {
      throw new Error(
        'CellRenderMask must contain a non-negative number of cells',
      );
    }
    this.cellCount = numCells;
    this.regions =
      numCells === 0 ? [] : [{ first: 0, last: numCells - 1, isSpacer: true }];
  }

  enumerateRegions(): readonly ICellRegion[] {
    return this.regions;
  }

  numCells(): number {
    return this.cellCount;
  }

  // A zero-count range such as `{first: 0, last: -1}` is valid and adds nothing
  addCells(cells: ICellRange): void {
    const isValid =
      cells.first >= 0 &&
      cells.first < this.cellCount &&
      cells.last >= -1 &&
      cells.last < this.cellCount &&
      cells.last >= cells.first - 1;
    if (!isValid) {
      throw new Error('CellRenderMask.addCells called with invalid cell range');
    }
    if (cells.last < cells.first) return;

    const [firstIntersect, firstIntersectIdx] = this.findRegion(cells.first);
    const [lastIntersect, lastIntersectIdx] = this.findRegion(cells.last);

    // Already fully present, nothing to mutate
    if (firstIntersectIdx === lastIntersectIdx && !firstIntersect.isSpacer) {
      return;
    }

    const main: ICellRegion = { ...cells, isSpacer: false };
    const lead: ICellRegion[] = [];
    const tail: ICellRegion[] = [];

    if (firstIntersect.first < main.first) {
      if (firstIntersect.isSpacer) {
        lead.push({
          first: firstIntersect.first,
          last: main.first - 1,
          isSpacer: true,
        });
      } else {
        main.first = firstIntersect.first;
      }
    }

    if (lastIntersect.last > main.last) {
      if (lastIntersect.isSpacer) {
        tail.push({
          first: main.last + 1,
          last: lastIntersect.last,
          isSpacer: true,
        });
      } else {
        main.last = lastIntersect.last;
      }
    }

    this.regions.splice(
      firstIntersectIdx,
      lastIntersectIdx - firstIntersectIdx + 1,
      ...lead,
      main,
      ...tail,
    );
  }

  equals(other: CellRenderMask): boolean {
    return (
      this.cellCount === other.cellCount &&
      this.regions.length === other.regions.length &&
      this.regions.every((region, index) => {
        const peer = other.regions[index];
        return (
          peer !== undefined &&
          region.first === peer.first &&
          region.last === peer.last &&
          region.isSpacer === peer.isSpacer
        );
      })
    );
  }

  private findRegion(cellIdx: number): [ICellRegion, number] {
    let low = 0;
    let high = this.regions.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      const region = this.regions[middle];
      if (region === undefined) break;
      if (cellIdx >= region.first && cellIdx <= region.last) {
        return [region, middle];
      }
      if (cellIdx < region.first) high = middle - 1;
      else low = middle + 1;
    }
    throw new Error(`A region was not found containing cellIdx ${cellIdx}`);
  }
}
