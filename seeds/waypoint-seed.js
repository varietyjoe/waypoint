// seeds/waypoint-seed.js
// Auto-populated by: npm run export-seed
// This file is the safety net — if Railway loses its volume, this restores the DB on next boot.
module.exports = {
  projects: [
    { name: 'Waypoint', color: '#818cf8', icon: '🧭' },
  ],
  outcomes: [
    {
      project_name: 'Waypoint',
      title: 'Launch Waypoint on Railway',
      description: 'Get the app live and stable on Railway with persistent data.',
      deadline: null,
      priority: 'high',
      status: 'active',
    },
  ],
  actions: [
    {
      outcome_title: 'Launch Waypoint on Railway',
      title: 'Run npm run export-seed to replace this placeholder with real data',
      energy_type: 'light',
      done: false,
    },
  ],
};
