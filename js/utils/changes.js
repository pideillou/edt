/**
 * Comparaison entre deux versions d'un planning.
 * Chaque cours garde le même UID d'une version à l'autre, ce qui permet
 * de repérer un cours déplacé plutôt qu'un cours supprimé puis ajouté.
 */

/**
 * Version légère d'un cours, gardée dans le localStorage comme référence.
 * @param {Object} e
 * @returns {Object}
 */
function light(e) {
  return {
    uid: e.uid,
    start: e.start.getTime(),
    end: e.end.getTime(),
    room: e.room,
    cancelled: e.isCancelled,
    title: [e.code || e.title || e.summary, e.type].filter(Boolean).join(' '),
  };
}

/**
 * Référence à enregistrer : seulement les cours à venir, hors journées entières.
 * @param {Array<Object>} events
 * @param {Date} now
 * @returns {Array<Object>}
 */
export function makeBaseline(events, now) {
  return events.filter((e) => !e.allDay && e.end > now).map(light);
}

/**
 * Liste des changements entre la référence et la nouvelle version.
 * Les simples changements de libellé sont ignorés.
 * @param {Array<Object>} baseline résultat de makeBaseline sur l'ancienne version
 * @param {Array<Object>} events cours de la nouvelle version
 * @param {Date} now
 * @returns {Array<{kind: string, uid: string, title: string, start: number, end: number, before: Object|null}>}
 */
export function diffEvents(baseline, events, now) {
  const limit = now.getTime();
  const before = new Map(baseline.map((b) => [b.uid, b]));
  const current = new Map(events.filter((e) => !e.allDay).map((e) => [e.uid, light(e)]));
  const changes = [];

  for (const [uid, next] of current) {
    const old = before.get(uid);
    if (!old) {
      if (next.end > limit && !next.cancelled) changes.push({ kind: 'added', uid, ...pick(next), before: null });
      continue;
    }
    if (next.end <= limit && old.end <= limit) continue;
    if (next.cancelled && !old.cancelled) {
      changes.push({ kind: 'cancelled', uid, ...pick(next), before: old });
    } else if (next.start !== old.start || next.end !== old.end) {
      changes.push({ kind: 'moved', uid, ...pick(next), before: old });
    } else if (next.room !== old.room) {
      changes.push({ kind: 'room', uid, ...pick(next), before: old });
    }
  }

  for (const [uid, old] of before) {
    if (!current.has(uid) && old.end > limit && !old.cancelled) {
      changes.push({ kind: 'removed', uid, ...pick(old), before: old });
    }
  }

  return changes.sort((a, b) => a.start - b.start);
}

function pick(item) {
  return { title: item.title, start: item.start, end: item.end, room: item.room };
}
