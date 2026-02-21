Tasks
- [x] Click anywhere outside the dialogue box to get out of the "Quick Add" rather than HAVING to click "Cancel" button
- [x] Auto-add a date to a task when you ask AI to create a task for you

Bugs
- [x] When you pull from Slack, it's pulling messages I pulled yesterday, duplicating tasks that I have to dismiss
- [x] Getting "from jt in #undefined" when that means it was from a DM, which should be marked as such
- [x] Tasks are in random orders. They should be ordered by completion date or due date
- [x] The command line AI is confusing some of my tasks for demands I'm asking of it

Features to build
- [x] Inbox
	- [x] Approve & Create, Approve & Complete (completes the task), and Dismiss (rather than reject)
	- [x] Rather than a 3rd column, these tasks should pop out so we can edit them then approve
- [x] Tasks
	- [x] Change tasks lists to a table view similar to Asana, which you can edit inline
	- [x] Improve the calendar selector to be more modern. Don't force me to select just the little calendar icon. When I click the field, the calendar should pop up.
	- [x] the calendar icon is black on a dark gray background.

Performance improvements (added today)
- [x] Parallelize Slack channel/DM fetching
- [x] Cache user info lookups to avoid N+1 API calls
- [x] Parallelize Claude API calls (3 concurrent)
- [x] Smart message filtering - don't create tasks from your own messages unless ball's back in your court
