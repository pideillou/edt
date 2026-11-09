import {
  formatDayLong,
  formatDayShort,
  formatDayMonth,
  formatTime,
  formatFull,
  formatDuration,
  formatRelative,
  minutesOfDay,
  weekdayIndex,
  dayKey,
} from '../utils/dates.js';
import { layoutOverlaps, hueFor } from '../utils/layout.js';

/**
 * Crée un élément avec attributs et enfants. Le texte passe toujours
 * par des nœuds texte, jamais par innerHTML.
 * @param {string} tag
 * @param {Object<string,string>} attrs
 * @param {Array<Node|string|null|false>} children
 * @returns {HTMLElement}
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) node.setAttribute(name, value);
  }
  for (const child of children) {
    if (child !== null && child !== false && child !== undefined && child !== '') node.append(child);
  }
  return node;
}

/** @param {Object} e @returns {string} */
function shortTitle(e) {
  return e.code || e.title || e.summary || 'Événement';
}

/**
 * Titre découpable : un <wbr> après chaque point ou tiret,
 * pour que « R4.DWeb-DI.06 » se coupe proprement dans une colonne étroite.
 * @param {string} text
 * @returns {Array<Node|string>}
 */
function breakable(text) {
  return text.split(/(?<=[.-])/).flatMap((part, i) => (i === 0 ? [part] : [document.createElement('wbr'), part]));
}

/** @param {Object} e @returns {string} */
function subjectKey(e) {
  return (e.code || e.title || e.summary).replace(/\s+/g, ' ');
}

/** @param {Object} e @returns {string} */
function typeLabel(e) {
  if (!e.type) return '';
  return e.type.replace(/^Eval-/i, 'Éval ');
}

/** @param {Object} e @returns {string} */
function accessibleLabel(e) {
  const parts = [
    e.isCancelled ? 'Annulé' : '',
    shortTitle(e),
    e.title && e.code ? e.title : '',
    typeLabel(e),
    `de ${formatTime(e.start)} à ${formatTime(e.end)}`,
    e.room ? `salle ${e.room}` : '',
    e.teacher,
  ];
  return parts.filter(Boolean).join(', ');
}

/**
 * Rendu de l'emploi du temps. Seule couche qui touche au DOM.
 */
export default class ScheduleView {
  #root;
  #calendar;
  #dialog;
  #lastScrollKey = '';

  /** @param {HTMLElement} root */
  constructor(root) {
    this.#root = root;
    this.#calendar = root.querySelector('[data-calendar]');
    this.#dialog = document.querySelector('[data-dialog]');
    this.groupSelect = root.querySelector('[data-group]');
    this.status = root.querySelector('[data-status]');
    this.nowCard = root.querySelector('[data-now]');
    this.period = root.querySelector('[data-period]');
    this.calName = root.querySelector('[data-calname]');
    this.refreshButton = root.querySelector('[data-refresh]');

    this.#dialog.querySelector('[data-dialog-close]').addEventListener('click', () => this.#dialog.close());
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
  }

  /**
   * Remplit la liste des groupes.
   * @param {Array<{id:string,label:string}>} groups
   * @param {string} selected
   */
  renderGroups(groups, selected) {
    const options = groups.map((g) => el('option', { value: g.id }, [g.label]));
    this.groupSelect.replaceChildren(this.groupSelect.options[0], ...options);
    this.groupSelect.value = selected;
  }

  /**
   * Affiche l'état complet.
   * @param {Object} s instantané fourni par le modèle
   */
  render(s) {
    this.groupSelect.value = s.group;
    this.calName.textContent = s.calendarName.replace(/^Agenda\s+(?:MMI\s+(?=BUT))?/i, '');
    this.#renderStatus(s);
    this.#renderPeriod(s);
    this.#renderSwitch(s.view);
    this.#renderNow(s);
    this.#renderCalendar(s);
  }

