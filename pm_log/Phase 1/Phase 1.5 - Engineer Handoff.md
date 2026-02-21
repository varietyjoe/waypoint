# Phase 1.5 — Engineer Handoff

## Agent Prompt

You are building Phase 1.5 of Waypoint, a personal productivity app at `/Users/joetancula/Desktop/waypoint`. This phase is a mobile layout pass — no new functionality, layout and UX layer only. The desktop three-column layout must remain unchanged. Read `pm_log/Phase 1.5 Mobile Layout Brief.md` in full (including the Resolved Decisions section) before writing any code, then use `dev_tracker/Phase 1.5 - Mobile Layout.md` as your working checklist.

---

You are building Phase 1.5 of Waypoint — a single-user personal execution OS. The project lives at `/Users/joetancula/Desktop/waypoint`.

**Read these files before writing a single line of code:**
1. `pm_log/Phase 1.5 Mobile Layout Brief.md` — full phase spec and resolved design decisions
2. `dev_tracker/Phase 1.5 - Mobile Layout.md` — your working checklist; update it as you go
3. `public/index.html` — the entire frontend; you'll be working in this file almost exclusively

**Prerequisites:** Phase 1.4 does not need to be complete. Phase 1.5 is purely a layout pass and can run in parallel or after 1.4. If 1.4 is not yet shipped, the AI mode toggle in the FAB sheet should be hidden behind a `FEATURES.aiPalette` flag (see Section 7).

---

## Pre-Build Checklist (Do Before Writing Code)

- [ ] Confirm Phase 1.4 status with PM. If 1.4 is shipped: wire AI mode directly. If 1.4 is in progress: add the `FEATURES.aiPalette` guard.
- [ ] Read `public/index.html` lines 1–250 in full to understand the current HTML structure and inline styles before touching anything.
- [ ] Note that `overflow:hidden` on `<body>` (line 102) is an **inline style**, not a class. You cannot override it with Tailwind — use the `<style>` block in `<head>` with a `@media` query.

---

## Scope Boundary (Firm — Do Not Cross)

| In scope for 1.5 | Out of scope |
|---|---|
| Responsive layout (single-column on mobile) | New features or API endpoints |
| Bottom tab bar navigation | Animated gesture-driven drawers |
| FAB + input sheet (Quick Capture + AI mode toggle) | Execution intelligence panel on mobile (→ Phase 1.6) |
| Touch target sizing (44×44pt minimum) | Offline mode / service worker |
| Font size increases at mobile breakpoint | Changing desktop layout in any way |
| Mobile Home panel (sidebar content reflowed) | Any changes to backend files |

---

## What to Build

### 1. Breakpoint and Body Overflow

Add to the `<style>` block in `<head>`:

```css
@media (max-width: 640px) {
  body {
    overflow: auto !important;
    height: auto !important;
  }
}
```

The `!important` is necessary because `overflow:hidden` and `height:100vh` are inline styles on `<body>` (line 102). Do not remove the inline styles — they are correct for desktop.

---

### 2. Three-Column Layout → Single Column on Mobile

The three-column wrapper (line 149) and both `<aside>` elements use inline `width` styles. You cannot use Tailwind alone here — add `@media` overrides in the `<style>` block:

```css
@media (max-width: 640px) {
  /* Hide desktop sidebars */
  aside.left-panel  { display: none !important; }
  aside.right-panel { display: none !important; }

  /* Stack the column wrapper */
  .column-wrapper {
    flex-direction: column;
    height: auto;
  }

  /* Center panel full width */
  main.center-panel { width: 100%; min-height: calc(100vh - 48px - 49px); }
}
```

Add class names `left-panel`, `right-panel`, `column-wrapper`, and `center-panel` to the corresponding elements in the HTML so the CSS selectors work. Do not change any existing classes or inline styles on these elements.

---

### 3. Bottom Tab Bar

Add as the last element before `</body>`, after the toast container:

```html
<!-- Mobile Bottom Tab Bar -->
<nav id="mobileTabBar" class="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40"
     style="height:49px; padding-bottom: env(safe-area-inset-bottom);">
  <div class="flex h-full">
    <!-- Home -->
    <button class="mobile-tab flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-400"
            data-tab="home" onclick="setMobileTab('home')">
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
      </svg>
      <span style="font-size:10px">Home</span>
    </button>
    <!-- Outcomes -->
    <button class="mobile-tab flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-400"
            data-tab="outcomes" onclick="setMobileTab('outcomes')">
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
      </svg>
      <span style="font-size:10px">Outcomes</span>
    </button>
    <!-- Inbox -->
    <button class="mobile-tab flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-400 relative"
            data-tab="inbox" onclick="setMobileTab('inbox')">
      <div class="relative">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0H4"/>
        </svg>
        <span id="mobileInboxBadge" class="hidden absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 rounded-full text-white flex items-center justify-center" style="font-size:8px;line-height:1"></span>
      </div>
      <span style="font-size:10px">Inbox</span>
    </button>
    <!-- AI -->
    <button class="mobile-tab flex-1 flex flex-col items-center justify-center gap-0.5 text-gray-400"
            data-tab="ai" onclick="openFabSheet('ai')">
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
      </svg>
      <span style="font-size:10px">AI</span>
    </button>
  </div>
</nav>
```

**Active tab styling:** Add a CSS rule to highlight the active tab icon and label in `text-gray-900` (or `text-blue-600`). Use a `mobile-tab-active` class toggled by `setMobileTab()`.

**`setMobileTab(tab)` function:**

```js
function setMobileTab(tab) {
  // Update active tab styling
  document.querySelectorAll('.mobile-tab').forEach(btn => {
    btn.classList.toggle('mobile-tab-active', btn.dataset.tab === tab)
  })

  if (tab === 'home') {
    currentPhase = 0        // Home is a mobile-only phase
    renderMobileHome()
    document.getElementById('mobileHomePanel').classList.remove('hidden')
    document.getElementById('centerContent').closest('main').classList.add('hidden')
  } else {
    document.getElementById('mobileHomePanel')?.classList.add('hidden')
    document.getElementById('centerContent').closest('main').classList.remove('hidden')
    if (tab === 'outcomes') setPhase(1)
    if (tab === 'inbox')    openInboxView()
    // 'ai' is handled by openFabSheet() directly
  }
}
```

---

### 4. Mobile Home Panel

Add a new `<div>` immediately after the three-column wrapper:

```html
<!-- Mobile Home Panel (hidden on desktop, hidden by default on mobile) -->
<div id="mobileHomePanel" class="sm:hidden hidden flex-col overflow-y-auto bg-gray-50"
     style="min-height: calc(100vh - 48px - 49px);">
  <!-- Content rendered by renderMobileHome() -->
</div>
```

**`renderMobileHome()` function:**

The mobile Home panel renders the same content as the desktop sidebar — date, Quick Capture, progress bars, active outcomes list, projects, recently closed, metrics — but in a single full-width column. The simplest approach is to call the existing sidebar render functions retargeted to `#mobileHomePanel`, or to duplicate the sidebar HTML structure inside `#mobileHomePanel` and have the render functions write to both sets of IDs.

**Recommended approach:** Refactor each sidebar render function to accept an optional container element parameter:

```js
function renderSidebarOutcomes(container = document.getElementById('sidebarOutcomes')) {
  // existing logic, write to `container` instead of hardcoded ID
}
```

Then `renderMobileHome()` calls each function with the corresponding `#mobileHomePanel` child element. This keeps one code path and avoids duplicated DOM IDs.

If this refactor is too disruptive given 1.4 in-flight changes, the acceptable fallback is: `renderMobileHome()` writes its own simplified HTML (date, Quick Capture input, active outcomes list) directly — a shorter version of the sidebar, not a full mirror. Flag which approach you used in dev_tracker.

---

### 5. FAB + Input Sheet

**FAB button** (add before `</body>`, before the tab bar):

```html
<!-- FAB -->
<button id="fabBtn" onclick="openFabSheet('capture')"
        class="sm:hidden fixed bg-gray-900 text-white rounded-full shadow-lg z-40
               flex items-center justify-center"
        style="width:52px;height:52px;bottom:calc(49px + 16px);right:16px;">
  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
  </svg>
</button>
```

