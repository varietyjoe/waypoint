# Phase 5.1 — CVO Review: Projects & Active Outcomes

**Reviewer:** Chief Visionary Officer
**Date:** 2026-02-24
**Brief reviewed:** `pm_log/Phase 5/Phase 5.1 - Projects & Active Outcomes.md`
**North star reference:** `docs/vision.md`

---

## Overall Assessment

Phase 5.1 is a well-scoped housekeeping phase that fixes real, embarrassing gaps — projects are decoration, outcomes have no priority gradient, tiny task titles truncate. These are legitimate problems. The engineering is clean and minimal. The "two files, no new files" constraint reflects real discipline.

But the brief is underselling itself on the concept that matters — outcome activation — while simultaneously listing two features (clickable sidebar projects, expand-on-click tooltip) that are pure maintenance work, not vision work. The result is a phase that reads like a bug fix with a big idea buried inside it. That's backwards. The big idea should be leading.

Here is the full breakdown.

---

## What the Brief Gets Right

**Projects as functional first-class citizens.** Sidebar project clicks and new project creation are table stakes that are genuinely overdue. The inline form (no modal, Enter to save, Escape to cancel) is the right UX call — it matches the terminal-adjacent aesthetic of the product and doesn't interrupt flow. The color swatch approach is appropriately lightweight. This is correctly scoped.

**The is_active flag is the right data model choice.** Separating `is_active` from `status` is correct. "Active" (not archived) and "in progress right now" are genuinely different states, and conflating them would create technical debt immediately. This decision is sound.

**No new API routes needed.** The recognition that `is_active` flows through existing `PUT /api/outcomes/:id` logic without new endpoints is good engineering instinct. Don't add surface area when you don't have to.

**The "IN PROGRESS" strip above the outcomes list.** This is the right visual treatment. It creates a committed-work zone at the top of the view — something the vision calls out explicitly as the difference between a wishlist and a plan with a spine.

---

## What the Brief Gets Wrong

### 1. "Outcome Activation" is undersold to the point of being misframed

The brief describes activation as: "marked as 'in progress right now'" — with no cap, user decides what it means for them.

The vision is explicit about what this moment is supposed to be:

> "You have 4.5 hours of real work time today. I'm suggesting these 2 outcomes. Here's why. Confirm this plan? Now you have a contract — not a list of hopes, a plan with a spine."

Activation is not a flag. It is the **commitment act**. The moment where you stop browsing your outcomes and declare what today is about. The vision calls this "the moment of commitment" and describes the Today view as where "decisions happen."

The brief treats activation as a toggle. The vision treats it as a ritual.

These are not the same thing. The brief's version is an organizational affordance. The vision's version is a behavioral intervention — the thing that makes Waypoint feel different from every other productivity tool that lets you mark things "in progress" and still get nothing done.

By shipping activation as a silent toggle with no cap and no ceremony, you get a feature that users will activate 12 outcomes in, lose the signal entirely, and stop using. The counter-pressure — "what does activating this cost?" — is absent.

**The more powerful version of this feature includes:**
- A soft limit (2–3 activated outcomes) with a friction message when exceeded: "You have 3 things in progress. Adding a 4th reduces the focus signal for all of them. Continue?" Not a hard block — a prompt that respects user agency but creates intentionality.
- A visual treatment that communicates commitment weight, not just a green dot. The activated strip should feel like the top of a whiteboard, not like a filtered list view.
- A "What will you close today?" micro-prompt on activation — one sentence, optional, stored as `activation_note`. This is the seed of the committed day. When you ship the full Today view in a future phase, this field becomes the bridge.

None of this requires new infrastructure. It requires treating the UX as a behavior design problem, not a state management problem.

### 2. The brief conflates vision work with maintenance work

Four deliverables in this phase:
1. Clickable sidebar projects — maintenance
2. New project button — table stakes
3. Outcome activation — vision work
4. Tiny task expand-on-click — maintenance

The brief gives them equal weight. They should not have equal weight. The activation feature deserves its own conceptual section with explicit reasoning about why it's designed the way it is. Right now it reads like the third item in a checklist.

If this brief goes to a new engineer, they will implement items 1 and 4 competently and then implement item 3 as a database flag with a green dot. They will not understand that item 3 is the thing this phase is actually about.

**Fix:** Restructure the brief. Lead with the activation concept. Make the vision explicit. Move the sidebar/tooltip work to a "Cleanup" section at the bottom.

### 3. The framing does not use the product's language

The vision's identity statement is: "intention becomes execution, execution becomes learning."

The brief's framing is: "make projects functional first-class citizens."

That is a database migration framing, not a product vision framing. It describes what changes in the codebase, not what changes for the user.

Nowhere in the brief does it explain what problem activation solves at the level of human experience. The closest it gets is: "All active outcomes are treated equally — a backlog item from 3 weeks ago sits at the same visual weight as the thing you're trying to close by Thursday." That is a good observation, but it frames the solution as a sorting problem. It is not a sorting problem. It is an intention problem. You don't know what matters today, so nothing gets done.

The brief should open with that. "You have 8 outcomes. Which one are you doing today? Right now you have to re-answer that question every time you open the app. Activation closes that gap."

---

