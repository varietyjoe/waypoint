# Project Switcher Redesign — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bulky full-width workspace bar with a compact project avatar circle in the header, add a project management bottom sheet with full CRUD (create/edit/delete), using flat monochrome SVG icons tinted to project color.

**Architecture:** All changes are in `public/mobile.html`. Remove the workspace bar HTML/CSS/JS entirely. Add a 40px avatar circle to the briefing header (and other panel headers). Reuse the existing bottom sheet pattern for the project list and create/edit form. The backend already has full CRUD (`GET/POST/PUT/DELETE /api/projects`) — no server changes needed. The `icon` field in the DB (TEXT) will store SVG key strings like `"rocket"` instead of emoji characters.

**Tech Stack:** Vanilla HTML/CSS/JS in a single file (`public/mobile.html`), existing Express API endpoints.

**Prototype reference:** `.superpowers/brainstorm/29819-1773721417/interactive-v2.html`

---

## File Structure

- **Modify:** `public/mobile.html` — all changes in this single file
  - CSS: Remove ~60 lines of workspace-bar/switcher/sheet styles, add ~80 lines of avatar + project sheet + form styles
  - HTML: Remove workspace bar + workspace sheet markup (~40 lines), add project avatar to briefing header, add project sheet + form sheet markup (~60 lines)
  - JS: Remove workspace sheet render/open/close functions, add SVG icon registry, project sheet rendering, CRUD functions, context menu logic

No backend changes. No new files.

---

## Chunk 1: Remove Old Workspace Bar & Add Project Avatar

### Task 1: Remove workspace bar CSS

**Files:**
- Modify: `public/mobile.html` lines 68–214 (CSS)

- [ ] **Step 1: Delete workspace bar CSS blocks**

Remove all CSS rules from `.workspace-bar` through `.workspace-option.active .workspace-check` (lines 68–214). These classes:
- `.workspace-bar`, `.workspace-switcher`, `.workspace-switcher:active`
- `.workspace-meta`, `.workspace-dot`, `.workspace-copy`, `.workspace-label`, `.workspace-name`, `.workspace-sub`, `.workspace-chevron`
- `.workspace-backdrop`, `.workspace-sheet`, `.workspace-sheet.open`
- `.workspace-sheet-title`, `.workspace-sheet-sub`, `.workspace-list`
- `.workspace-option`, `.workspace-option.active`, `.workspace-option-main`
- `.workspace-icon`, `.workspace-option.active .workspace-icon`
- `.workspace-option-copy`, `.workspace-option-name`, `.workspace-option-sub`
- `.workspace-check`, `.workspace-option.active .workspace-check`

- [ ] **Step 2: Add project avatar and project sheet CSS**

Insert the following CSS in place of the removed workspace styles (after the `#app` rule, before the `/* ── Tab panels ──` comment):

