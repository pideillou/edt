import { dayKey, addDays, mondayOf, weekdayIndex, minutesOfDay } from '../utils/dates.js';

export const GROUPS = [
  { id: 'but1-g1', label: 'BUT1 G1' },
  { id: 'but1-g2', label: 'BUT1 G2' },
  { id: 'but1-g3', label: 'BUT1 G3' },
  { id: 'but1-g4', label: 'BUT1 G4' },
  { id: 'but2-g1', label: 'BUT2 G1 / G2' },
  { id: 'but2-g3', label: 'BUT2 G3' },
  { id: 'but3-g1', label: 'BUT3 G1' },
  { id: 'but3-g21', label: 'BUT3 G21' },
  { id: 'but3-g22', label: 'BUT3 G22' },
  { id: 'but3-g3', label: 'BUT3 G3' },
  { id: 'mmi1', label: 'MMI1 (toute la promo)' },
  { id: 'mmi2', label: 'MMI2 (toute la promo)' },
  { id: 'mmi3', label: 'MMI3 (toute la promo)' },
];

const DEFAULT_START = 8 * 60;
const DEFAULT_END = 18 * 60;

/**
 * État de l'emploi du temps et règles d'affichage.
 * Émet « change » à chaque modification.
 */
export default class ScheduleModel extends EventTarget {
  #events = [];
  #calendarName = '';
  #group = '';
  #view = 'week';
  #cursor;
  #now = new Date();
  #status = { state: 'idle', fetchedAt: null, publishedAt: null, message: '' };

  constructor() {
    super();
    this.#cursor = dayKey(this.#now);
  }

  /**
   * @param {Array<Object>} events
   * @param {string} calendarName
   */
  setEvents(events, calendarName = '') {
    this.#events = events;
    this.#calendarName = calendarName;
    this.#emit();
  }

  /** @param {string} group */
  setGroup(group) {
    this.#group = GROUPS.some((g) => g.id === group) ? group : '';
    this.#events = [];
    this.#emit();
  }

  /** @returns {string} */
  get group() {
    return this.#group;
  }

  /** @param {'day'|'week'} view */
  setView(view) {
    this.#view = view === 'day' ? 'day' : 'week';
    this.#emit();
  }

  /** @returns {'day'|'week'} */
  get view() {
    return this.#view;
  }

  /** @param {Partial<{state:string, fetchedAt:number, publishedAt:Date, message:string}>} patch */
  setStatus(patch) {
    this.#status = { ...this.#status, ...patch };
    this.#emit();
  }

  /** @returns {{state:string, fetchedAt:number|null}} */
  get status() {
    return this.#status;
  }

  /** Met à jour l'heure courante (ligne rouge, prochain cours). */
  tick() {
    this.#now = new Date();
    this.#emit();
  }

  /** Revient à aujourd'hui. */
  goToday() {
    this.#now = new Date();
    this.#cursor = dayKey(this.#now);
    this.#emit();
  }

  /** @param {number} direction -1 ou 1 */
  move(direction) {
    if (this.#view === 'week') {
      this.#cursor = addDays(mondayOf(this.#cursor), 7 * direction);
    } else {
      let key = addDays(this.#cursor, direction);
      for (let i = 0; i < 2 && weekdayIndex(key) >= 5 && !this.#hasEvents(key); i += 1) {
        key = addDays(key, direction);
      }
      this.#cursor = key;
    }
    this.#emit();
  }

  /** @param {string} uid @returns {Object|undefined} */
  findEvent(uid) {
    return this.#events.find((e) => e.uid === uid);
  }

  #hasEvents(key) {
    return this.#events.some((e) => (e.allDay ? key >= e.startKey && key < e.endKey : e.startKey === key));
  }

  /** Jours affichés : le jour sélectionné, ou lundi à vendredi (+ week-end s'il y a cours). */
  #visibleKeys() {
    if (this.#view === 'day') return [this.#cursor];
    const monday = mondayOf(this.#cursor);
    const keys = [];
    for (let i = 0; i < 7; i += 1) {
      const key = addDays(monday, i);
      if (i < 5 || this.#hasEvents(key)) keys.push(key);
    }
    return keys;
  }

  /** Données prêtes à afficher par la vue. */
  get snapshot() {
    const today = dayKey(this.#now);
    const keys = this.#visibleKeys();
    let start = DEFAULT_START;
    let end = DEFAULT_END;

    const days = keys.map((key) => {
      const timed = this.#events.filter((e) => !e.allDay && e.startKey === key);
      const allDay = this.#events.filter((e) => e.allDay && key >= e.startKey && key < e.endKey);
      for (const e of timed) {
        start = Math.min(start, Math.floor(minutesOfDay(e.start) / 60) * 60);
        end = Math.max(end, Math.ceil(minutesOfDay(e.end) / 60) * 60);
      }
      return { key, isToday: key === today, timed, allDay };
    });

    const upcoming = this.#events.filter((e) => !e.allDay && !e.isCancelled && e.end > this.#now);
    const current = upcoming.find((e) => e.start <= this.#now) ?? null;
    const next = upcoming.find((e) => e.start > this.#now) ?? null;

    return {
      group: this.#group,
      calendarName: this.#calendarName,
      view: this.#view,
      cursor: this.#cursor,
      isCurrentPeriod: keys.includes(today),
      days,
      range: { start, end: Math.min(end, 24 * 60) },
      now: this.#now,
      nowMinutes: minutesOfDay(this.#now),
      current,
      next,
      status: this.#status,
      hasData: this.#events.length > 0,
    };
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot }));
  }
}
