import { roomStatus } from '../utils/rooms.js';

/**
 * Occupation des salles, calculée sur les plannings des trois promos.
 * Émet « change » à chaque modification.
 */
export default class RoomsModel extends EventTarget {
  #events = [];
  #at = new Date();
  #followNow = true;
  #state = 'idle';
  #message = '';
  #loadedAt = 0;

  /**
   * @param {Array<Object>} events cours de MMI1, MMI2 et MMI3
   */
  setEvents(events) {
    this.#events = events;
    this.#loadedAt = Date.now();
    this.#emit();
  }

  /** @returns {number} horodatage du dernier chargement, 0 si jamais chargé */
  get loadedAt() {
    return this.#loadedAt;
  }

  /**
   * Choisit l'instant à examiner.
   * @param {Date} date
   */
  setAt(date) {
    if (Number.isNaN(date.getTime())) return;
    this.#at = date;
    this.#followNow = false;
    this.#emit();
  }

  /** Revient à l'instant présent, mis à jour à chaque minute. */
  useNow() {
    this.#at = new Date();
    this.#followNow = true;
    this.#emit();
  }

  /** Avance l'horloge si on suit l'instant présent. */
  tick() {
    if (!this.#followNow) return;
    this.#at = new Date();
    this.#emit();
  }

  /**
   * @param {'idle'|'loading'|'ok'|'offline'|'error'} state
   * @param {string} message
   */
  setState(state, message = '') {
    this.#state = state;
    this.#message = message;
    this.#emit();
  }

  /** Données prêtes à afficher par la vue. */
  get snapshot() {
    const status = this.#events.length ? roomStatus(this.#events, this.#at) : { free: [], busy: [] };
    return {
      at: this.#at,
      followNow: this.#followNow,
      state: this.#state,
      message: this.#message,
      hasData: this.#events.length > 0,
      ...status,
    };
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change', { detail: this.snapshot }));
  }
}
