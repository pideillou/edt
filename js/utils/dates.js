/**
 * Outils de dates. Tout est calculé dans le fuseau Europe/Paris,
 * quel que soit le fuseau de l'appareil.
 * Un jour est représenté par une clé "AAAA-MM-JJ".
 */

export const TIME_ZONE = 'Europe/Paris';

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Découpe une date en composantes dans le fuseau de Paris.
 * @param {Date} date
 * @returns {{year:number, month:number, day:number, hour:number, minute:number}}
 */
export function parisParts(date) {
  const parts = {};
  for (const { type, value } of partsFormatter.formatToParts(date)) {
    parts[type] = Number(value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
}

/**
 * Clé du jour (heure de Paris) d'un instant.
 * @param {Date} date
 * @returns {string}
 */
export function dayKey(date) {
  const p = parisParts(date);
  return makeKey(p.year, p.month, p.day);
}

/**
 * Minutes écoulées depuis minuit (heure de Paris).
 * @param {Date} date
 * @returns {number}
 */
export function minutesOfDay(date) {
  const p = parisParts(date);
  return p.hour * 60 + p.minute;
}

/**
 * @param {number} year
 * @param {number} month 1 à 12
 * @param {number} day
 * @returns {string}
 */
export function makeKey(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @param {string} key
 * @returns {Date} minuit UTC du jour, utilisé seulement pour l'arithmétique
 */
function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * @param {string} key
 * @param {number} days
 * @returns {string}
 */
export function addDays(key, days) {
  const date = keyToUtc(key);
  date.setUTCDate(date.getUTCDate() + days);
  return makeKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Jour de la semaine, lundi = 0 et dimanche = 6.
 * @param {string} key
 * @returns {number}
 */
export function weekdayIndex(key) {
  return (keyToUtc(key).getUTCDay() + 6) % 7;
}

/**
 * @param {string} key
 * @returns {string} clé du lundi de la même semaine
 */
export function mondayOf(key) {
  return addDays(key, -weekdayIndex(key));
}

/**
 * Convertit une heure locale de Paris en instant absolu.
 * @returns {Date}
 */
export function parisLocalToDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) {
    const p = parisParts(new Date(guess));
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, second);
    guess += wanted - shown;
  }
  return new Date(guess);
}

const dayLong = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const fullFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** @param {string} key @returns {string} « lundi 9 novembre » */
export const formatDayLong = (key) => dayLong.format(keyToUtc(key));
/** @param {string} key @returns {string} « lun. 9 » */
export const formatDayShort = (key) => dayShort.format(keyToUtc(key));
/** @param {string} key @returns {string} « 9 nov. » */
export const formatDayMonth = (key) => dayMonth.format(keyToUtc(key));
/** @param {Date} date @returns {string} « 08:30 » */
export const formatTime = (date) => timeFormat.format(date);
/** @param {Date} date @returns {string} */
export const formatFull = (date) => fullFormat.format(date);

/**
 * Durée lisible : « 1 h 30 », « 45 min ».
 * @param {number} minutes
 * @returns {string}
 */
export function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/**
 * Temps relatif court : « il y a 12 min », « dans 2 h ».
 * @param {Date} date
 * @param {Date} now
 * @returns {string}
 */
export function formatRelative(date, now) {
  const diff = Math.round((date - now) / 60000);
  const abs = Math.abs(diff);
  let text;
  if (abs < 1) return 'à l’instant';
  if (abs < 60) text = `${abs} min`;
  else if (abs < 60 * 24) text = formatDuration(abs);
  else text = `${Math.round(abs / (60 * 24))} j`;
  return diff < 0 ? `il y a ${text}` : `dans ${text}`;
}

const monthFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/** @param {string} key @returns {string} « novembre 2026 » */
export const formatMonth = (key) => monthFormat.format(keyToUtc(key));

const dateShort = new Intl.DateTimeFormat('fr-FR', { timeZone: TIME_ZONE, weekday: 'short', day: 'numeric', month: 'short' });

/** @param {Date} date @returns {string} « ven. 27 nov. » */
export const formatDateShort = (date) => dateShort.format(date);