```css
/* ── Project avatar ── */
.project-avatar {
  width: 40px; height: 40px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  transition: transform 0.15s ease;
}
.project-avatar:active { transform: scale(0.92); }
.project-avatar svg { width: 20px; height: 20px; }

/* ── Project sheet ── */
.project-row {
  border: 1px solid var(--border); background: rgba(255,255,255,0.025);
  border-radius: 14px; padding: 11px 12px; display: flex; align-items: center;
  gap: 10px; margin-bottom: 6px; cursor: pointer; transition: all 0.15s ease;
}
.project-row:active { opacity: 0.7; }
.project-row.active-row {
  border-color: rgba(var(--accent-rgb),0.28);
  background: rgba(var(--accent-rgb),0.10);
}
.project-row-icon {
  width: 34px; height: 34px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; flex-shrink: 0;
}
.project-row-icon svg { width: 16px; height: 16px; }
.project-row-body { flex: 1; min-width: 0; }
.project-row-name { font-size: 13px; font-weight: 600; color: #ddd; }
.project-row-sub { font-size: 10px; color: var(--text-ghost); margin-top: 1px; }
.project-row-menu {
  width: 28px; height: 28px; border-radius: 50%; display: flex;
  align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
}

/* ── Project create/edit form ── */
.form-group { margin-bottom: 14px; }
.form-label {
  font-size: 10px; font-weight: 600; letter-spacing: .06em;
  text-transform: uppercase; color: var(--text-ghost); margin-bottom: 6px; display: block;
}
.form-input {
  width: 100%; background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 11px; padding: 12px 14px; font-size: 15px;
  color: var(--text-primary); outline: none; font-family: inherit;
}
.form-input:focus { border-color: rgba(var(--accent-rgb),0.4); }
.form-input::placeholder { color: #333; }

.icon-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.icon-option {
  width: 40px; height: 40px; border-radius: 10px; display: flex;
  align-items: center; justify-content: center; cursor: pointer;
  background: rgba(255,255,255,0.03); border: 1.5px solid transparent;
  transition: all 0.15s ease;
}
.icon-option:active { transform: scale(0.9); }
.icon-option.selected {
  border-color: rgba(255,255,255,0.3);
  background: rgba(255,255,255,0.08);
}
.icon-option svg { width: 20px; height: 20px; }

.color-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.color-swatch {
  width: 34px; height: 34px; border-radius: 50%; cursor: pointer;
  border: 2px solid transparent;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.color-swatch:active { transform: scale(0.9); }
.color-swatch.selected { border-color: white; transform: scale(1.1); }

.form-actions { display: flex; gap: 8px; margin-top: 16px; }

/* ── Context menu ── */
.context-menu {
  position: fixed; z-index: 95; background: #1a1a1a;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; padding: 4px; min-width: 160px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5); display: none;
}
.context-menu.visible { display: block; }
.context-item {
  padding: 10px 14px; border-radius: 8px; font-size: 13px; cursor: pointer;
  display: flex; align-items: center; gap: 8px;
  color: var(--text-primary); background: none; border: none;
  width: 100%; font-family: inherit;
}
.context-item:active { background: rgba(255,255,255,0.06); }
.context-item.danger { color: #f87171; }
```

- [ ] **Step 3: Verify CSS syntax**

Run: `sed -n '/<style>/,/<\/style>/p' public/mobile.html | wc -l`
Confirm no unclosed braces by visual inspection of the style block boundaries.

- [ ] **Step 4: Commit**

```bash
git add public/mobile.html
git commit -m "refactor: remove workspace bar CSS, add project avatar + sheet styles"
```

### Task 2: Replace workspace bar HTML with project avatar in header

**Files:**
- Modify: `public/mobile.html` — HTML section

- [ ] **Step 1: Remove the workspace bar HTML**

Delete the `<div class="workspace-bar">` block (the entire `workspace-bar` div inside `#app`, roughly lines 1108–1122 in current file). This contains `workspace-switcher`, `workspace-dot`, `workspace-meta`, etc.

- [ ] **Step 2: Modify the briefing header to include the project avatar**

Replace the existing `brief-header` div:

```html
<div class="brief-header">
  <div class="brief-eyebrow" id="brief-eyebrow">—</div>
  <div class="brief-title" id="brief-title">Briefing</div>
  <div class="brief-sub" id="brief-sub">Loading…</div>
</div>
```

With:

```html
<div class="brief-header" style="display:flex;align-items:center;gap:12px;">
  <div class="project-avatar" id="project-avatar" onclick="openProjectSheet()"></div>
  <div style="flex:1;">
    <div class="brief-eyebrow" id="brief-eyebrow">—</div>
    <div class="brief-title" id="brief-title">Briefing</div>
    <div class="brief-sub" id="brief-sub">Loading…</div>
  </div>
</div>
```

- [ ] **Step 3: Remove old workspace sheet HTML**

Delete the workspace backdrop and workspace sheet divs that live outside `#app` (after `</div><!-- end app -->`):

```html
<div class="workspace-backdrop" id="workspace-backdrop" onclick="closeWorkspaceSheet()"></div>
<div class="workspace-sheet" id="workspace-sheet">
  ...
</div>
```

- [ ] **Step 4: Add project sheet + form sheet + context menu HTML**

