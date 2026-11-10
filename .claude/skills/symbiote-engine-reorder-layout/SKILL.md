---
name: symbiote-engine-reorder-layout
description: "Why a keyed list that only changes ORDER can leave the screen unchanged, and what `materialize` does about it. Read BEFORE touching `hasReorderedChildren`, `dirtyLayoutOf` or the clone branch of `materialize` in `core/engine/cpp/SymbioteTree.cpp`, and when a shuffle, swap or sort of rows with one shared style shows no change until the next add or remove. Trigger on: 'shuffle does nothing', 'reorder not shown', 'rows keep old frames', 'updateYogaChildren', 'Yoga clean on permutation', 'react-reorder-reaches-the-screen'."
---

# A reorder of equal-style children

Yoga's `updateYogaChildren` calls a parent clean when each child at an index has the same style as
the old child at that index. Node identity is not compared.

A permutation of rows that share a style is therefore clean: layout does not run, every row keeps
its old frame, and the tree order changes while the screen does not. The next commit that relayouts
shows the new order, which is why the symptom reads as "works only after add".

## What the engine does

`materialize` hands the clone a changed child list, then calls `dirtyLayoutOf` when
`hasReorderedChildren` finds a slot that holds a node of another family. A new revision of the same
node keeps its family and does not dirty the parent.

That distinction is the point: dirtying on any change would give back the targeted-replace saving,
405 ms down to 3 ms for one row of a list 4 000 wide.

## Proof

`core/engine/cpp/tests/js/react-reorder-reaches-the-screen.itest.tsx` rotates four keyed rows of one
style and reads the frames the platform holds. It was `[40,80,120,0]` before the fix and is
`[0,40,80,120]` after it. Rows with distinct heights were never affected, which is what points at the
style comparison.

## Note on the file's comments

The long rationale comments of `SymbioteTree.cpp` were condensed to the comment budget when this fix
landed. The full text is `git show 6e489781:core/engine/cpp/SymbioteTree.cpp`.