## What Is Missing

### Missing: An activation_note field

The brief adds `is_active INTEGER DEFAULT 0`. It should also add `activation_note TEXT`. Cost: one column, one optional text field on the activate button.

Why it matters: When the full Today view ships (vision Phase 3.0 territory), you will want to know what the user committed to when they activated this outcome. The activation note is the seed of the daily plan. Collect it now while the user is at the activation moment — it is the cheapest place to collect it. Retrofitting this later means either (a) you ask users to re-declare intent they've already had, or (b) you miss the signal entirely.

This is the same logic that put `outcome_result` and `outcome_result_note` in Phase 2.0 even though Pattern Memory wasn't shipping until 3.3. Collect the data at the right behavioral moment. Don't wait for the feature that consumes it.

### Missing: Activated outcomes visible in the sidebar list

The brief mentions `●` prefix dots on activated outcomes in the sidebar list. But the sidebar currently shows outcomes sorted by... what? If you have 12 active outcomes and 2 are activated, can you see them without scrolling? The brief does not specify whether activated outcomes float to the top of the sidebar list. They should. This is a trivial sort change that matters for the feature to work as a commitment signal.

### Missing: What happens when you finish an activated outcome?

The brief specifies that archiving an outcome clears `is_active`. Good. But what is the moment like? Does anything happen when the last action on an activated outcome is completed and it's ready to archive? Does Waypoint acknowledge that you completed a committed outcome?

The vision describes this: "The action row springs. Strikethrough wipes right. The progress bar inches forward." The activated-outcome version of this should be more ceremonial — you committed to this outcome today, you closed it. That deserves a moment.

This does not have to be built in 5.1. But the brief should acknowledge it as a "future state" so the engineer does not implement archiving-from-the-activated-strip in a way that makes it harder to add later.

### Missing: A word about where this leads

Phase 5.1 ships activation as a manual user gesture. The vision's Today view makes it semi-automated — Claude proposes which outcomes to activate based on calendar, patterns, and deadlines, and the user confirms. The brief should say this explicitly:

> "Phase 5.1 ships manual activation. The Today view (future phase) will make Claude propose the activation set each morning. The data model here (`is_active`, `activation_note`) is designed to support that — we're building the surface now, the intelligence comes later."

Without that sentence, a future engineer will look at this feature and say "why is this a separate flag instead of just sorting by priority?" and be correct from their vantage point. The brief needs to carry the architectural intent forward.

---

## What Should Be Deferred

### Tiny task expand-on-click

This is not a Phase 5.1 problem. It is a Phase 5.0 bug. The brief says as much — "Close the tiny task UX gaps from 5.0." If 5.0 shipped with truncated titles and no tooltip, that is a 5.0 bug fix that should go out as a patch, not be bundled into the next feature phase. Putting it here inflates the deliverables list with maintenance work and dilutes the narrative that 5.1 is about commitment and activation.

Defer it to a 5.0.1 patch or ship it alongside 5.0's code review handoff. Do not let it occupy a line item in 5.1's Definition of Done.

---

## Does the Language Reflect the Product's Identity?

No. The brief reads like a good engineering spec. It does not read like a product brief from a team building "the place where intention becomes execution."

The vision document opens with: "Most productivity tools make you feel organized. Waypoint should make you feel powerful." The 5.1 brief opens with: "Make projects functional first-class citizens." These are writing in two different registers about the same product.

This is not a trivial complaint. The language of the brief shapes how the engineer implements the feature. If the brief says "add an Activate button (visible on hover)," you get a hover button. If the brief says "the moment you activate an outcome is the moment you're making a commitment — the UI should feel intentional, not incidental," you get a different button. Same pixel size, different design intent.

The brief needs a single opening paragraph written in product voice before the feature specs begin. Something like: "Right now you can have 10 active outcomes and no answer to 'what am I actually doing today.' Activation is the answer — the explicit act of saying 'this is what I'm committed to.' It is the first step toward a committed day."

---

## Recommendation

**Revise with specific changes. Do not rethink the framing entirely. Do not ship as-is.**

The core scope is correct. The data model is correct. The engineering plan is correct. What needs revision:

1. **Restructure the brief.** Lead with outcome activation as the primary concept. Move sidebar click and project creation to a "Supporting Work" or "Cleanup" section. Move tiny task expand to a 5.0.1 patch.

2. **Add a soft limit with intentional friction** on activation at 3+ outcomes. Not a hard block. A prompt. This is the difference between a feature and a behavior design.

3. **Add `activation_note TEXT` to the data model.** Optional field. Collect intent at the moment of commitment. Feeds the future Today view.

4. **Specify sort order for activated outcomes in the sidebar list.** They should float to the top.

5. **Add a "future state" note** connecting manual activation to the upcoming Today view and Claude-proposed commitment. One sentence. The engineer needs this architectural context.

6. **Rewrite the opening paragraph** in product voice. Use the product's language. The engineer should feel the weight of what they're building before they write the first line of code.

The phase is close. It is not close enough. The concept at the center of it — "I am committing to this today" — is one of the most important behavioral moments in the entire product, and the brief is treating it like a sort flag. Fix that, and this ships well.

---

*CVO Review · 2026-02-24*