Insert after the toast div (`<div class="toast" id="toast"></div>`):

```html
<!-- Project Sheet -->
<div class="backdrop" id="project-backdrop" onclick="closeProjectSheet()"></div>
<div class="capture-sheet" id="project-sheet" style="max-height:75vh;overflow-y:auto;">
  <div class="sheet-handle"></div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
    <div style="font-size:16px;font-weight:700;letter-spacing:-.02em;">Projects</div>
    <button class="cap-btn cap-save" style="flex:none;width:auto;padding:6px 14px;font-size:12px;" onclick="openProjectCreateForm()">+ New</button>
  </div>
  <div id="project-list"></div>
</div>

<!-- Project Create/Edit Sheet -->
<div class="capture-sheet" id="project-form-sheet" style="max-height:80vh;overflow-y:auto;z-index:52;">
  <div class="sheet-handle"></div>
  <div style="font-size:16px;font-weight:700;letter-spacing:-.02em;margin-bottom:14px;" id="project-form-title">New Project</div>
  <div class="form-group">
    <label class="form-label">Name</label>
    <input class="form-input" id="project-form-name" placeholder="Project name" />
  </div>
  <div class="form-group">
    <label class="form-label">Icon</label>
    <div class="icon-picker" id="project-icon-picker"></div>
  </div>
  <div class="form-group">
    <label class="form-label">Color</label>
    <div class="color-picker" id="project-color-picker"></div>
  </div>
  <div class="form-actions">
    <button class="cap-btn cap-cancel" onclick="closeProjectFormSheet()">Cancel</button>
    <button class="cap-btn cap-save" id="project-form-save-btn" onclick="saveProject()">Create</button>
  </div>
</div>

<!-- Project Context Menu -->
<div class="context-menu" id="project-context-menu">
  <button class="context-item" onclick="editContextProject()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    Edit
  </button>
  <button class="context-item danger" onclick="deleteContextProject()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
    Delete
  </button>
</div>
```

- [ ] **Step 5: Verify HTML structure**

Check that the file has no broken tags — the briefing panel should still have `id="panel-briefing"`, and the new sheets should be siblings of the capture sheet and toast.

- [ ] **Step 6: Commit**

```bash
git add public/mobile.html
git commit -m "refactor: replace workspace bar with compact project avatar in header"
```

### Task 3: Add SVG icon registry and project CRUD JavaScript

**Files:**
- Modify: `public/mobile.html` — `<script>` section

- [ ] **Step 1: Add SVG icon registry constant**

Insert at the top of the `<script>`, right after the STATE section (after `let currentProject = null;`):

```javascript
// ═══════════════════════════════════════════════════════════════
// SVG ICON REGISTRY (flat monochrome line icons for projects)
// ═══════════════════════════════════════════════════════════════
const PROJECT_ICONS = {
  folder:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>',
  rocket:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  dollar:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
  target:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  home:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  bulb:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0018 8 6 6 0 006 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 018.91 14"/></svg>',
  zap:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  flame:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>',
  chart:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  wrench:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>',
  seedling: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8"/><path d="M5 12H2a10 10 0 0010-10v0a10 10 0 0110 10h-3"/><path d="M7 15c0-2.21 2.69-4 5-4s5 1.79 5 4"/></svg>',
  flask:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6"/><path d="M10 9V3"/><path d="M14 9V3"/><path d="M10 9l-4.5 7.5A2 2 0 007.2 20h9.6a2 2 0 001.7-3.5L14 9"/></svg>',
  phone:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  bot:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
  globe:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>',
  palette:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
};

const PROJECT_ICON_KEYS = Object.keys(PROJECT_ICONS);
const PROJECT_COLORS = ['#3b82f6','#818cf8','#22c55e','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316'];
```

- [ ] **Step 2: Add project avatar rendering function**

Insert after `applyWorkspaceTheme()`:

