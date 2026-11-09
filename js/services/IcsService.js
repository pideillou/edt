/**
 * Récupère les plannings publiés sur le dépôt GitHub frederic-mora/edt-ics.
 * raw.githubusercontent.com renvoie « Access-Control-Allow-Origin: * »,
 * donc le navigateur peut lire le fichier directement, sans proxy.
 */
const OWNER = 'frederic-mora';
const REPO = 'edt-ics';
const BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/ics/`;
const API_COMMITS = `https://api.github.com/repos/${OWNER}/${REPO}/commits`;

export default class IcsService {
  #storage;

  /** @param {import('./StorageService.js').default} storage */
  constructor(storage) {
    this.#storage = storage;
  }

  /**
   * Télécharge le .ics d'un groupe et le garde en cache local.
   * @param {string} group nom du fichier sans extension, ex. « but2-g1 »
   * @returns {Promise<{text: string, fetchedAt: number}>}
   */
  async fetchIcs(group) {
    const response = await fetch(`${RAW_BASE}${encodeURIComponent(group)}.ics`, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Le serveur a répondu ${response.status}`);
    const text = await response.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Le fichier reçu n’est pas un calendrier');
    const entry = { text, fetchedAt: Date.now() };
    this.#storage.set(`ics:${group}`, entry);
    return entry;
  }

  /**
   * Dernière copie enregistrée sur l'appareil.
   * @param {string} group
   * @returns {{text: string, fetchedAt: number} | null}
   */
  cached(group) {
    return this.#storage.get(`ics:${group}`);
  }

  /**
   * Date du dernier commit qui a modifié le fichier du groupe.
   * L'API GitHub sans compte est limitée à 60 appels par heure :
   * une erreur ici n'est pas bloquante.
   * @param {string} group
   * @returns {Promise<Date|null>}
   */
  async fetchPublishedAt(group) {
    try {
      const url = `${API_COMMITS}?path=ics/${encodeURIComponent(group)}.ics&per_page=1`;
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) return null;
      const [commit] = await response.json();
      const date = commit?.commit?.committer?.date;
      return date ? new Date(date) : null;
    } catch {
      return null;
    }
  }
}
