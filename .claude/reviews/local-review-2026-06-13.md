# Local Code Review: EDM Embed Backspace/Cursor Fix (v2)

**Reviewed**: 2026-06-13
**Branch**: main (uncommitted)
**Decision**: APPROVE
**Plans**: [[image-backspace-cursor-fix]] (v1) → [[backspace-backspace-glowing-tide]] (v2)

## Summary

Comprehensive fix for the bug where clicking to the right of an image embed placed the cursor inside the embed element (on Quill's `rightGuard` U+FEFF text node), preventing Backspace from deleting it. The v2 fix adds `DOCUMENT_POSITION_CONTAINED_BY` handling in the selection-change handler and a `getLeaf(range.index)` fallback in the Backspace handler, accounting for Quill's internal `normalizedToRange()` shortcut bug that maps `rightGuard` at offset 0 to position I instead of I+1.

## Findings

### CRITICAL
None.

### HIGH
None.

### MEDIUM

**1. Repeated `(leaf as any).statics?.blotName` pattern (6 occurrences)**

File: `src/editor/useEdmEditor.ts`, lines 152, 166, 179, 207, 672 (+ 2 pre-existing)

The same Quill internal type access pattern appears 6 times. A shared helper like `isEdmEmbedBlot(leaf)` would reduce duplication and prevent typos when new EDM blot types are added. This is a maintainability concern — no functional bug.

### LOW

**2. No test coverage**

File: project-wide

The project has no test infrastructure. The new keyboard/selection handlers would benefit from unit tests covering: Backspace after embed (I+1), Backspace on embed (I fallback), Backspace in normal text, Delete on embed, FOLLOWING case, CONTAINED_BY rightGuard case, CONTAINED_BY leftGuard case.

**3. Loose parameter types on `handleSelectionChange`**

File: `src/editor/useEdmEditor.ts`, line 197

`_range: unknown, _oldRange: unknown` — could use `import('quill').Range | null`. No functional impact since parameters are unused (prefixed with `_`).

**4. 2 pre-existing `no-irregular-whitespace` lint errors**

File: `src/editor/useEdmEditor.ts`, lines 581-582

`&nbsp;` in `preserveConsecutiveSpaces` (from commit `6f39be8`). Intentional, predates this change.

## What Was Verified

| Category | Result |
|---|---|
| Security | No injection, secrets, or XSS vectors |
| Correctness | Backspace/Delete/selection logic correct; edge cases guarded |
| Event Lifecycle | All listeners properly cleaned up in `onBeforeUnmount` |
| Null Safety | `quill`, `range`, `leaf`, `embedDom`, `nativeSel` all null-guarded |
| Immutability | No mutation — `deleteText`/`setSelection` are Quill APIs |

## Validation Results

| Check | Result |
|---|---|
| Type check (`vue-tsc --noEmit`) | Pass |
| Lint (`eslint`) | 2 pre-existing errors (unrelated) |
| File size | 757 lines (under 800) |
| Function size | All new functions under 40 lines |
| Nesting depth | Max 3 levels |
