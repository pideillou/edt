import { dayKey } from './dates.js';

/**
 * Salles citées dans les plannings (champ LOCATION). Un cours peut
 * occuper plusieurs salles, séparées par des espaces : « R03 R02 ».
 * @param {Array<Object>} events
 * @returns {Array<string>} triées dans l'ordre naturel (101, 102… R01…)
 */
export function listRooms(events) {
  const rooms = new Set();
  for (const e of events) for (const room of roomsOf(e)) rooms.add(room);
  return [...rooms].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
}

/** @param {Object} e @returns {Array<string>} */
function roomsOf(e) {
  return e.room.split(/\s+/).filter(Boolean);
}

/**
 * Occupation des salles à un instant donné.
 * Une salle occupée l'est jusqu'à la fin du bloc de cours qui s'enchaînent.
 * @param {Array<Object>} events cours des trois promos
 * @param {Date} at
 * @returns {{free: Array<{room:string, until:Date|null}>, busy: Array<{room:string, until:Date, event:Object}>}}
 */
export function roomStatus(events, at) {
  const key = dayKey(at);
  const sameDay = events.filter((e) => !e.allDay && !e.isCancelled && e.startKey === key);
  const free = [];
  const busy = [];

  for (const room of listRooms(events)) {
    const booked = sameDay.filter((e) => roomsOf(e).includes(room)).sort((a, b) => a.start - b.start);
    const current = booked.find((e) => e.start <= at && e.end > at);
    if (current) {
      let until = current.end;
      for (const e of booked) {
        if (e.start <= until && e.end > until) until = e.end;
      }
      busy.push({ room, until, event: current });
    } else {
      const next = booked.find((e) => e.start > at);
      free.push({ room, until: next ? next.start : null });
    }
  }

  free.sort((a, b) => (b.until ?? Infinity) - (a.until ?? Infinity) || a.room.localeCompare(b.room, 'fr', { numeric: true }));
  busy.sort((a, b) => a.until - b.until || a.room.localeCompare(b.room, 'fr', { numeric: true }));
  return { free, busy };
}
