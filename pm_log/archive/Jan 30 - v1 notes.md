**Date:** January 30, 2026  
**Owner:** Joe Tancula  
**Audience:** Engineering / Product

---

## Overview

This document outlines current bugs, UX issues, and feature requests for the Waypoint web app. The primary focus areas are **project creation**, **core navigation**, **UI consistency**, **Slack integration**, and **AI / keyboard-driven workflows**.

---

## 1. Projects & Boards

### ❌ Project Creation (Blocking)
- Project creation flow appears broken or incomplete.

### 🎨 Project Color Assignment
- When creating a project, there is no way to assign or save a project color.
- Color selection UI exists but does not persist.

### 🗂 Editable Workflow Tabs
Current tabs:
- All
- Backlog
- In Progress
- Done

**Requested Enhancements:**
- Tabs should be **editable** (rename, add, delete, reorder).
- Support **two views**:
  - **Kanban board**
  - **List view**
- Ability to toggle between views per project.

---

## 2. Inbox & Notes

### 📥 Inbox Loading Bug
- Inbox is stuck in a permanent loading state.
- No data ever renders.

### 📝 Notes Loading Bug
- Notes section is also stuck in a permanent loading state.
- Likely related to the same data-fetching or state issue as Inbox.

---

## 3. UI / UX Bugs & Polish

### ⚙️ Settings Icon
- Settings icon (top-right) is not clickable.
- No hover state or click handler appears to be wired.

### 🔤 Description Font Inconsistency
- Text inside the task description field uses a different font than the rest of the app.
- Should match the global typography system.

### 🧷 Task Slide-Out Action Buttons
In the task slide-out panel (top-right):
- 👍 Thumbs up
- 🔗 Paperclip / link
- ⋯ Three-dot menu

**Issues:**
- None of these buttons are functional.
- Either:
  - Implement intended functionality, **or**
  - Remove until supported.

---

## 4. Icons & Visual System

### 😵 Emoji Overuse
Emojis currently appear:
- Next to Tasks
- Notes
- Inbox
- Sync Slack
- Slide-out buttons (e.g., delete task trash can)

**Request:**
- Remove emojis entirely.
- Replace with **flat, consistent icon set** (e.g., Lucide, Heroicons).
- Icons should align with a minimal, professional UI aesthetic.

---

## 5. Slack Integration

### 🔁 Sync Slack Button Cleanup
- There are currently **two Slack sync buttons**.
- They are labeled differently and create confusion.

**Request:**
- Consolidate into **one button**.
- Use a single, consistent phrase.
- Explore clearer wording such as:
  - “Get from Slack”
  - “Grab from Slack”
  - “Import from Slack”
- Needs light copy ideation.

---

## 6. AI & Command Palette

### ⌨️ Command-K as Primary Entry Point
- The “Quick Add” button (top-left) should be replaced with **Command-K (Ask AI)**.
- Make Command-K the primary creation and action surface.

### 🧠 Floating Command-K Button
- Previously existed as a floating button (bottom-right).
- Currently removed with no visual affordance.

**Request:**
- Restore the floating Command-K launcher.
- Clicking it should open the AI command line.

---

## 7. Keyboard Shortcuts

### ⚡ Task Navigation & Actions
Introduce keyboard shortcuts for power users:

**Examples (open to iteration):**
- Navigate tasks via arrow keys or `J / K`
- Complete task: `Cmd + C`
- Delete task: `Cmd + Shift + C`
- Open task: `Enter`
- Close slide-out: `Esc`

Goal: enable fast, keyboard-first task management.

---

## 8. Future Integration (Scoping)

### 🎙 Grains / Green Meeting Recorder
- Begin scoping an integration with **Grains (Green meeting recorder)**.
- Initial phase: discovery + technical feasibility.
- No implementation required yet — just define surface area and requirements.

---

## Priority Callouts

**High Priority / Blocking**
- Project creation
- Inbox & Notes loading bugs

**Medium Priority**
- Editable boards & views
- Slack sync cleanup
- Command-K UX

**Polish / UX Debt**
- Icon system
- Fonts
- Non-functional buttons