const fs = require('fs');

/**
 * Parses iCal date string into JavaScript Date object
 * Handles UTC (20260602T140000Z) and Local Time (20260602T100000)
 */
function parseICalDate(dateStr) {
  if (!dateStr) return null;

  // Clean value parameters (e.g., DTSTART;TZID=America/New_York:20260602T100000)
  const cleanStr = dateStr.split(':').pop();

  const year = parseInt(cleanStr.substring(0, 4), 10);
  const month = parseInt(cleanStr.substring(4, 6), 10) - 1; // 0-indexed
  const day = parseInt(cleanStr.substring(6, 8), 10);

  if (cleanStr.includes('T')) {
    const hour = parseInt(cleanStr.substring(9, 11), 10);
    const minute = parseInt(cleanStr.substring(11, 13), 10);
    const second = parseInt(cleanStr.substring(13, 15), 10);

    if (cleanStr.endsWith('Z')) {
      // UTC time
      return new Date(Date.UTC(year, month, day, hour, minute, second));
    } else {
      // Floating / Local time (construct using local timezone)
      return new Date(year, month, day, hour, minute, second);
    }
  } else {
    // All-day event (start of day)
    return new Date(year, month, day, 0, 0, 0);
  }
}

/**
 * Unfolds long folded lines in ICS files
 */
function unfoldICS(icsText) {
  // Long lines are folded by splitting them and adding a space or tab at the beginning of the next line
  return icsText.replace(/\r?\n[ \t]/g, '');
}

/**
 * Extracts video meeting URLs from locations and descriptions
 */
function extractMeetingLink(description, location) {
  const combinedText = `${description || ''} ${location || ''}`;
  
  // Patterns for major video conferencing tools
  const patterns = {
    googleMeet: /https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i,
    zoom: /https:\/\/([a-z0-9]+\.)?zoom\.us\/j\/[0-9]+(\?pwd=[a-zA-Z0-9]+)?/i,
    teams: /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[a-zA-Z0-9\-%\._~:\/\?&=]+/i,
    webex: /https:\/\/([a-z0-9]+\.)?webex\.com\/([a-z0-9]+\/)?j\.php\?[a-zA-Z0-9\-%\._~:\/\?&=]+/i
  };

  for (const key in patterns) {
    const match = combinedText.match(patterns[key]);
    if (match) {
      return match[0];
    }
  }

  // Fallback to any generic https link that might be a meeting link
  const genericMatch = combinedText.match(/https?:\/\/[^\s"'<>\(\)]+/i);
  if (genericMatch) {
    const url = genericMatch[0];
    // Exclude basic text assets or non-meeting links
    if (url.includes('google.com/calendar') || url.includes('schema.org')) {
      return null;
    }
    return url;
  }

  return null;
}

/**
 * Fetches and parses an ICS feed URL
 * Returns a sorted array of upcoming events for today
 */
async function fetchAndParseICS(url) {
  // Use Node 24 native fetch
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch iCal feed: HTTP ${response.status}`);
  }

  const rawData = await response.text();
  const unfoldedData = unfoldICS(rawData);
  const lines = unfoldedData.split(/\r?\n/);

  const events = [];
  let currentEvent = null;
  let inEvent = false;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('BEGIN:VEVENT')) {
      currentEvent = {};
      inEvent = true;
      continue;
    }

    if (line.startsWith('END:VEVENT')) {
      if (currentEvent && currentEvent.start) {
        // Post-process the event details
        currentEvent.link = extractMeetingLink(currentEvent.description, currentEvent.location);
        events.push(currentEvent);
      }
      currentEvent = null;
      inEvent = false;
      continue;
    }

    if (inEvent && currentEvent) {
      // Split line into key and value
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const keyPart = line.substring(0, colonIndex);
      const valPart = line.substring(colonIndex + 1);

      // Extract key and parameters
      const key = keyPart.split(';')[0].toUpperCase();

      switch (key) {
        case 'SUMMARY':
          // Unescape commas and semicolons
          currentEvent.summary = valPart.replace(/\\,/g, ',').replace(/\\;/g, ';');
          break;
        case 'DESCRIPTION':
          currentEvent.description = valPart
            .replace(/\\n/g, '\n')
            .replace(/\\,/g, ',')
            .replace(/\\;/g, ';');
          break;
        case 'LOCATION':
          currentEvent.location = valPart.replace(/\\,/g, ',').replace(/\\;/g, ';');
          break;
        case 'DTSTART':
          currentEvent.start = parseICalDate(line);
          break;
        case 'DTEND':
          currentEvent.end = parseICalDate(line);
          break;
        case 'ORGANIZER':
          // Format e.g., CN=John Doe:mailto:john@example.com
          const cnMatch = line.match(/CN=([^:;]+)/i);
          currentEvent.organizer = cnMatch ? cnMatch[1] : valPart.replace('mailto:', '');
          break;
        case 'UID':
          currentEvent.uid = valPart;
          break;
      }
    }
  }

  // Filter events:
  // 1. Must have a valid start date
  // 2. Filter out events that ended more than 10 minutes ago
  // 3. Keep events within the next 24 hours (or starting today)
  const now = new Date();
  const filterCutoff = new Date(now.getTime() - 10 * 60 * 1000); // 10 minutes ago
  const endLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours in the future

  const activeEvents = events.filter(event => {
    if (!event.start) return false;
    const eventEnd = event.end || new Date(event.start.getTime() + 30 * 60 * 1000); // Default to 30 min duration
    return eventEnd >= filterCutoff && event.start <= endLimit;
  });

  // Sort ascending by start time
  activeEvents.sort((a, b) => a.start - b.start);

  return activeEvents;
}

module.exports = {
  fetchAndParseICS,
  parseICalDate,
  unfoldICS
};
