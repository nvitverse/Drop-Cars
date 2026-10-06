# Multi-Session & Parallel Development Guidelines (Claude + Antigravity)

1. **Surgical Edits Only**:
   - Always edit files line-by-line using targeted replacements. Never blindly copy/overwrite entire files across repositories or directories.
2. **Preserve Parallel Changes**:
   - The user runs concurrent sessions with Claude on `Drop-Cars-Full-Repo` and Antigravity. Always inspect the current file state before modifying to ensure no parallel changes, new UI enhancements, buttons, or logic are lost.
3. **Dual-Repo Sync**:
   - Synchronize only the exact diffs between `dropcars-review` and `Drop-Cars-Full-Repo` (which hosts the live dev server).
