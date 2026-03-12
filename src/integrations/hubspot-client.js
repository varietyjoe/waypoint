/**
 * HubSpot API Client
 * Pulls sales metrics from HubSpot CRM v3 Search API
 */

const HUBSPOT_BASE = 'https://api.hubapi.com';
const TIMEZONE = 'America/New_York';

// Sales rep owner IDs — meetings, dials counted across these reps
const REP_OWNER_IDS = [
  '1939891409', // Nathan Craggett
  '1588121861', // John Curtis
  '616176996'   // Connor Harrington
];

// Emails counted across reps + Joe
const EMAIL_OWNER_IDS = [
  '371658502',  // Joe Tancula
  ...REP_OWNER_IDS
];

// Sponsorship Sales pipeline
const PIPELINE_ID = '46208558';
const CLOSED_WON_STAGE = '94934839';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function hubspotRequest(token, endpoint, body, retries = 2) {
  const response = await fetch(`${HUBSPOT_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (response.status === 429 && retries > 0) {
    await sleep(500);
    return hubspotRequest(token, endpoint, body, retries - 1);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`HubSpot API error (${response.status}):`, text);
    return null;
  }

  return response.json();
}

/**
 * Get start/end timestamps for a date in EST/EDT
 */
function dayRange(date = new Date()) {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // YYYY-MM-DD
  const startMs = new Date(`${dateStr}T00:00:00-05:00`).getTime();
  const endMs = new Date(`${dateStr}T23:59:59-05:00`).getTime();
  return { startMs, endMs };
}

/**
 * Get the Monday of the week for a given date (EST)
 */
function getMonday(date = new Date()) {
  const dateStr = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const d = new Date(dateStr + 'T00:00:00-05:00');
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Get week range: Monday 00:00 EST through end of given date
 */
function weekRangeThrough(date = new Date()) {
  const monday = getMonday(date);
  const mondayStr = monday.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
  const startMs = new Date(`${mondayStr}T00:00:00-05:00`).getTime();
  const { endMs } = dayRange(date);
  return { startMs, endMs };
}

/**
 * Get deals closed-won for a date, filtered by owner
 */
async function getDealsClosedToday(token, ownerId, date) {
  const { startMs, endMs } = dayRange(date);

  const body = {
    filterGroups: [{
      filters: [
        { propertyName: 'closedate', operator: 'GTE', value: startMs.toString() },
        { propertyName: 'closedate', operator: 'LTE', value: endMs.toString() },
        { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_ID },
        { propertyName: 'dealstage', operator: 'EQ', value: CLOSED_WON_STAGE }
      ]
    }],
    properties: ['dealname', 'amount', 'hs_mrr', 'closedate', 'dealstage', 'hubspot_owner_id'],
    limit: 100
  };

  const data = await hubspotRequest(token, '/crm/v3/objects/deals/search', body);
  return data?.results || [];
}

/**
 * Query an engagement type across all reps for a time range
 * @param {string} dateProperty - which date field to filter on (hs_timestamp or hs_createdate)
 */
async function getRepEngagements(token, type, startMs, endMs, dateProperty = 'hs_timestamp', ownerIds = REP_OWNER_IDS) {
  const endpoint = type === 'MEETING' ? '/crm/v3/objects/meetings/search'
    : type === 'EMAIL' ? '/crm/v3/objects/emails/search'
    : type === 'CALL' ? '/crm/v3/objects/calls/search'
    : null;

  if (!endpoint) return [];

  const properties = type === 'MEETING'
    ? ['hs_meeting_title', 'hs_meeting_outcome', 'hs_meeting_start_time', 'hs_createdate']
    : [];

  const results = await Promise.all(ownerIds.map(async (repId) => {
    const body = {
      filterGroups: [{
        filters: [
          { propertyName: dateProperty, operator: 'GTE', value: startMs.toString() },
          { propertyName: dateProperty, operator: 'LTE', value: endMs.toString() },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: repId }
        ]
      }],
      ...(properties.length ? { properties } : {}),
      limit: 100
    };

    const data = await hubspotRequest(token, endpoint, body);
    return data?.results || [];
  }));

  return results.flat();
}

/**
 * Break down meetings by outcome into Sales Pulse categories
 */
function categorizeMeetings(meetings) {
  const counts = {
    scheduled: 0,
    no_shows: 0,
    canceled: 0,
    held: 0,
    qual_advanced: 0,
    qual_sold: 0,
    dqd: 0
  };

  for (const m of meetings) {
    const outcome = (m.properties?.hs_meeting_outcome || '').toUpperCase();

    if (outcome === 'SCHEDULED' || outcome === '') {
      counts.scheduled++;
    } else if (outcome === 'NO_SHOW') {
      counts.no_shows++;
    } else if (outcome === 'CANCELED') {
      counts.canceled++;
    } else if (outcome.startsWith('QUALIFIED - ADVANCE')) {
      counts.qual_advanced++;
      counts.held++;
    } else if (outcome.startsWith('QUALIFIED - SOLD')) {
      counts.qual_sold++;
      counts.held++;
    } else if (outcome.startsWith('DISQUAL')) {
      counts.dqd++;
      counts.held++;
    } else {
      counts.held++;
    }
  }

  return counts;
}

/**
 * Pull all available metrics from HubSpot for a date
 */
async function pullTodayMetrics(token, ownerId, date) {
  const { startMs: dayStart, endMs: dayEnd } = dayRange(date);
  const { startMs: weekStart } = weekRangeThrough(date);

  // Batch 1: deals + meetings scheduled for today
  const deals = await getDealsClosedToday(token, ownerId, date);
  await sleep(300);

  // Batch 2: meetings scheduled for today (hs_timestamp) + meetings booked today (hs_createdate)
  const [scheduledForToday, meetingsBooked] = await Promise.all([
    getRepEngagements(token, 'MEETING', dayStart, dayEnd, 'hs_timestamp'),
    getRepEngagements(token, 'MEETING', dayStart, dayEnd, 'hs_createdate')
  ]);
  await sleep(300);

  // Batch 3: emails (all 4 people) + calls (3 reps)
  const [emails, calls] = await Promise.all([
    getRepEngagements(token, 'EMAIL', dayStart, dayEnd, 'hs_timestamp', EMAIL_OWNER_IDS),
    getRepEngagements(token, 'CALL', dayStart, dayEnd)
  ]);
  await sleep(300);

  // Batch 4: weekly cumulative meetings (scheduled for Mon through target date)
  const weeklyMeetings = await getRepEngagements(token, 'MEETING', weekStart, dayEnd, 'hs_timestamp');

  const mrr = deals.reduce((sum, d) => {
    const val = parseFloat(d.properties?.hs_mrr || d.properties?.amount || 0);
    return sum + val;
  }, 0);

  const meetingBreakdown = categorizeMeetings(scheduledForToday);

  return {
    deals_won: deals.length,
    mrr: Math.round(mrr),
    meetings_booked: meetingsBooked.length,
    meetings_scheduled: scheduledForToday.length,
    weekly_meetings_cumulative: weeklyMeetings.length,
    emails_sent: emails.length,
    dials: calls.length,
    ...meetingBreakdown
  };
}

module.exports = {
  getDealsClosedToday,
  getRepEngagements,
  categorizeMeetings,
  pullTodayMetrics,
  REP_OWNER_IDS
};