**FAB sheet** (add after FAB button):

```html
<!-- FAB Sheet (hidden by default) -->
<div id="fabSheet" class="sm:hidden hidden fixed left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 border-t border-gray-200"
     style="bottom:49px; padding-bottom: env(safe-area-inset-bottom);">
  <!-- Drag handle -->
  <div class="flex justify-center pt-3 pb-2">
    <div class="w-8 h-1 bg-gray-200 rounded-full"></div>
  </div>
  <!-- Mode toggle -->
  <div class="flex gap-1 mx-4 mb-3 p-1 bg-gray-100 rounded-lg">
    <button id="fabModeCapture" onclick="setFabMode('capture')"
            class="flex-1 py-1.5 rounded-md text-gray-700 font-medium bg-white shadow-sm"
            style="font-size:13px">Add Action</button>
    <button id="fabModeAI" onclick="setFabMode('ai')"
            class="flex-1 py-1.5 rounded-md text-gray-500 font-medium"
            style="font-size:13px">Ask AI</button>
  </div>
  <!-- Input -->
  <div class="mx-4 mb-3">
    <input type="text" id="fabInput" placeholder="Capture an action…"
           class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder-gray-400"
           style="font-size:16px" <!-- 16px prevents iOS zoom on focus -->
           onkeydown="handleFabInput(event)">
  </div>
  <!-- Capture mode: outcome picker -->
  <div id="fabOutcomePicker" class="mx-4 mb-4">
    <select id="fabOutcomeSelect" class="w-full bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
            style="font-size:14px;padding:10px 12px;">
      <option value="">— leave unassigned —</option>
    </select>
  </div>
  <!-- AI mode: submit button -->
  <div id="fabAISubmit" class="hidden mx-4 mb-4">
    <button onclick="submitFabAI()"
            class="w-full bg-gray-900 text-white rounded-xl py-3 font-medium"
            style="font-size:15px">Ask Claude</button>
  </div>
  <!-- AI response area -->
  <div id="fabAIResponse" class="hidden mx-4 mb-4 text-gray-700" style="font-size:14px"></div>
</div>

<!-- FAB Sheet Backdrop -->
<div id="fabBackdrop" class="sm:hidden hidden fixed inset-0 z-40" onclick="closeFabSheet()"></div>
```

**Sheet JS functions:**

```js
let fabMode = 'capture'

function openFabSheet(mode = 'capture') {
  setFabMode(mode)
  document.getElementById('fabSheet').classList.remove('hidden')
  document.getElementById('fabBackdrop').classList.remove('hidden')
  // Populate outcome picker same as desktop
  populateFabOutcomePicker()
  setTimeout(() => document.getElementById('fabInput').focus(), 50)
}

function closeFabSheet() {
  document.getElementById('fabSheet').classList.add('hidden')
  document.getElementById('fabBackdrop').classList.add('hidden')
  document.getElementById('fabInput').value = ''
  document.getElementById('fabAIResponse').innerHTML = ''
  document.getElementById('fabAIResponse').classList.add('hidden')
}

function setFabMode(mode) {
  fabMode = mode
  const isCapture = mode === 'capture'
  document.getElementById('fabModeCapture').className = isCapture
    ? 'flex-1 py-1.5 rounded-md text-gray-700 font-medium bg-white shadow-sm'
    : 'flex-1 py-1.5 rounded-md text-gray-500 font-medium'
  document.getElementById('fabModeAI').className = isCapture
    ? 'flex-1 py-1.5 rounded-md text-gray-500 font-medium'
    : 'flex-1 py-1.5 rounded-md text-gray-700 font-medium bg-white shadow-sm'
  document.getElementById('fabOutcomePicker').classList.toggle('hidden', !isCapture)
  document.getElementById('fabAISubmit').classList.toggle('hidden', isCapture)
  document.getElementById('fabInput').placeholder = isCapture ? 'Capture an action…' : 'Ask Claude anything…'
}

function handleFabInput(e) {
  if (e.key !== 'Enter') return
  if (fabMode === 'capture') submitFabCapture()
  if (fabMode === 'ai')      submitFabAI()
}

async function submitFabCapture() {
  const input = document.getElementById('fabInput')
  const outcomeSelect = document.getElementById('fabOutcomeSelect')
  const title = input.value.trim()
  if (!title) return
  const outcomeId = outcomeSelect.value ? parseInt(outcomeSelect.value) : null
  // Route to the correct endpoint. POST /api/actions creates an unassigned action
  // and ignores outcome_id in the body. To assign an action to an outcome it must
  // be posted to /api/outcomes/:id/actions.
  const url = outcomeId ? `/api/outcomes/${outcomeId}/actions` : '/api/actions'
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, energy_type: 'light' })
    })
    closeFabSheet()
    showToast('Action captured')
    await loadData()
    renderAll()
  } catch (err) {
    showToast('Failed to capture action', 'warning')
  }
}
```

