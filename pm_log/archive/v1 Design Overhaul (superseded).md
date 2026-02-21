# Waypoint UI Overhaul (Awaystar-Inspired)
## Technical Brief + Verified CSS Starter

---

## 0. Verification: Will the CSS Actually Produce This UI?

### Short Answer
**Yes — conditionally.**

The CSS provided **will produce the Awaystar-style visual system** *if* the following changes are made:
- Waypoint components are mapped to card-based containers
- Task rows are rendered as cards instead of table rows
- Filters are converted into pill-style segmented controls
- Content is wrapped in a framed workspace container

### What the CSS *Does* Give You
- Dark, warm charcoal background
- Soft, rounded card surfaces
- Subtle borders instead of harsh dividers
- Pill-based controls and chips
- Clear surface hierarchy (background → frame → cards)
- Awaystar-like calm, premium feel

### What the CSS *Does Not* Do Automatically
- Convert tables to cards
- Change DOM structure
- Decide component layout

**Conclusion:**  
This is a **design system foundation**, not a drop-in skin.  
The UI update requires **component-level layout changes**, which are scoped below.

---

## 1. Objective

Evolve Waypoint from a:
> *simple, functional task manager*

into a:
> *calm, premium, card-based workspace*

Inspired by Awaystar’s design philosophy:
- Cards over lines
- Containment over edge-to-edge layouts
- Soft contrast over sharp emphasis
- Rounded geometry as a system

---

## 2. Implementation Plan (Engineering Scope)

### Phase 1 — Global Design Tokens
**Tasks**
- Add CSS variables for:
  - background
  - surfaces
  - borders
  - text hierarchy
  - radii
  - shadows
- Apply global font + background

**Success Criteria**
- Entire app inherits a unified visual language
- No component-specific hardcoded colors remain

---

### Phase 2 — App Frame
**Tasks**
- Wrap primary content area in a `.frame` container
- Add:
  - large border radius
  - subtle border
  - soft shadow
  - internal padding

**Success Criteria**
- Waypoint content appears “held” inside a canvas
- Clear separation from background

---

### Phase 3 — Tasks: Table → Card List
**Tasks**
- Replace table-based task layout
- Each task becomes a `.taskCard`
- Status, priority, due date become pill chips

**Success Criteria**
- Tasks appear as individual soft cards
- Hover state subtly elevates card
- Metadata is visually secondary but readable

---

### Phase 4 — Filters as Segmented Pills
**Tasks**
- Replace tabs/buttons with `.segmented` control
- Active state uses surface contrast, not bright color

**Success Criteria**
- Filter control matches Awaystar segmented pill style
- Clear active state without visual noise

---

### Phase 5 — Sidebar & Buttons
**Tasks**
- Increase sidebar padding
- Reduce contrast
- Projects become small dot chips
- Buttons become pill-shaped:
  - primary
  - ghost
  - destructive (limited use)

**Success Criteria**
- Sidebar feels secondary
- Actions feel intentional, not loud

---



## 3. CSS Starter (Awaystar-Style Baseline)

> Apply as a global stylesheet.
> Map existing components to these classes or merge rules as needed.

```css
:root {
  /* Colors */
  --bg: #1b1c1e;
  --surface: #242528;
  --surface-2: #2b2c30;
  --border: rgba(255,255,255,0.14);
  --border-strong: rgba(255,255,255,0.22);

  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.70);
  --subtle: rgba(255,255,255,0.55);

  /* Radii */
  --r-xl: 32px;
  --r-lg: 24px;
  --r-md: 18px;
  --r-pill: 999px;

  /* Shadow */
  --shadow: 0 10px 30px rgba(0,0,0,0.35);

  /* Typography */
  --font: ui-sans-serif, system-ui, -apple-system, Inter, Segoe UI, Roboto;
}

body {
  margin: 0;
  font-family: var(--font);
  background:
    radial-gradient(1200px 600px at 20% 20%, rgba(255,255,255,0.06), transparent 60%),
    var(--bg);
  color: var(--text);
}

/* App Frame */
.frame {
  margin: 24px auto;
  width: min(1180px, calc(100% - 40px));
  padding: 22px;
  border-radius: var(--r-xl);
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  box-shadow: var(--shadow);
}

/* Card */
.card {
  padding: 16px;
  border-radius: var(--r-lg);
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
}

.card:hover {
  border-color: rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.04);
}

/* Pills */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border-strong);
  background: rgba(255,255,255,0.04);
  font-size: 12px;
  font-weight: 600;
}

/* Segmented Controls */
.segmented {
  display: inline-flex;
  gap: 6px;
  padding: 6px;
  border-radius: var(--r-pill);
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.03);
}

.segmentedItem {
  padding: 8px 12px;
  border-radius: var(--r-pill);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
}

.segmentedItem.isActive {
  background: rgba(255,255,255,0.10);
  color: var(--text);
}

/* Buttons */
.btnPrimary {
  padding: 10px 16px;
  border-radius: var(--r-pill);
  border: none;
  background: #ffffff;
  color: #111;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(0,0,0,0.28);
}

.btnGhost {
  padding: 10px 16px;
  border-radius: var(--r-pill);
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(255,255,255,0.03);
  color: var(--text);
  font-weight: 700;
  cursor: pointer;
}

/* Tasks */
.taskList {
  display: grid;
  gap: 10px;
}

.taskCard {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 12px;
  align-items: center;
}

.taskTitle {
  font-weight: 750;
}

.taskMeta {
  display: flex;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--muted);
}

## **5. Instructions for Claude Code**

  

Please implement the following:

- Apply the provided CSS tokens and base styles globally
    
- Introduce an AppFrame wrapper using the .frame class around main content
    
- Replace the task table layout with a card-based layout:
    
    - .taskList
        
    - .card
        
    - .taskCard
        
    
- Convert task filters into pill-based segmented controls:
    
    - .segmented
        
    - .segmentedItem
        
    - .isActive state
        
    
- Preserve all existing functionality
    
- Change **presentation and structure only**, not logic
    

---

## **6. Risks & Implementation Notes**

- Retaining <table>-based layouts will prevent achieving the Awaystar-style card aesthetic
    
- This design relies primarily on:
    
    - spacing
        
    - containment
        
    - surface hierarchy
        
        not color or decoration
        
    
- Hover, focus, empty, and loading states must be implemented to avoid the UI feeling “skinned” instead of designed
    

  

### **Guiding Principle**

  

> Interfaces should feel **held**, not exposed.

  

Waypoint already works.

This redesign gives it **emotional credibility**.