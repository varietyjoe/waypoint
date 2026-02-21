# Project Management UI - Design Brief

## Overview
Build an Asana-style project management application with a dark theme. The core experience centers on managing tasks within projects, with a focus on two key features:

---

## Feature 1: Task Detail Slideout

### Behavior
- Opens when a user clicks on any task row
- Slides in from the right side of the screen
- Does NOT push the main content (overlays on top)
- Can be closed via X button or clicking outside

### Components (top to bottom)

1. **Header Bar**
   - "Completed" toggle button (green when complete)
   - Action icons: thumbs up, attachment, overflow menu, close

2. **Privacy Notice**
   - Lock icon + "This task is private to members of this project"
   - "Make public" link on right

3. **Task Title**
   - Large, editable text (24px)
   - Inline editing on click

4. **Field Grid** (2-column layout: label | value)
   - **Assignee**: Avatar + name + "Recently assigned" dropdown
   - **Due date**: Calendar icon + date range + clear button
   - **Projects**: Colored dot + project name + status dropdown + remove button
   - **Dependencies**: "Add dependencies" link
   - **Custom Fields**:
     - Priority: Low/Medium/High badges (green/yellow/red)
     - Status: On track/At risk/Off track badges

5. **Description**
   - Placeholder: "What is this task about?"
   - Rich text editor on focus

6. **Subtasks**
   - "+ Add subtask" button
   - Subtask list (same structure as main tasks)

7. **Comments/Activity Section**
   - Tab toggle: Comments | All activity
   - Sort control: Oldest/Newest
   - Activity feed showing:
     - User avatar
     - Action text ("created this task", "completed this task")
     - Timestamp
   - Comment input at bottom with avatar

8. **Footer**
   - Collaborators row with avatars
   - "+ " button to add collaborator
   - "Leave task" button

### Visual Style
- Background: #1e1e2e (slightly lighter than main)
- Width: 480px fixed
- Full height of viewport
- Subtle left border: 1px solid #333

---

## Feature 2: Projects / Boards

### Sidebar Navigation
- Fixed left sidebar (240px width)
- Logo at top
- "+ Create" button (pink/red accent)
- Navigation sections:
  - Home, My tasks, Inbox
  - Insights (Reporting, Portfolios, Goals)
  - Projects (list of project boards)
  - Teams

### Project Selection
- Each project shows colored dot indicator
- Clicking switches the main view to that project's tasks
- Active project has highlighted background

### Project Board View

1. **Project Header**
   - Icon + Project name + dropdown + star
   - "Set status" button
   - View tabs: Overview | List | Board | Timeline | Dashboard | Calendar | Workflow | Messages | Files

2. **Task List View** (currently shown)
   - "+ Add task" button with dropdown
   - Column headers: Name | Assignee | Due date | Priority
   - Collapsible sections (To do, Doing, Done)

3. **Section Structure**
   - Collapse/expand arrow
   - Section name (bold)
   - Task rows within section
   - "Add task..." row at bottom of each section
   - "+ Add section" at bottom of all sections

### Task Row Structure
```
[drag handle] [checkbox] [task name] [assignee avatar + name] [due date] [priority badge]
```

### Data Model
```javascript
Project {
  id: string
  name: string
  color: string (hex)
  sections: Section[]
}

Section {
  id: string
  name: string
  isCollapsed: boolean
  tasks: Task[]
}

Task {
  id: string
  name: string
  assignee: User | null
  dueDate: { start: string, end: string }
  priority: 'Low' | 'Medium' | 'High'
  status: 'On track' | 'At risk' | 'Off track'
  project: string
  description: string
  isCompleted: boolean
  comments: Comment[]
  subtasks: Task[]
}
```

---

## Design Tokens

### Colors
```
Background (main):     #1a1a2e
Background (sidebar):  #252538
Background (slideout): #1e1e2e
Background (hover):    #2a3441
Border:                #333
Text (primary):        #e0e0e0
Text (secondary):      #888
Text (muted):          #666
Accent (pink):         #f06
Accent (green):        #4CAF50
Accent (blue):         #4dabf7
```

### Priority Colors
```
Low:    bg #E8F5E9, text #4CAF50
Medium: bg #FFF8E1, text #FF9800  
High:   bg #FFEBEE, text #F44336
```

### Typography
```
Font family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
Base size: 14px
Task title (slideout): 24px, weight 600
Section headers: 14px, weight 600
Labels: 12px, color #888
```

### Spacing
```
Sidebar width: 240px
Slideout width: 480px
Standard padding: 16px
Row padding: 8px vertical
Border radius (buttons): 6px
Border radius (badges): 4px
Avatar sizes: 24px (small), 28px (medium), 32px (large)
```

---

## Interactions

### Task Row
- Hover: Background changes to #2a3441
- Click: Opens slideout, row stays highlighted
- Checkbox: Toggles completion (independent of slideout)
- Drag handle: Allows reordering (future enhancement)

### Slideout
- Opens with slide animation from right (300ms ease-out)
- Close via: X button, Escape key, clicking outside
- All fields are inline-editable

### Sections
- Click header to collapse/expand
- Smooth height animation on toggle

### Projects
- Click project in sidebar to switch views
- Active project visually highlighted

---

## Reference Screenshot
See: Screenshot_2026-01-29_at_4_42_13_PM.png

This is an Asana interface showing the exact layout and styling to replicate.