```javascript
function renderProjectAvatar() {
  const avatar = document.getElementById('project-avatar');
  if (!avatar) return;
  const p = getCurrentProject();
  if (p) {
    const [r, g, b] = hexToRgb(p.color || '#3b82f6');
    avatar.style.background = `rgba(${r},${g},${b},0.12)`;
    avatar.style.border = `1.5px solid rgba(${r},${g},${b},0.3)`;
    avatar.style.color = p.color;
    avatar.innerHTML = PROJECT_ICONS[p.icon] || PROJECT_ICONS.folder;
  } else {
    avatar.style.background = 'rgba(255,255,255,0.06)';
    avatar.style.border = '1.5px solid rgba(255,255,255,0.1)';
    avatar.style.color = '#666';
    avatar.innerHTML = PROJECT_ICONS.globe;
  }
}
```

- [ ] **Step 3: Call `renderProjectAvatar()` from `applyWorkspaceTheme()`**

Add `renderProjectAvatar();` as the last line of the `applyWorkspaceTheme()` function.

- [ ] **Step 4: Update `renderWorkspaceChrome()` to stop referencing removed elements**

The function references `workspaceName` and `workspaceSub` which no longer exist. Remove those two lines from both branches (project and all). Keep the rest (briefTitle, outcomesEyebrow, etc.). Also remove the `renderWorkspaceSheet()` call at the end — replace it with `renderProjectAvatar()`.

- [ ] **Step 5: Commit**

```bash
git add public/mobile.html
git commit -m "feat: add SVG icon registry and project avatar rendering"
```

### Task 4: Add project sheet, CRUD, and context menu JavaScript

**Files:**
- Modify: `public/mobile.html` — `<script>` section

- [ ] **Step 1: Add project sheet state variables**

Add to the STATE section:

```javascript
let projectFormEditing = null; // null = creating, object = editing
let projectContextTarget = null; // project being context-menu'd
let formSelectedIcon = 'folder';
let formSelectedColor = '#3b82f6';
```

- [ ] **Step 2: Add project sheet open/close/render functions**

Replace `renderWorkspaceSheet`, `openWorkspaceSheet`, `closeWorkspaceSheet` with:

```javascript
function openProjectSheet() {
  renderProjectList();
  document.getElementById('project-backdrop').classList.add('visible');
  document.getElementById('project-sheet').classList.add('open');
}

function closeProjectSheet() {
  document.getElementById('project-backdrop').classList.remove('visible');
  document.getElementById('project-sheet').classList.remove('open');
  document.getElementById('project-context-menu').classList.remove('visible');
}

function renderProjectList() {
  const list = document.getElementById('project-list');
  const isAll = workspace.mode === 'all';

  let html = `
    <div class="project-row ${isAll ? 'active-row' : ''}" onclick="selectWorkspace('all')">
      <div class="project-row-icon" style="background:rgba(255,255,255,0.06);color:#666;">
        ${PROJECT_ICONS.globe}
      </div>
      <div class="project-row-body">
        <div class="project-row-name">All Workspaces</div>
        <div class="project-row-sub">Cross-project view</div>
      </div>
    </div>`;

  projects.forEach(p => {
    const isActive = workspace.mode === 'project' && Number(workspace.projectId) === Number(p.id);
    const [r, g, b] = hexToRgb(p.color || '#3b82f6');
    const outcomeCount = outcomes.filter(o => Number(o.project_id) === Number(p.id)).length;
    const activeCount = outcomes.filter(o => Number(o.project_id) === Number(p.id) && o.status === 'active').length;
    html += `
      <div class="project-row ${isActive ? 'active-row' : ''}" onclick="selectWorkspace('project', ${p.id})">
        <div class="project-row-icon" style="background:rgba(${r},${g},${b},0.15);border:1px solid rgba(${r},${g},${b},0.25);color:${p.color};">
          ${PROJECT_ICONS[p.icon] || PROJECT_ICONS.folder}
        </div>
        <div class="project-row-body">
          <div class="project-row-name">${esc(p.name)}</div>
          <div class="project-row-sub">${outcomeCount} outcome${outcomeCount !== 1 ? 's' : ''} · ${activeCount} active</div>
        </div>
        <div class="project-row-menu" onclick="event.stopPropagation();openProjectContextMenu(event, ${p.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2.5"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
        </div>
      </div>`;
  });

  list.innerHTML = html;
}
```

