/**
 * Accès au localStorage, sans jamais planter si le stockage est
 * indisponible (navigation privée, quota plein).
 */
export default class StorageService {
  #prefix;

  /** @param {string} prefix */
  constructor(prefix = 'edt:') {
    this.#prefix = prefix;
  }

  /**
   * @param {string} key
   * @param {*} fallback
   * @returns {*}
   */
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.#prefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  /**
   * @param {string} key
   * @param {*} value
   * @returns {boolean} vrai si l'écriture a réussi
   */
  set(key, value) {
    try {
      localStorage.setItem(this.#prefix + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}