**`submitFabAI()`:** If Phase 1.4 is shipped, call `/api/chat` with `mode: "tools"` and render the response in `#fabAIResponse`. If 1.4 is not yet shipped, show a "Coming soon" toast and return. Use the `FEATURES.aiPalette` guard:

```js
async function submitFabAI() {
  if (!FEATURES.aiPalette) { showToast('AI palette coming soon'); return }
  // ... Phase 1.4 tool call
}
```

Add `const FEATURES = { aiPalette: false }` near the top of the `<script>` block. Set to `true` when 1.4 ships.

**`populateFabOutcomePicker()`:** Mirror `populateQuickCaptureOutcomes()` but target `#fabOutcomeSelect`.

---

### 6. Touch Targets

Minimum 44×44pt on all interactive elements below 640px. Add to the `<style>` block:

```css
@media (max-width: 640px) {
  /* Checkbox hit area */
  .action-check {
    width: 20px;
    height: 20px;
  }
  .action-row {
    min-height: 44px;
    align-items: center;
  }

  /* Tappable rows and buttons */
  .sidebar-outcome,
  .project-row,
  .outcome-card {
    min-height: 44px;
  }

  /* Outcome card padding increase */
  .outcome-card {
    padding: 16px;
  }
}
```

For icon-only buttons (inbox icon in header, focus toggle): wrap in a `<div>` with `min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center;` rather than enlarging the icon itself.

---

### 7. Font Sizes

Add to the `<style>` block:

```css
@media (max-width: 640px) {
  /* Bump all inline font-size:10px and font-size:11px labels */
  /* Target: section headers, metadata, timestamps */
  .text-mobile-xs { font-size: 12px; }

  /* Action titles, outcome titles in lists */
  .action-row span,
  .outcome-card h3 { font-size: 15px; }
}
```

The existing inline `style="font-size:10px"` and `style="font-size:11px"` throughout the JS-rendered HTML cannot be overridden by media queries (inline styles win). For JS-rendered content, either:
- Add a CSS class to the generated elements (preferred — touch each render function once)
- Or use `font-size: 12px !important` in the media query (acceptable for this phase given scope)

Flag the approach used in dev_tracker.

**Important — iOS auto-zoom:** Any `<input>` or `<textarea>` with `font-size` below 16px triggers iOS Safari auto-zoom on focus. All three of the following must be overridden to `font-size: 16px` in the mobile media query:

- `#quickCaptureInput` — currently `11px` (inline style on the desktop sidebar input)
- `#fabInput` — already set to `16px` in the FAB sheet HTML above; verify it stays that way
- The inline add-action input rendered at the bottom of the Phase 2 action list (`onkeydown="handleAddAction(event, ${o.id})"`) — currently rendered at `font-size:12px` via the JS template string in `renderPhase2()`

Add to the media query:

```css
@media (max-width: 640px) {
  #quickCaptureInput,
  .add-action-input {
    font-size: 16px !important;
  }
}
```

The `!important` is needed because `#quickCaptureInput` has an inline `style="font-size:11px"` and `.add-action-input` is rendered with an inline style in the JS template. Confirm the class `add-action-input` is present on the Phase 2 inline input (it is — see the `.add-action-input` CSS rule in the existing `<style>` block).

---

### 8. Phase 3 — Complete & Close on Mobile