- [ ] **Step 3: Add context menu functions**

```javascript
function openProjectContextMenu(e, projectId) {
  projectContextTarget = projects.find(p => Number(p.id) === projectId);
  const menu = document.getElementById('project-context-menu');
  const rect = e.target.closest('.project-row-menu').getBoundingClientRect();
  menu.style.left = (rect.left - 130) + 'px';
  menu.style.top = rect.bottom + 'px';
  menu.classList.add('visible');

  // Close on next outside click
  setTimeout(() => {
    document.addEventListener('click', closeProjectContextMenu, { once: true });
  }, 0);
}

function closeProjectContextMenu() {
  document.getElementById('project-context-menu').classList.remove('visible');
}

function editContextProject() {
  closeProjectContextMenu();
  openProjectEditForm(projectContextTarget);
}

async function deleteContextProject() {
  closeProjectContextMenu();
  if (!projectContextTarget) return;
  const name = projectContextTarget.name;
  try {
    await apiFetch('/api/projects/' + projectContextTarget.id, { method: 'DELETE' });
    if (workspace.mode === 'project' && Number(workspace.projectId) === Number(projectContextTarget.id)) {
      await selectWorkspace('all');
    } else {
      projects = projects.filter(p => Number(p.id) !== Number(projectContextTarget.id));
      renderProjectList();
    }
    showToast('Deleted "' + name + '"');
  } catch (e) {
    showToast('Error deleting project');
  }
  projectContextTarget = null;
}
```

- [ ] **Step 4: Add create/edit form functions**

```javascript
function openProjectCreateForm() {
  projectFormEditing = null;
  formSelectedIcon = 'folder';
  formSelectedColor = PROJECT_COLORS[0];
  document.getElementById('project-form-name').value = '';
  document.getElementById('project-form-title').textContent = 'New Project';
  document.getElementById('project-form-save-btn').textContent = 'Create';
  renderProjectFormPickers();
  document.getElementById('project-sheet').classList.remove('open');
  setTimeout(() => document.getElementById('project-form-sheet').classList.add('open'), 100);
}

function openProjectEditForm(project) {
  projectFormEditing = project;
  formSelectedIcon = project.icon || 'folder';
  formSelectedColor = project.color || PROJECT_COLORS[0];
  document.getElementById('project-form-name').value = project.name;
  document.getElementById('project-form-title').textContent = 'Edit Project';
  document.getElementById('project-form-save-btn').textContent = 'Save';
  renderProjectFormPickers();
  document.getElementById('project-sheet').classList.remove('open');
  setTimeout(() => document.getElementById('project-form-sheet').classList.add('open'), 100);
}

function closeProjectFormSheet() {
  document.getElementById('project-form-sheet').classList.remove('open');
  projectFormEditing = null;
  // Reopen project list
  setTimeout(() => {
    renderProjectList();
    document.getElementById('project-sheet').classList.add('open');
  }, 150);
}

function renderProjectFormPickers() {
  const iconPicker = document.getElementById('project-icon-picker');
  iconPicker.innerHTML = PROJECT_ICON_KEYS.map(k =>
    `<div class="icon-option ${k === formSelectedIcon ? 'selected' : ''}" onclick="selectProjectIcon('${k}')" style="color:${formSelectedColor};">${PROJECT_ICONS[k]}</div>`
  ).join('');

  const colorPicker = document.getElementById('project-color-picker');
  colorPicker.innerHTML = PROJECT_COLORS.map(c =>
    `<div class="color-swatch ${c === formSelectedColor ? 'selected' : ''}" style="background:${c};" onclick="selectProjectColor('${c}')"></div>`
  ).join('');
}

function selectProjectIcon(k) { formSelectedIcon = k; renderProjectFormPickers(); }
function selectProjectColor(c) { formSelectedColor = c; renderProjectFormPickers(); }

async function saveProject() {
  const name = document.getElementById('project-form-name').value.trim();
  if (!name) { document.getElementById('project-form-name').style.borderColor = '#ef4444'; return; }

  try {
    if (projectFormEditing) {
      await apiFetch('/api/projects/' + projectFormEditing.id, {
        method: 'PUT',
        body: JSON.stringify({ name, icon: formSelectedIcon, color: formSelectedColor }),
      });
      showToast('Updated "' + name + '"');
    } else {
      await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name, icon: formSelectedIcon, color: formSelectedColor }),
      });
      showToast('Created "' + name + '"');
    }

    // Refresh projects list
    const projectsRes = await apiFetch('/api/projects');
    projects = projectsRes.data || [];

    // If we edited the current project, re-apply theme
    if (projectFormEditing && workspace.mode === 'project' && Number(workspace.projectId) === Number(projectFormEditing.id)) {
      currentProject = getCurrentProject();
      applyWorkspaceTheme();
      renderWorkspaceChrome();
    }

    document.getElementById('project-form-sheet').classList.remove('open');
    projectFormEditing = null;
    setTimeout(() => {
      renderProjectList();
      document.getElementById('project-sheet').classList.add('open');
    }, 150);
  } catch (e) {
    showToast('Error saving project');
  }
}
```

