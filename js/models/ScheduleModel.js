import { dayKey, addDays, mondayOf, weekdayIndex, minutesOfDay, makeKey } from '../utils/dates.js';

/** Groupes disponibles, rangés par année pour le menu déroulant. */
export const GROUPS = [
  { id: 'but1-g1', label: 'BUT1 G1', year: 'BUT1' },
  { id: 'but1-g2', label: 'BUT1 G2', year: 'BUT1' },
  { id: 'but1-g3', label: 'BUT1 G3', year: 'BUT1' },
  { id: 'but1-g4', label: 'BUT1 G4', year: 'BUT1' },
  { id: 'but2-g1', label: 'BUT2 G1 / G2', year: 'BUT2' },
  { id: 'but2-g3', label: 'BUT2 G3', year: 'BUT2' },
  { id: 'but3-g1', label: 'BUT3 G1', year: 'BUT3' },
  { id: 'but3-g21', label: 'BUT3 G21', year: 'BUT3' },
  { id: 'but3-g22', label: 'BUT3 G22', year: 'BUT3' },
  { id: 'but3-g3', label: 'BUT3 G3', year: 'BUT3' },
  { id: 'mmi1', label: 'MMI1', year: 'Promo entière' },
  { id: 'mmi2', label: 'MMI2', year: 'Promo entière' },
  { id: 'mmi3', label: 'MMI3', year: 'Promo entière' },
];

export const VIEWS = ['day', 'week', 'month'];

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
    this.#calendarName = '';
    this.#emit();
  }

  /** @returns {string} */
  get group() {
    return this.#group;
  }

  /** @param {'day'|'week'|'month'} view */
  setView(view) {
    this.#view = VIEWS.includes(view) ? view : 'week';
    this.#emit();
  }

  /** @returns {'day'|'week'|'month'} */
  get view() {
    return this.#view;
  }

  /**
   * Affiche un jour précis, et passe en vue jour si demandé.
   * @param {string} key « AAAA-MM-JJ »
   * @param {boolean} openDay
   */
  showDay(key, openDay = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    this.#cursor = key;
    if (openDay) this.#view = 'day';
    this.#emit();
  }

  /** @param {Partial<{state:string, fetchedAt:number, publishedAt:Date, message:string}>} patch */
  setStatus(patch) {
    this.#status = { ...this.#status, ...patch };
    this.#emit();
  }

  /** @returns {{state:string, fetchedAt:number|null, publishedAt:Date|null}} */
  get status() {
    return this.#status;
  }

  /** Met à jour l'heure courante (ligne de l'heure, prochain cours). */
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
    if (this.#view === 'month') {
      const [y, m] = this.#cursor.split('-').map(Number);
      const index = y * 12 + (m - 1) + direction;
      this.#cursor = makeKey(Math.floor(index / 12), (index % 12) + 1, 1);
    } else if (this.#view === 'week') {
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

  #dayData(key, today) {
    const timed = this.#events.filter((e) => !e.allDay && e.startKey === key);
    const allDay = this.#events.filter((e) => e.allDay && key >= e.startKey && key < e.endKey);
    return {
      key,
      isToday: key === today,
      isWeekend: weekdayIndex(key) >= 5,
      isSelected: key === this.#cursor,
      timed,
      allDay,
      count: timed.filter((e) => !e.isCancelled).length,
      cancelled: timed.filter((e) => e.isCancelled).length,
    };
  }

  /** Lundi à vendredi de la semaine du curseur, plus le week-end s'il y a cours. */
  #weekKeys() {
    const monday = mondayOf(this.#cursor);
    const keys = [];
    for (let i = 0; i < 7; i += 1) {
      const key = addDays(monday, i);
      if (i < 5 || this.#hasEvents(key) || key === this.#cursor) keys.push(key);
    }
    return keys;
  }

  /** Semaines complètes (lundi à dimanche) couvrant le mois du curseur. */
  #monthWeeks(today) {
    const [y, m] = this.#cursor.split('-').map(Number);
    const first = makeKey(y, m, 1);
    const monthPrefix = first.slice(0, 7);
    const weeks = [];
    let key = mondayOf(first);
    while (key.slice(0, 7) <= monthPrefix || weekdayIndex(key) !== 0) {
      if (weekdayIndex(key) === 0) weeks.push([]);
      const day = this.#dayData(key, today);
      day.inMonth = key.slice(0, 7) === monthPrefix;
      weeks[weeks.length - 1].push(day);
      key = addDays(key, 1);
    }
    return { weeks, month: first };
  }

  /** Données prêtes à afficher par la vue. */
  get snapshot() {
    const today = dayKey(this.#now);
    const upcoming = this.#events.filter((e) => !e.allDay && !e.isCancelled && e.end > this.#now);

    const base = {
      group: this.#group,
      calendarName: this.#calendarName,
      view: this.#view,
      cursor: this.#cursor,
      now: this.#now,
      nowMinutes: minutesOfDay(this.#now),
      current: upcoming.find((e) => e.start <= this.#now) ?? null,
      next: upcoming.find((e) => e.start > this.#now) ?? null,
      status: this.#status,
      hasData: this.#events.length > 0,
    };

    if (this.#view === 'month') {
      return { ...base, ...this.#monthWeeks(today), days: [] };
    }

    const strip = this.#weekKeys().map((key) => this.#dayData(key, today));
    const keys = this.#view === 'day' ? [this.#cursor] : strip.map((d) => d.key);
    const days = keys.map((key) => this.#dayData(key, today));

    let start = DEFAULT_START;
    let end = DEFAULT_END;
    for (const day of days) {
      for (const e of day.timed) {
        start = Math.min(start, Math.floor(minutesOfDay(e.start) / 60) * 60);
        end = Math.max(end, Math.ceil(minutesOfDay(e.end) / 60) * 60);
      }
    }

    return { ...base, days, strip, range: { start, end: Math.min(end, 24 * 60) } };
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot }));
  }
}
