// For reading in env vars from '.env' file
require('dotenv').config();
// HTTP
const express = require('express');
// Logging
const logger = require('pino')();
// Enable CORS
const cors = require('cors');

/*
 * Configuration
 * 
 * Externalized through environment variables, which may be set either in `.env` or on the system.
 */
// Calendar ID to read events from. Can be attained via the "Calendar ID" field in Google Calendar > Calendar Settings > Integrate Calendar
const CALENDAR_ID = process.env.CALENDAR_ID;
// This is configured in the Google Cloud Console under Credentials
const API_KEY = process.env.API_KEY;
// Number of events we'll fetch from the API; default to 10 if undefined
const NUM_EVENTS_TO_FETCH = process.env.NUM_EVENTS_TO_FETCH || 10;
// Logging verbosity, default to "info" (which is quiet as to not pollute server logs; "debug" is where we send event output)
const LOG_VERBOSITY = process.env.LOG_VERBOSITY || "info";
// HTTP Port to listen on; default to 3000
const HTTP_PORT = process.env.HTTP_PORT || 3000;
// Number of seconds between refreshing the cache
const SECONDS_BETWEEN_CACHE_REFRESH = process.env.SECONDS_BETWEEN_CACHE_REFRESH || 60;

/*
 * Constants
 */
const HEADER_CONTENT_TYPE = "Content-Type";
const MIME_TYPE_JSON = "application/json";

/*
 * Precondition checks
 */
if (CALENDAR_ID === undefined) {
  throw new Error("env var 'CALENDAR_ID' is required. Attain from Google Calendar > Calendar Settings > Integrate Calendar");
}
if (API_KEY === undefined) {
  throw new Error("env var 'API_KEY' is required. Attain from Google Cloud Console > Google API > Credentials");
}

/* 
 * Configure Logging
 */
logger.level = LOG_VERBOSITY;

/* 
 * Hold the calendar events
 */
var calendarEvents;

/*
 * Set up HTTP Server
 */
const app = express();

/*
 * Configure CORS
 */
app.use(cors());

app.listen(HTTP_PORT, (error) => {
  if (!error) {
    logger.info("Server running on port: " + HTTP_PORT);
    // Cache the first events after server startup
    cacheEvents();
  }
  else
    logger.error("Error in starting HTTP Server", error);
}
);
app.get('/events', (request, response) => {
  response.status(200);
  response.set(HEADER_CONTENT_TYPE, MIME_TYPE_JSON);
  response.send(getEvents());
});

// Set up cache refresh
setInterval(cacheEvents, SECONDS_BETWEEN_CACHE_REFRESH * 1000);

// Constants
const { google } = require('googleapis');
const cal = google.calendar({
  version: 'v3',
  auth: API_KEY
});

/**
 * Returns the array of calendar events; if not yet defined, attains these and caches them
 * 
 * @returns The array of calendar events
 */
function getEvents() {
  if (calendarEvents === undefined) {
    cacheEvents();
  }
  return calendarEvents;
}

/**
 * Fetch and cache the latest calendar events
 */
function cacheEvents() {
  // Pre-fetch the first calendar events
  fetchEvents().then(
    response => {
      calendarEvents = response;
      logger.debug(JSON.stringify(calendarEvents));
      logger.info('Refreshed Cache');
    }
  )
}

/**
 * Lists the upcoming events for CALENDAR_ID
 *  
 * @return An JSON representation of calendar events, each event with keys: start, end, summary, hangoutLink, htmlLink, location, description
 */
async function fetchEvents() {
  const calendar = cal;
  const calEvents = [];
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults: NUM_EVENTS_TO_FETCH,
    singleEvents: true,
    orderBy: 'startTime',
  });
  const events = res.data.items;
  if (!events || events.length === 0) {
    logger.debug('No upcoming events found.');
    return calEvents;
  }
  logger.debug('Next (max) ' + NUM_EVENTS_TO_FETCH + ' Events:');
  events.map((event, i) => {

    // Hold the object
    const calEvent = new Object();
    calEvent.start = event.start.dateTime || event.start.date;
    calEvent.end = event.end.dateTime || event.end.date;
    calEvent.summary = event.summary;
    calEvent.hangoutLink = event.hangoutLink;
    calEvent.htmlLink = event.htmlLink;
    calEvent.location = event.location;
    calEvent.description = event.description;

    calEvents.push(calEvent);

    const eventDetail = "\nSummary: " + calEvent.summary + "\nHangout Link: " +
      calEvent.hangoutLink + "\nHTML Link: " +
      calEvent.htmlLink + "\nLocation: " +
      calEvent.location + "\nStart: " +
      calEvent.start + "\nEnd: " +
      calEvent.end + "\nDescription: " +
      calEvent.description + "\n"
    logger.debug(eventDetail);
  });
  return JSON.stringify(calEvents);
}