- [ ] **Step 5: Update `selectWorkspace` to close the project sheet**

In the existing `selectWorkspace` function, replace `closeWorkspaceSheet()` with `closeProjectSheet()`.

- [ ] **Step 6: Verify JS syntax**

Run: `sed -n '/<script>/,/<\/script>/p' public/mobile.html | sed '1d;$d' | node --check /dev/stdin`
Expected: No output (clean syntax).

- [ ] **Step 7: Commit**

```bash
git add public/mobile.html
git commit -m "feat: project sheet with CRUD, context menu, SVG icon picker"
```

### Task 5: Clean up dead code and verify end-to-end

**Files:**
- Modify: `public/mobile.html`

- [ ] **Step 1: Remove dead workspace functions**

Delete these functions that are no longer called:
- `renderWorkspaceSheet()` (replaced by `renderProjectList()`)
- `openWorkspaceSheet()` (replaced by `openProjectSheet()`)
- `closeWorkspaceSheet()` (replaced by `closeProjectSheet()`)

If any of these are still referenced elsewhere, update those references.

- [ ] **Step 2: Search for any remaining references to removed elements**

Search for: `workspace-switcher`, `workspace-dot`, `workspace-name`, `workspace-sub`, `workspace-list`, `workspace-backdrop`, `workspace-sheet`, `openWorkspaceSheet`, `closeWorkspaceSheet`, `renderWorkspaceSheet`.

Fix or remove any stale references.

- [ ] **Step 3: Update `renderWorkspaceChrome()` to not reference removed DOM elements**

Remove references to `workspace-name` and `workspace-sub` getElementById calls. The function should only update: `briefTitle`, `outcomesEyebrow`, `outcomesTitle`, `inboxEyebrow`, `inboxTitle`, `advEyebrow`, `advSub`, `inboxTabLabel`, `captureTitle`, `captureInput`.

- [ ] **Step 4: Full JS syntax check**

Run: `sed -n '/<script>/,/<\/script>/p' public/mobile.html | sed '1d;$d' | node --check /dev/stdin`
Expected: No output.

- [ ] **Step 5: Manual smoke test**

Open mobile.html in browser responsive mode (390px width):
1. Verify project avatar circle appears in briefing header (globe icon, gray)
2. Tap avatar — project sheet opens with "All Workspaces" + any existing projects
3. Tap "+ New" — form sheet opens with icon picker (SVG line icons, monochrome), color picker, name field
4. Create a project — toast, returns to list, new project appears
5. Tap ⋮ on a project — context menu with Edit/Delete
6. Edit — form prefilled, save updates
7. Delete — removes project, toast
8. Switch project — header, colors, advisor card all update
9. Switch back to ALL — returns to default view

- [ ] **Step 6: Commit and push**

```bash
git add public/mobile.html
git commit -m "chore: remove dead workspace code, verify project switcher e2e"
git push
```
