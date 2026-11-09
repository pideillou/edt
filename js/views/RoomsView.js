import { formatTime, parisParts, parisLocalToDate } from '../utils/dates.js';

/**
 * @param {string} tag
 * @param {Object<string,string>} attrs
 * @param {Array<Node|string|null>} children
 * @returns {HTMLElement}
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child !== null && child !== undefined && child !== '') node.append(child);
  }
  return node;
}

/**
 * Fenêtre « Salles libres ». Seule couche qui touche à ce dialogue.
 */
export default class RoomsView {
  #dialog;
  #date;
  #time;
  #now;
  #free;
  #busy;
  #freeTitle;
  #busyTitle;
  #status;

  /** @param {Document} root */
  constructor(root) {
    this.#dialog = root.querySelector('[data-rooms-dialog]');
    this.openButton = root.querySelector('[data-rooms-open]');
    this.#date = this.#dialog.querySelector('[data-rooms-date]');
    this.#time = this.#dialog.querySelector('[data-rooms-time]');
    this.#now = this.#dialog.querySelector('[data-rooms-now]');
    this.#free = this.#dialog.querySelector('[data-rooms-free]');
    this.#busy = this.#dialog.querySelector('[data-rooms-busy]');
    this.#freeTitle = this.#dialog.querySelector('[data-rooms-free-title]');
    this.#busyTitle = this.#dialog.querySelector('[data-rooms-busy-title]');
    this.#status = this.#dialog.querySelector('[data-rooms-status]');

    this.#dialog.querySelector('[data-rooms-close]').addEventListener('click', () => this.#dialog.close());
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
  }

  /** Ouvre la fenêtre. */
  open() {
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  /** @returns {boolean} */
  get isOpen() {
    return this.#dialog.open;
  }

  /**
   * @param {Object} s instantané fourni par RoomsModel
   */
  render(s) {
    const p = parisParts(s.at);
    const pad = (n) => String(n).padStart(2, '0');
    if (document.activeElement !== this.#date) this.#date.value = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    if (document.activeElement !== this.#time) this.#time.value = `${pad(p.hour)}:${pad(p.minute)}`;
    this.#now.setAttribute('aria-pressed', String(s.followNow));

    let status = '';
    if (s.state === 'loading') status = 'Chargement des plannings…';
    if (s.state === 'offline') status = `Hors ligne : ${s.message}.`;
    if (s.state === 'error') status = s.message;
    this.#status.textContent = status;
    this.#status.dataset.state = s.state;

    this.#freeTitle.textContent = s.hasData ? `Libres (${s.free.length})` : 'Libres';
    this.#busyTitle.textContent = s.hasData ? `Occupées (${s.busy.length})` : 'Occupées';

    this.#free.replaceChildren(...s.free.map((r) => el('li', { class: 'room room-free' }, [
      el('strong', {}, [r.room]),
      el('span', {}, [r.until ? `libre jusqu’à ${formatTime(r.until)}` : 'libre jusqu’à la fin de journée']),
    ])));

    this.#busy.replaceChildren(...s.busy.map((r) => {
      const e = r.event;
      const who = [e.groups.length ? e.groups.join(', ') : '', [e.code || e.title, e.type].filter(Boolean).join(' ')]
        .filter(Boolean).join(' · ');
      return el('li', { class: 'room room-busy' }, [
        el('span', {}, [el('strong', {}, [r.room]), ' ', el('span', { class: 'room-who' }, [who])]),
        el('span', { class: 'room-until' }, [`libre à ${formatTime(r.until)}`]),
      ]);
    }));

    if (s.hasData && s.free.length === 0) {
      this.#free.append(el('li', { class: 'room-empty' }, ['Aucune salle libre à ce moment-là.']));
    }
  }

  /** @param {() => void} handler */
  bindOpen(handler) {
    this.openButton.addEventListener('click', handler);
  }

  /** @param {() => void} handler */
  bindNow(handler) {
    this.#now.addEventListener('click', handler);
  }

  /** @param {(date: Date) => void} handler */
  bindPick(handler) {
    const emit = () => {
      const d = this.#date.value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const t = this.#time.value.match(/^(\d{2}):(\d{2})/);
      if (d && t) handler(parisLocalToDate(+d[1], +d[2], +d[3], +t[1], +t[2]));
    };
    this.#date.addEventListener('change', emit);
    this.#time.addEventListener('change', emit);
  }
}
