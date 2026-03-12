/**
 * Briefing Cron Jobs — Phase 3.1
 * Schedules Morning Brief, Midday Pulse, and EOD Wrap.
 * Preferences (enabled, userId) are read at fire time — changes take effect without restart.
 * Times are read at startup to set cron schedules; change requires restart (acceptable trade-off).
 */

const cron = require('node-cron');
const briefingsService = require('../services/briefings');
const prefDb = require('../database/user-preferences');
const { sendSlackDM } = require('../routes/slack');
const advisorService = require('../services/advisor');

function parseCronTime(timeStr) {
  // timeStr: 'HH:MM'
  const [hour, minute] = timeStr.split(':').map(Number);
  return { hour, minute };
}

function scheduleBriefings() {
  const timezone = prefDb.getPreference('timezone') || 'America/Chicago';

  // Phase 3.3 — Weekly pattern recompute (Friday 11:59pm)
  const { computePatterns } = require('../services/pattern-engine');
  cron.schedule('59 23 * * 5', async () => {
    try {
      await computePatterns();
      console.log('[PatternEngine] Weekly recompute complete');
    } catch (e) {
      console.error('[PatternEngine] Weekly recompute failed:', e.message);
    }
  }, { timezone });

  // Phase 4.3 — Friday 5:30pm: generate weekly Advisor retrospective
  cron.schedule('30 17 * * 5', async () => {
    try {
      await advisorService.generateWeeklyRetrospective();
      console.log('[Advisor] Weekly retrospective cron complete');
    } catch (e) {
      console.error('[Advisor] Weekly retrospective failed:', e.message);
    }
  }, { timezone });

  // Morning Brief
  const morning = parseCronTime(prefDb.getPreference('briefing_morning_time') || '07:45');
  cron.schedule(`${morning.minute} ${morning.hour} * * *`, async () => {
    const enabled = prefDb.getPreference('briefings_enabled');
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (enabled !== 'true' || !userId) return;
    try {
      const text = await briefingsService.generateMorningBrief();
      await sendSlackDM(userId, text);
      console.log('[Briefings] Morning brief sent to', userId);
    } catch (e) {
      console.error('[Briefings] Morning brief failed:', e.message);
    }
  }, { timezone });

  // Midday Pulse
  const midday = parseCronTime(prefDb.getPreference('briefing_midday_time') || '12:00');
  cron.schedule(`${midday.minute} ${midday.hour} * * *`, async () => {
    const enabled = prefDb.getPreference('briefings_enabled');
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (enabled !== 'true' || !userId) return;
    try {
      const text = await briefingsService.generateMiddayPulse();
      await sendSlackDM(userId, text);
      console.log('[Briefings] Midday pulse sent to', userId);
    } catch (e) {
      console.error('[Briefings] Midday pulse failed:', e.message);
    }
  }, { timezone });

  // EOD Wrap
  const eod = parseCronTime(prefDb.getPreference('briefing_eod_time') || '17:30');
  cron.schedule(`${eod.minute} ${eod.hour} * * *`, async () => {
    const enabled = prefDb.getPreference('briefings_enabled');
    const userId = prefDb.getPreference('briefing_slack_user_id');
    if (enabled !== 'true' || !userId) return;
    try {
      const text = await briefingsService.generateEODWrap();
      await sendSlackDM(userId, text);
      console.log('[Briefings] EOD wrap sent to', userId);
    } catch (e) {
      console.error('[Briefings] EOD wrap failed:', e.message);
    }
  }, { timezone });

  console.log('[Briefings] Scheduled: morning %s:%s, midday %s:%s, EOD %s:%s (%s)',
    String(morning.hour).padStart(2, '0'), String(morning.minute).padStart(2, '0'),
    String(midday.hour).padStart(2, '0'), String(midday.minute).padStart(2, '0'),
    String(eod.hour).padStart(2, '0'), String(eod.minute).padStart(2, '0'),
    timezone
  );
}

module.exports = { scheduleBriefings };
