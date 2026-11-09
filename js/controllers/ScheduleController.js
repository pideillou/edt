import { parseIcs } from '../utils/icsParser.js';
import { GROUPS } from '../models/ScheduleModel.js';

const AUTO_REFRESH_MS = 30 * 60 * 1000;
const STALE_MS = 10 * 60 * 1000;

/**
 * Relie le modèle, la vue et les services.
 */
export default class ScheduleController {
  #model;
  #view;
  #ics;
  #storage;
  #lastFetch = 0;
  #requestId = 0;

  /**
   * @param {import('../models/ScheduleModel.js').default} model
   * @param {import('../views/ScheduleView.js').default} view
   * @param {import('../services/IcsService.js').default} ics
   * @param {import('../services/StorageService.js').default} storage
   */
  constructor(model, view, ics, storage) {
    this.#model = model;
    this.#view = view;
    this.#ics = ics;
    this.#storage = storage;

    model.addEventListener('change', (event) => view.render(event.detail));
    view.bindGroupChange((group) => this.#selectGroup(group));
    view.bindRefresh(() => this.refresh());
    view.bindNavigate((direction) => model.move(direction));
    view.bindToday(() => model.goToday());
    view.bindView((mode) => {
      model.setView(mode);
      storage.set('view', mode);
    });
    view.bindOpenEvent((uid) => {
      const event = model.findEvent(uid);
      if (event) view.showEvent(event);
    });
  }

  /** Démarre l'application avec les préférences enregistrées. */
  start() {
    const savedView = this.#storage.get('view');
    const wide = window.matchMedia('(min-width: 48em)').matches;
    this.#view.renderGroups(GROUPS, '');
    this.#model.setView(savedView ?? (wide ? 'week' : 'day'));
    this.#selectGroup(this.#storage.get('group', ''));

    setInterval(() => this.#model.tick(), 60 * 1000);
    setInterval(() => this.refresh(), AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      this.#model.tick();
      if (Date.now() - this.#lastFetch > STALE_MS) this.refresh();
    });
    window.addEventListener('online', () => this.refresh());
  }

  #selectGroup(group) {
    this.#model.setGroup(group);
    this.#storage.set('group', this.#model.group);
    if (!this.#model.group) return;

    const cached = this.#ics.cached(this.#model.group);
    if (cached) {
      this.#apply(cached.text);
      this.#model.setStatus({ fetchedAt: cached.fetchedAt, publishedAt: null, state: 'idle', message: '' });
    } else {
      this.#model.setStatus({ fetchedAt: null, publishedAt: null });
    }
    this.refresh();
  }

  #apply(text) {
    const { name, events } = parseIcs(text);
    this.#model.setEvents(events, name);
  }

  /** Télécharge la dernière version du planning du groupe choisi. */
  async refresh() {
    const group = this.#model.group;
    if (!group) return;
    const id = ++this.#requestId;
    this.#lastFetch = Date.now();
    this.#model.setStatus({ state: 'loading', message: '' });

    try {
      const [{ text, fetchedAt }, publishedAt] = await Promise.all([
        this.#ics.fetchIcs(group),
        this.#ics.fetchPublishedAt(group),
      ]);
      if (id !== this.#requestId) return;
      this.#apply(text);
      this.#model.setStatus({ state: 'ok', fetchedAt, publishedAt: publishedAt ?? this.#model.status.publishedAt });
    } catch (error) {
      if (id !== this.#requestId) return;
      const cached = this.#ics.cached(group);
      if (!navigator.onLine || cached) {
        this.#model.setStatus({
          state: 'offline',
          message: cached ? 'affichage de la dernière copie' : 'aucune copie enregistrée',
        });
      } else {
        this.#model.setStatus({ state: 'error', message: `Échec du téléchargement (${error.message}).` });
      }
    }
  }
}
