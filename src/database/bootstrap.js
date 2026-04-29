const projectsDb = require('./projects');
const outcomesDb = require('./outcomes');
const actionsDb = require('./actions');
const inboxDb = require('./inbox');
const focusSessionsDb = require('./focus-sessions');
const userContextDb = require('./user-context');
const libraryDb = require('./library');
const patternsDb = require('./patterns');
const scheduler = require('../services/scheduler');
const calendarDb = require('./calendar');
const prefDb = require('./user-preferences');
const dependenciesDb = require('./dependencies');
const sharesDb = require('./shares');
const advisorDb = require('./advisor');
const dailyEntriesDb = require('./daily-entries');
const timelineDb = require('./timeline');
const { runSeedIfEmpty } = require('./seeder');

let initialized = false;

function initDatabase() {
    if (initialized) {
        return;
    }

    projectsDb.initProjectsTable();
    outcomesDb.initOutcomesTable();
    outcomesDb.initReflectionsTable();
    actionsDb.initActionsTable();
    inboxDb.initInboxMigrations();
    focusSessionsDb.initFocusSessionsTable();
    userContextDb.initUserContextTable();
    scheduler.init();
    calendarDb.initCalendarTables();
    prefDb.initUserPreferences();
    libraryDb.initLibraryMigrations();
    patternsDb.initPatternTables();
    dependenciesDb.initDependenciesTable();
    sharesDb.initSharesTable();
    advisorDb.initAdvisorTables();
    dailyEntriesDb.initDailyEntriesTable();
    timelineDb.initTimelineTable();

    runSeedIfEmpty();
    initialized = true;
}

module.exports = { initDatabase };