Phase 3 renders via `setPhase(3)` into `#centerContent` and will reflow into the single-column mobile layout automatically. However three specific elements need explicit mobile treatment.

**Reflection textareas (`.reflect-area`):**

The three reflection textareas are rendered with `rows="2"` and `font-size:11px`. Both are problematic on mobile:
- `font-size:11px` triggers iOS Safari auto-zoom on tap (see Section 7 zoom rule — add `.reflect-area` to the override)
- `rows="2"` is too small for comfortable thumb-typing on a phone

Add to the media query:

```css
@media (max-width: 640px) {
  .reflect-area {
    font-size: 16px !important;  /* prevent iOS zoom */
    min-height: 100px;           /* comfortable tap target height */
  }
}
```

Also add `.reflect-area` to the `font-size: 16px !important` rule in Section 7 alongside `#quickCaptureInput` and `.add-action-input`.

**Archive and Back buttons:**

Confirm these buttons meet the 44×44pt minimum. They are rendered as block-level buttons by `renderPhase3()` — check the generated HTML and ensure each has at least `min-height: 44px` and sufficient horizontal padding. If the rendered buttons already span full width, they will meet the requirement without additional CSS. Verify on device and add a mobile override if needed:

```css
@media (max-width: 640px) {
  /* Phase 3 CTAs */
  #centerContent button {
    min-height: 44px;
  }
}
```

Use a more specific selector if this rule is too broad (e.g. target the Phase 3 archive button by its `onclick` or add a class in `renderPhase3()`).

---

### 9. Header on Mobile

The desktop header (48px, three-zone) becomes a simpler two-zone header on mobile:

```css
@media (max-width: 640px) {
  /* Hide phase indicator (navigation is now the tab bar) */
  #phaseIndicator { display: none; }

  /* Shrink logo zone, remove fixed width */
  header .logo-zone { width: auto; }

  /* Right zone: keep inbox icon (now redundant with tab bar badge — hide it)
     and keep user avatar */
  #inboxNavBtn { display: none; }
}
```

The logo and user avatar remain visible. The phase pill disappears (navigation moves to tab bar). The inbox header icon is redundant with the Inbox tab badge — hide it on mobile.

---

### 10. Body Padding for Fixed Elements

The main content area needs bottom padding on mobile so content isn't obscured by the tab bar. Add:

```css
@media (max-width: 640px) {
  #centerContent,
  #mobileHomePanel {
    padding-bottom: calc(49px + env(safe-area-inset-bottom) + 16px);
  }
}
```

---

### 11. Inbox Badge — Mobile Tab

The existing `updateInboxBadge()` function updates `#inboxBadge` in the header. Extend it to also update `#mobileInboxBadge` in the tab bar:

```js
// In updateInboxBadge(), add:
const mobileBadge = document.getElementById('mobileInboxBadge')
if (mobileBadge) {
  if (count > 0) {
    mobileBadge.textContent = count > 9 ? '9+' : count
    mobileBadge.classList.remove('hidden')
  } else {
    mobileBadge.classList.add('hidden')
  }
}
```

---

## Key Constraints

- **Desktop layout is untouched.** Every change is either a `@media (max-width: 640px)` override or an element with `sm:hidden` / `class="sm:hidden"`. The three-column desktop layout above 640px must be pixel-identical to before.
- **No new backend code.** This phase touches only `public/index.html`.
- **No new JS libraries.** Vanilla JS only.
- **Input font-size ≥ 16px on mobile** to prevent iOS Safari zoom. This is a hard requirement.
- **Safe area insets.** Use `env(safe-area-inset-bottom)` on the tab bar and FAB positioning so the layout works correctly on iPhone models with a home indicator.
- **Do not touch:** Any file in `src/`, `database/`, `pm_log/`, `key_decisions/`, `dev_tracker/` (except to update your checklist).

---

## When You're Done

Mark each item complete in `dev_tracker/Phase 1.5 - Mobile Layout.md` as you finish each section — not all at the end. Log your session date, the approach chosen for the sidebar render refactor (Section 4), the font-size approach (Section 7), and the Phase 3 button selector decision (Section 8) in the **Build Log** table. When the full checklist is done, flag for PM review.
