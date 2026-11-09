import { parseIcs } from '../utils/icsParser.js';

const PROMOS = ['mmi1', 'mmi2', 'mmi3'];
const STALE_MS = 10 * 60 * 1000;

/**
 * Relie la fenêtre des salles libres à son modèle.
 * Les plannings des trois promos ne sont chargés qu'à l'ouverture.
 */
export default class RoomsController {
  #model;
  #view;
  #ics;
  #loading = false;

  /**
   * @param {import('../models/RoomsModel.js').default} model
   * @param {import('../views/RoomsView.js').default} view
   * @param {import('../services/IcsService.js').default} ics
   */
  constructor(model, view, ics) {
    this.#model = model;
    this.#view = view;
    this.#ics = ics;

    model.addEventListener('change', (event) => view.render(event.detail));
    view.bindOpen(() => this.open());
    view.bindNow(() => model.useNow());
    view.bindPick((date) => model.setAt(date));
    setInterval(() => {
      if (view.isOpen) model.tick();
    }, 60 * 1000);
  }

  /** Ouvre la fenêtre et charge les plannings si besoin. */
  async open() {
    this.#model.useNow();
    this.#view.open();
    if (Date.now() - this.#model.loadedAt > STALE_MS) await this.#load();
  }

  async #load() {
    if (this.#loading) return;
    this.#loading = true;
    this.#model.setState('loading');

    const results = await Promise.all(PROMOS.map(async (promo) => {
      try {
        return { ...(await this.#ics.fetchIcs(promo)), fresh: true };
      } catch {
        const cached = this.#ics.cached(promo);
        return cached ? { ...cached, fresh: false } : null;
      }
    }));

    this.#loading = false;
    const available = results.filter(Boolean);
    if (available.length === 0) {
      this.#model.setState('error', 'Impossible de charger les plannings des promos. Vérifie ta connexion.');
      return;
    }

    const events = available.flatMap((r) => parseIcs(r.text).events);
    this.#model.setEvents(events);
    if (available.length < PROMOS.length) {
      this.#model.setState('offline', 'une partie des plannings manque, le résultat peut être incomplet');
    } else if (available.some((r) => !r.fresh)) {
      this.#model.setState('offline', 'affichage de la dernière copie enregistrée');
    } else {
      this.#model.setState('ok');
    }
  }
}
