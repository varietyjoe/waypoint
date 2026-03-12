/**
 * Sales Pulse Formatter
 * Transforms metrics into a Slack-ready Sales Pulse post
 */

const NUM_REPS = 3;

const TARGETS = {
  meetingsPerRep: 5,
  qualOppsPerRep: 3,
  conversionsPerRep: 2,
  weeklyMeetings: 125
};

function indicator(actual, target) {
  return actual >= target ? ':white_check_mark:' : ':fire:';
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Get how many business days have elapsed this week (Mon=1 .. Fri=5)
 */
function businessDayOfWeek(date) {
  const d = date || new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 0) return 5; // Sunday — full week
  if (day === 6) return 5; // Saturday — full week
  return day; // Mon=1, Tue=2, Wed=3, Thu=4, Fri=5
}

function formatSalesPulse(metrics, narrative, date) {
  const {
    emails_sent = 0,
    dials = 0,
    meetings_booked = 0,
    meetings_scheduled = 0,
    weekly_meetings_cumulative = 0,
    scheduled = 0,
    no_shows = 0,
    canceled = 0,
    held = 0,
    qual_advanced = 0,
    qual_sold = 0,
    dqd = 0,
    deals_won = 0,
    mrr = 0
  } = metrics;

  const asp = deals_won > 0 ? Math.round(mrr / deals_won) : 0;

  // Per-rep averages for Magic Formula (based on meetings scheduled for the day)
  const totalMeetings = meetings_scheduled || (scheduled + no_shows + canceled + held);
  const meetingsPerRep = +(totalMeetings / NUM_REPS).toFixed(1);
  const qualOppsPerRep = +((qual_advanced + qual_sold) / NUM_REPS).toFixed(1);
  const conversionsPerRep = +(deals_won / NUM_REPS).toFixed(1);

  // Weekly pace: are we on track for 125 by Friday?
  const bizDay = businessDayOfWeek(date);
  const weeklyPaceTarget = (TARGETS.weeklyMeetings / 5) * bizDay;
  const meetingsOnPace = weekly_meetings_cumulative >= weeklyPaceTarget;

  const lines = [
    `Sales Pulse ${formatDate(date)}`,
    '',
    narrative || '',
    '',
    'Magic Formula',
    `${TARGETS.meetingsPerRep} meetings: ${meetingsPerRep} ${meetingsOnPace ? ':white_check_mark:' : ':fire:'}`,
    `${TARGETS.qualOppsPerRep} Qual Opps: ${qualOppsPerRep} ${indicator(qualOppsPerRep, TARGETS.qualOppsPerRep)}`,
    `${TARGETS.conversionsPerRep} Conversions: ${conversionsPerRep} ${indicator(conversionsPerRep, TARGETS.conversionsPerRep)}`,
    '',
    'Outbound',
    `${emails_sent.toLocaleString()} emails sent`,
    `${dials} dials made`,
    `Another ${meetings_booked} meetings booked`,
    `Weekly ${TARGETS.weeklyMeetings} target: ${weekly_meetings_cumulative} ${indicator(weekly_meetings_cumulative, TARGETS.weeklyMeetings)}`,
    '',
    'Meetings',
    `${meetings_scheduled || scheduled} scheduled for today`,
    `${no_shows} no-shows, ${canceled} canceled`,
    `${held} held`,
    `${qual_advanced} qual-advanced, ${qual_sold} qualified-sold`,
    `${dqd} DQ'd`,
    '',
    'Conversion & Revenue',
    `${deals_won} deals won`,
    `MRR sold: $${mrr.toLocaleString()} ${indicator(mrr, 1)}`,
    `ASP: $${asp.toLocaleString()} ${indicator(asp, 1)}`
  ];

  return lines.join('\n');
}

function formatDate(date) {
  const d = date || new Date();
  const month = d.toLocaleDateString('en-US', { month: 'long' });
  const day = d.getDate();
  return `${month} ${ordinal(day)}`;
}

module.exports = { formatSalesPulse, TARGETS, NUM_REPS };
