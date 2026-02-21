
## High Priority / Blocking

- [x] Projects / Boards - different boards for different task groups
- [x] Project creation flow broken or incomplete (was working, verified)
- [x] Project color assignment not persisting (was working, verified)
- [x] Inbox stuck in permanent loading state (was working, verified)
- [x] Notes stuck in permanent loading state (was working, verified)

## Design Overhaul (Awaystar-Inspired)

- [x] Phase 1: Global design tokens (colors, radii, shadows, typography)
- [x] Phase 2: App frame wrapper with contained feel
- [x] Phase 3: Card-based task layout with pill badges
- [x] Phase 4: Segmented pill filter controls
- [x] Phase 5: Sidebar & button updates (pill-shaped, ghost variants)
- [x] Update all hardcoded colors to use design tokens throughout

## Medium Priority

- [x] Editable workflow tabs (rename, add, delete, reorder)
- [x] Add Kanban board view (in addition to list view)
- [x] Toggle between Kanban/List view per project
- [x] Consolidate two Slack sync buttons into one (removed header button, kept sidebar)
- [x] Better Slack button copy - changed to "Import from Slack"
- [ ] Replace Quick Add button with Command-K (Ask AI)
- [x] Restore floating Command-K button (bottom-right)

## Polish / UX Debt

- [x] Settings icon not clickable - added onclick with placeholder notification
- [x] Description font inconsistent - added font-family: inherit
- [x] Task slide-out action buttons non-functional - removed thumbs up, paperclip, three-dot menu
- [x] Replace emojis with flat icon set (Lucide-style SVGs)

## Keyboard Shortcuts

- [x] Navigate tasks/notes with J/K or arrow keys
- [x] Complete task: Cmd + Enter
- [x] Delete task/note: Cmd + Backspace
- [x] Open task/note: Enter
- [x] Close slide-out: Esc
- [x] New task/note: N
- [x] Import from Slack: S
- [x] Switch views: 1/2/3 (Tasks/Notes/Inbox)
- [x] Command palette: Cmd + K
- [x] Show shortcuts help: Shift + ?

## Future / Scoping

- [ ] Grain meeting recorder integration - discovery + technical feasibility

---

## Effort Estimates

| Task | Effort | Status |
|------|--------|--------|
| Project color assignment fix | Small | Done |
| Settings icon clickable | Small | Done |
| Description font fix | Small | Done |
| Remove/hide non-functional slideout buttons | Small | Done |
| Consolidate Slack buttons | Small | Done |
| Inbox loading bug | Medium | N/A (working) |
| Notes loading bug | Medium | N/A (working) |
| Project creation flow fix | Medium | N/A (working) |
| **Design Overhaul - Phase 1: Design tokens** | Medium | Done |
| **Design Overhaul - Phase 2: App frame** | Small | Done |
| **Design Overhaul - Phase 3: Card-based tasks** | Medium | Done |
| **Design Overhaul - Phase 4: Segmented filters** | Small | Done |
| **Design Overhaul - Phase 5: Sidebar & buttons** | Medium | Done |
| **Design Overhaul - Token cleanup** | Medium | Done |
| **Replace emojis with icons** | Medium | Done |
| **Floating Command-K button** | Medium | Done |
| Replace Quick Add with Cmd-K | Medium | |
| **Keyboard shortcuts** | Medium | Done |
| Editable workflow tabs | Large | Done |
| Kanban board view | Large | Done |
| Grain integration scoping | Large | |
