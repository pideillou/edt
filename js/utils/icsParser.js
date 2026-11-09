import { parisLocalToDate, dayKey, makeKey, addDays } from './dates.js';

/**
 * Parseur iCalendar (RFC 5545) limité à ce que produit l'export MMI :
 * VEVENT avec DTSTART/DTEND en UTC ou en date seule.
 */

/**
 * @param {string} value
 * @returns {string}
 */
function unescapeText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, c) => (c === 'n' || c === 'N' ? '\n' : c));
}

/**
 * @param {string} value
 * @param {Object<string,string>} params
 * @returns {{date: Date, allDay: boolean, key: string}}
 */
function parseDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) throw new Error(`Date ICS illisible : ${value}`);
  const [, y, mo, d, h, mi, s, z] = m;
  if (params.VALUE === 'DATE' || h === undefined) {
    const key = makeKey(+y, +mo, +d);
    return { date: parisLocalToDate(+y, +mo, +d), allDay: true, key };
  }
  const date = z
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : parisLocalToDate(+y, +mo, +d, +h, +mi, +s);
  return { date, allDay: false, key: dayKey(date) };
}

const TYPE_PATTERN = /^(CM|TD|TP|DS|Autonomie|Eval-[A-Za-z]+|Projet|Examen|Soutenance)$/i;
const GROUP_PATTERN = /^(.*?),\s*((?:BUT\d|MMI)[\w.-]*)$/;
const CODE_PATTERN = /^((?:SAÉ|SAE)\s+\S+|(?:R|PORTFOLIO)\S*\d\S*)\s*(.*)$/;

/**
 * Extrait code, type, enseignant et groupes du SUMMARY de l'export MMI.
 * Exemple : « R3.12 TD MORA Frédéric, BUT2-G1.BUT2-G2 ».
 * @param {string} summary
 * @param {string} description
 */
export function parseSummary(summary, description) {
  let rest = summary.trim();
  let isEval = false;
  let isCancelled = false;

  // Balises « [ANNULE] » et « [EVAL] », au début ou au milieu du titre (ex. « R3.01 TP [ANNULE] ADAMCZYK »).
  rest = rest.replace(/\s*\[([^\]]+)\]\s*/g, (match, inner) => {
    if (/^ANNUL/i.test(inner)) isCancelled = true;
    else if (/^EVAL/i.test(inner)) isEval = true;
    else return match;
    return ' ';
  }).trim();

  let groups = [];
  const g = rest.match(GROUP_PATTERN);
  if (g) {
    rest = g[1].trim();
    groups = g[2].split('.').filter(Boolean);
  }

  let code = '';
  const fromDescription = description.match(/^Code:\s*(.+?)\s+Durée:/);
  if (fromDescription && fromDescription[1] && rest.startsWith(fromDescription[1])) {
    code = fromDescription[1];
    rest = rest.slice(code.length).trim();
  } else {
    const c = rest.match(CODE_PATTERN);
    if (c) {
      code = c[1];
      rest = c[2].trim();
    }
  }

  let type = '';
  let teacher = '';
  let title = '';
  if (code) {
    const tokens = rest.split(/\s+/).filter(Boolean);
    const index = tokens.findIndex((t) => TYPE_PATTERN.test(t));
    if (index >= 0) {
      type = tokens[index];
      title = tokens.slice(0, index).join(' ');
      teacher = tokens.slice(index + 1).join(' ');
    } else {
      title = rest;
    }
    if (/^Eval/i.test(type)) isEval = true;
  } else {
    title = rest;
  }
  if (/^sauf cours$/i.test(teacher)) {
    title = teacher;
    teacher = '';
  }
  if (/^NON AFFECT[EÉ]$/i.test(teacher)) teacher = '';

  let label = '';
  if (description && !description.startsWith('Code:')) {
    const truncated = /(\.{3}|…)$/.test(description);
    label = description.replace(/(\.{3}|…)$/, '').trim();
    if (code && label.startsWith(code)) label = label.slice(code.length).trim();
    if (label && truncated) label += '…';
  }

  return { code, type, teacher, groups, title, label, isEval, isCancelled };
}

/**
 * Transforme le texte d'un fichier .ics en liste d'événements triés.
 * @param {string} text
 * @returns {{name: string, events: Array<Object>}}
 */
export function parseIcs(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let name = '';
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const [prop, ...rawParams] = line.slice(0, colon).split(';');
    const value = line.slice(colon + 1);
    const params = Object.fromEntries(rawParams.map((p) => p.split('=')));

    if (!current) {
      if (prop === 'X-WR-CALNAME') name = unescapeText(value);
      continue;
    }
    if (prop === 'DTSTART' || prop === 'DTEND') current[prop] = parseDate(value, params);
    else current[prop] = unescapeText(value);
  }

  const result = [];
  for (const raw of events) {
    if (!raw.DTSTART) continue;
    const start = raw.DTSTART;
    let end = raw.DTEND;
    if (!end) {
      end = start.allDay
        ? { date: start.date, allDay: true, key: addDays(start.key, 1) }
        : start;
    }
    const summary = raw.SUMMARY ?? '';
    const description = raw.DESCRIPTION ?? '';
    result.push({
      uid: raw.UID ?? `${start.date.getTime()}-${summary}`,
      start: start.date,
      end: end.date,
      allDay: start.allDay,
      startKey: start.key,
      endKey: start.allDay ? end.key : start.key,
      room: (raw.LOCATION ?? '').trim(),
      summary,
      description,
      ...parseSummary(summary, description),
    });
  }
  result.sort((a, b) => a.start - b.start || a.end - b.end);
  return { name, events: result };
}