  #renderStatus(s) {
    const { state, fetchedAt, publishedAt, message } = s.status;
    this.refreshButton.classList.toggle('is-spinning', state === 'loading');
    this.refreshButton.disabled = state === 'loading' || !s.group;
    const parts = [];
    if (state === 'loading') parts.push('Mise à jour…');
    if (state === 'offline') parts.push(`Hors ligne : ${message}.`);
    if (state === 'error') parts.push(message);
    if (fetchedAt && state !== 'loading') parts.push(`Synchronisé ${formatRelative(new Date(fetchedAt), s.now)}.`);
    if (publishedAt) parts.push(`Planning modifié ${formatRelative(publishedAt, s.now)}.`);
    this.status.textContent = parts.join(' ');
    this.status.dataset.state = state;
  }

  #renderPeriod(s) {
    if (s.view === 'day') {
      this.period.textContent = formatDayLong(s.cursor);
      return;
    }
    const first = s.days[0].key;
    const last = s.days[s.days.length - 1].key;
    this.period.textContent = `${formatDayMonth(first)} au ${formatDayMonth(last)}`;
  }

  #renderSwitch(view) {
    for (const button of this.#root.querySelectorAll('[data-view]')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === view));
    }
  }

  #renderNow(s) {
    const items = [];
    if (s.current) items.push(this.#nowItem('En cours', s.current, `jusqu’à ${formatTime(s.current.end)}`));
    if (s.next) {
      const when = s.next.startKey === dayKey(s.now)
        ? `${formatTime(s.next.start)}, ${formatRelative(s.next.start, s.now)}`
        : formatFull(s.next.start);
      items.push(this.#nowItem(s.current ? 'Ensuite' : 'Prochain cours', s.next, when));
    }
    this.nowCard.hidden = items.length === 0;
    this.nowCard.replaceChildren(...items);
  }

  #nowItem(label, e, when) {
    const button = el('button', { type: 'button', class: 'now-item', 'data-uid': e.uid }, [
      el('span', { class: 'now-label' }, [label]),
      el('span', { class: 'now-title' }, [shortTitle(e), e.type ? ` ${typeLabel(e)}` : '']),
      el('span', { class: 'now-meta' }, [[when, e.room ? `salle ${e.room}` : ''].filter(Boolean).join(' · ')]),
    ]);
    button.style.setProperty('--h', String(hueFor(subjectKey(e))));
    return button;
  }

  #renderCalendar(s) {
    if (!s.group) {
      this.#calendar.replaceChildren(
        el('p', { class: 'empty' }, ['Choisis ton groupe en haut de l’écran pour afficher ton emploi du temps.']),
      );
      return;
    }
    if (s.hasData && s.view === 'day' && s.days[0].timed.length === 0 && s.days[0].allDay.length === 0) {
      this.#calendar.replaceChildren(el('p', { class: 'empty' }, ['Pas de cours ce jour-là.']));
      return;
    }
    if (!s.hasData) {
      const text = s.status.state === 'loading' ? 'Chargement du planning…' : 'Aucune donnée pour ce groupe.';
      this.#calendar.replaceChildren(el('p', { class: 'empty' }, [text]));
      return;
    }

    const { start, end } = s.range;
    const total = end - start;
    const grid = el('div', { class: `grid grid-${s.view}` });
    grid.style.setProperty('--days', String(s.days.length));
    grid.style.setProperty('--hours', String(total / 60));

    // En-têtes des jours
    grid.append(el('div', { class: 'corner', 'aria-hidden': 'true' }));
    for (const day of s.days) {
      const head = el('div', { class: `day-head${day.isToday ? ' is-today' : ''}` }, [
        s.view === 'week' ? formatDayShort(day.key) : formatDayLong(day.key),
      ]);
      grid.append(head);
    }

    // Journées entières (BIP, stages…)
    if (s.days.some((d) => d.allDay.length)) {
      grid.append(el('div', { class: 'allday-label' }, ['Jour']));
      for (const day of s.days) {
        const cell = el('div', { class: 'allday' });
        for (const e of day.allDay) cell.append(this.#allDayChip(e));
        grid.append(cell);
      }
    }

    // Graduation horaire
    const gutter = el('div', { class: 'gutter', 'aria-hidden': 'true' });
    for (let m = start; m < end; m += 60) {
      gutter.append(el('span', { class: 'hour' }, [`${String(m / 60).padStart(2, '0')}h`]));
    }
    grid.append(gutter);

    for (const day of s.days) {
      const column = el('section', {
        class: `day${day.isToday ? ' is-today' : ''}${weekdayIndex(day.key) >= 5 ? ' is-weekend' : ''}`,
        'aria-label': formatDayLong(day.key),
      });
      const list = el('ol', { class: 'events' });
      for (const { event, column: col, columns } of layoutOverlaps(day.timed)) {
        list.append(this.#eventItem(event, col, columns, start, total));
      }
      column.append(list);
      if (day.timed.length === 0 && day.allDay.length === 0) {
        column.append(el('p', { class: 'day-empty' }, ['Pas de cours']));
      }
      if (day.isToday && s.nowMinutes >= start && s.nowMinutes <= end) {
        const line = el('div', { class: 'now-line', 'aria-hidden': 'true' });
        line.style.setProperty('--top', String(((s.nowMinutes - start) / total) * 100));
        column.append(line);
      }
      grid.append(column);
    }

    this.#calendar.replaceChildren(grid);

    // Sur mobile, on amène le cours en cours ou l'heure actuelle à l'écran une seule fois par période.
    const scrollKey = `${s.view}:${s.cursor}`;
    if (scrollKey !== this.#lastScrollKey) {
      this.#lastScrollKey = scrollKey;
      const target = grid.querySelector('.now-line') ?? grid.querySelector('.event');
      if (target && window.innerHeight < grid.offsetHeight + grid.getBoundingClientRect().top) {
        requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'auto' }));
      }
    }
  }

  #eventItem(e, column, columns, start, total) {
    const top = ((minutesOfDay(e.start) - start) / total) * 100;
    const height = ((minutesOfDay(e.end) - minutesOfDay(e.start)) / total) * 100;
    const classes = ['event'];
    if (e.isCancelled) classes.push('is-cancelled');
    if (e.isEval) classes.push('is-eval');
    if ((e.end - e.start) / 60000 <= 60) classes.push('is-short');

    const button = el('button', { type: 'button', class: classes.join(' '), 'data-uid': e.uid, 'aria-label': accessibleLabel(e) }, [
      el('span', { class: 'event-time', 'aria-hidden': 'true' }, [`${formatTime(e.start)}–${formatTime(e.end)}`]),
      el('span', { class: 'event-title', 'aria-hidden': 'true' }, [
        ...breakable(shortTitle(e)),
        e.type ? el('span', { class: 'event-type' }, [typeLabel(e)]) : null,
        e.isEval ? el('span', { class: 'badge' }, ['Éval']) : null,
      ]),
      e.room ? el('span', { class: 'event-room', 'aria-hidden': 'true' }, [e.room]) : null,
      e.teacher ? el('span', { class: 'event-teacher', 'aria-hidden': 'true' }, [e.teacher]) : null,
      e.title && e.code ? el('span', { class: 'event-teacher', 'aria-hidden': 'true' }, [e.title]) : null,
    ]);
    button.style.setProperty('--h', String(hueFor(subjectKey(e))));
    button.style.setProperty('--top', String(top));
    button.style.setProperty('--height', String(height));
    button.style.setProperty('--col', String(column));
    button.style.setProperty('--cols', String(columns));
    return el('li', {}, [button]);
  }

  #allDayChip(e) {
    const chip = el('button', { type: 'button', class: 'chip', 'data-uid': e.uid }, [shortTitle(e)]);
    chip.style.setProperty('--h', String(hueFor(subjectKey(e))));
    return chip;
  }

  /**
   * Ouvre la fiche détaillée d'un cours.
   * @param {Object} e
   */
  showEvent(e) {
    const title = [shortTitle(e), typeLabel(e)].filter(Boolean).join(' · ');
    this.#dialog.querySelector('[data-dialog-title]').textContent = e.isCancelled ? `Annulé : ${title}` : title;
    const sub = e.allDay
      ? formatDayLong(e.startKey)
      : `${formatDayLong(e.startKey)}, de ${formatTime(e.start)} à ${formatTime(e.end)}`;
    this.#dialog.querySelector('[data-dialog-sub]').textContent = sub;

    const rows = [
      ['Intitulé', e.label || (e.code ? e.title : '')],
      ['Durée', e.allDay ? '' : formatDuration((e.end - e.start) / 60000)],
      ['Salle', e.room],
      ['Enseignant', e.teacher],
      ['Groupes', e.groups.join(', ')],
      ['Évaluation', e.isEval ? 'Oui' : ''],
    ].filter(([, value]) => value);
    if (rows.length === 0) rows.push(['Détail', e.summary]);

    const list = this.#dialog.querySelector('[data-dialog-list]');
    list.replaceChildren(...rows.map(([term, value]) => el('div', {}, [el('dt', {}, [term]), el('dd', {}, [value])])));
    this.#dialog.style.setProperty('--h', String(hueFor(subjectKey(e))));
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  /** @param {(group: string) => void} handler */
  bindGroupChange(handler) {
    this.groupSelect.addEventListener('change', () => handler(this.groupSelect.value));
  }

  /** @param {() => void} handler */
  bindRefresh(handler) {
    this.refreshButton.addEventListener('click', handler);
  }

  /** @param {(direction: number) => void} handler */
  bindNavigate(handler) {
    this.#root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-nav]');
      if (button) handler(Number(button.dataset.nav));
    });
    document.addEventListener('keydown', (event) => {
      if (this.#dialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.target.closest('input, select, textarea')) return;
      if (event.key === 'ArrowLeft') handler(-1);
      if (event.key === 'ArrowRight') handler(1);
    });

    // Glisser horizontalement sur le calendrier pour changer de période.
    let startX = 0;
    let startY = 0;
    this.#calendar.addEventListener('touchstart', (event) => {
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, { passive: true });
    this.#calendar.addEventListener('touchend', (event) => {
      const dx = event.changedTouches[0].clientX - startX;
      const dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) handler(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  /** @param {() => void} handler */
  bindToday(handler) {
    this.#root.querySelector('[data-today]').addEventListener('click', handler);
    document.addEventListener('keydown', (event) => {
      if (this.#dialog.open || event.target.closest('input, select, textarea')) return;
      if (event.key === 't' || event.key === 'T') handler();
    });
  }

  /** @param {(view: 'day'|'week') => void} handler */
  bindView(handler) {
    this.#root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-view]');
      if (button) handler(button.dataset.view);
    });
  }

  /** @param {(uid: string) => void} handler */
  bindOpenEvent(handler) {
    this.#root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-uid]');
      if (button) handler(button.dataset.uid);
    });
  }
}
