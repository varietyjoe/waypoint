  **Project:** Waypoint Task App Overhaul

**Version:** v2 – Outcome-Driven Execution System

**Prepared For:** UX Design → Frontend Mockup → Engineering Build

---

# **1. 🎯 Product Vision**

  

Waypoint v2 is not a task manager.

  

It is a **Personal Operating System for Outcomes**.

  

The core shift:

- From managing tasks
    
- To driving outcomes
    

  

The product should feel:

- Calm
    
- Structured
    
- Intentional
    
- High-agency
    
- Professional
    

  

It should not feel:

- Gamified
    
- Noisy
    
- Overstimulating
    
- Like a kanban toy
    

---

# **2. 🧠 Core UX Philosophy**

  

We are adopting a **3-Phase Guided Workflow**, inspired by structured build systems (like configuring a product before checkout).

  

The app must guide the user through:

  

## **Phase 1 → Define Outcome**

  

## **Phase 2 → Break Into Actions**

  

## **Phase 3 → Complete & Close**

  

This progression must be visible at the top of the interface at all times.

  

It should feel like forward motion.

---

# **3. 🏗 Primary Layout Architecture (3-Column System)**

  

The entire app should follow a structured 3-column layout.

---

## **LEFT COLUMN – Context Panel (Narrow, Persistent)**

  

Purpose: Provide orientation without overwhelming the user.

  

Width: ~240–280px

Sticky / fixed on scroll.

  

### **Contains:**

- Current date
    
- Focus mode indicator
    
- Active Outcome (if selected)
    
- Quick Capture input (always visible)
    
- Today’s Outcome count (e.g., 1/3 completed)
    
- Project list
    
- Recent Outcomes
    
- Minimal metrics snapshot:
    
    - Outcomes completed today
        
    - Focus time logged
        
    

  

Design Notes:

- Light background
    
- Subtle border separation
    
- Small typography
    
- No heavy icons
    
- No visual clutter
    

  

This is the “Control Sidebar.”

---

## **CENTER COLUMN – Execution Surface (Primary Focus)**

  

This is the core build area.

  

Width: Flexible (dominant space)

  

Content changes depending on phase.

---

### **Phase 1 – Define Outcome**

  

UI should show:

- Outcome cards (large, clean, minimal)
    
- Each Outcome includes:
    
    - Title
        
    - Optional description
        
    - Deadline
        
    - Estimated effort (optional)
        
    - Priority / Impact indicator
        
    

  

User can:

- Create new outcome
    
- Select existing outcome
    
- Drag outcomes to reorder
    
- Limit to 1–3 active outcomes
    

  

Emotional tone:

Calm commitment.

  

Not overwhelming.

---

### **Phase 2 – Break Into Actions**

  

Once an outcome is selected:

  

Display:

  

Outcome Header:

- Title
    
- Deadline
    
- Estimated total effort
    
- Progress %
    

  

Below that:

Structured Action Stack

  

Each action includes:

- Title
    
- Time estimate
    
- Energy type (Deep / Light)
    
- Dependency indicator
    
- Status toggle
    

  

Actions should:

- Be reorderable via drag
    
- Support nesting (subtasks optional)
    
- Show dependency relationships visually (subtle)
    

  

This phase should feel like:

Configuring a build.

  

Clean.

Intentional.

Focused.

---

### **Phase 3 – Complete & Close**

  

When all actions are complete:

  

Show:

- Completion confirmation
    
- Timestamp
    
- Time spent vs estimated
    
- Quick reflection prompt:
    
    - What worked?
        
    - What slipped?
        
    - Reusable insights?
        
    

  

Completed outcomes collapse into:

A clean historical log.

  

This builds closure loops.

---

# **4. 📊 RIGHT COLUMN – Execution Intelligence Panel**

  

This is critical.

  

Most task apps fail here.

  

This panel updates live as user builds actions.

  

Width: ~280–320px

Sticky.

  

Contains:

  

### **Live Metrics:**

- Total estimated time
    
- Remaining time
    
- % of outcome complete
    
- Deep work vs light work split
    
- Deadline risk indicator
    
- Dependency warnings
    
- Today’s total planned hours
    

  

Optional (future iteration):

- Velocity trend
    
- Weekly completion rate
    

  

Design Notes:

- Minimal color
    
- Soft visual hierarchy
    
- No dashboard overload
    
- Calm data presentation
    

  

This is the “Operational Brain.”

---

# **5. 🎨 Visual Design Direction**

  

Overall aesthetic:

  

White / Light theme.

  

Think:

Linear × Notion × HubSpot restraint

  

Not:

Asana × Todoist × Color-heavy productivity tools

---

## **Typography**

- Slightly smaller base font size
    
- Tight but breathable line spacing
    
- Confident hierarchy
    
- Minimal weight variation
    
- No decorative fonts
    

---

## **Color System**

  

Use color sparingly:

  

Green → Completed

Red → Risk / Overdue

Muted Blue → Active selection

Amber → Deadline approaching

  

Everything else neutral gray scale.

---

## **UI Elements**

- Soft shadows
    
- Subtle borders
    
- Rounded corners (minimal)
    
- No heavy gradients
    
- No harsh contrast
    
- Minimal icon usage
    

  

Whitespace should be intentional.

  

The interface should feel calm even when full.

---

# **6. 🔁 Interaction Principles**

- Phase indicator always visible at top
    
- Clear forward motion between phases
    
- No overwhelming modal spam
    
- Drag-and-drop must feel smooth
    
- Completion animation subtle, not celebratory
    
- Quick capture always accessible
    

  

The system should feel like:

A quiet command center.

---

# **7. 🧩 Core Functional Requirements (For Mockup)**

  

Designer must account for:

- Outcome creation flow
    
- Action builder interface
    
- Dependency indication UI
    
- Time estimation UI
    
- Reordering interactions
    
- Completion state UI
    
- Historical outcome view
    
- Empty states (important)
    
- Deadline risk visual
    

  

Mockups should include:

1. Empty workspace state
    
2. 1 active outcome
    
3. Multiple active outcomes
    
4. Action-building state
    
5. Completed outcome view
    
6. Mobile-responsive adaptation (stacked columns)
    

---

# **8. 📱 Responsive Behavior**

  

Desktop: 3-column layout.

  

Tablet:

- Left collapses into icon sidebar
    
- Right becomes slide-over panel
    

  

Mobile:

- Phases become top tabs
    
- Columns stack vertically
    
- Intelligence panel collapses under expandable section
    

---

# **9. 🚨 Non-Goals**

  

Do NOT design:

- Full kanban system
    
- Multiple equal layout modes
    
- Over-gamified reward systems
    
- Heavy notification systems
    
- Social collaboration (for now)
    

  

This version is focused on:

Individual execution.

---

# **10. 🎯 Emotional Outcome**

  

When the user opens Waypoint v2, they should feel:

  

“I know exactly what I’m driving today.”

  

When they complete an outcome, they should feel:

  

“Closed loop. Clear. Controlled.”

  

Not:

“Checked a box.”

---

# **11. Deliverables Required from UX**

- High-fidelity desktop mockups
    
- Phase transition states
    
- Component library reference
    
- Interaction flow diagrams
    
- Clickable prototype
    
- Responsive layout guidance
    
- Clear spacing + typography system
    

---

# **12. Strategic Positioning**

  

Waypoint v2 is not competing as:

  

“A better to-do list.”

  

It is positioned as:

  

An Outcome-Driven Execution System.

  

The UX must reflect that elevation.