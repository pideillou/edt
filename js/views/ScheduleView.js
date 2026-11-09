import {
  formatDayLong,
  formatDayShort,
  formatDayMonth,
  formatMonth,
  formatTime,
  formatFull,
  formatDuration,
  formatRelative,
  minutesOfDay,
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

/** @param {Object} e @returns {number} minutes */
function durationOf(e) {
  return (e.end - e.start) / 60000;
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

/** Pose la teinte de la matière sur un élément. */
function tint(node, e) {
  node.style.setProperty('--h', String(hueFor(subjectKey(e))));
  return node;
}

/** @param {Date} date @returns {string} « 8h30 », « 14h » */
function shortTime(date) {
  const [h, m] = formatTime(date).split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

const cancelledBadge = () => el('span', { class: 'badge badge-cancelled' }, ['Annulé']);
const evalBadge = () => el('span', { class: 'badge' }, ['Éval']);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Rendu de l'emploi du temps. Seule couche qui touche au DOM.
 */
export default class ScheduleView {
  #root;
  #calendar;
  #strip;
  #dialog;
  #lastScrollKey = '';

  /** @param {HTMLElement} root */
  constructor(root) {
    this.#root = root;
    this.#calendar = root.querySelector('[data-calendar]');
    this.#strip = root.querySelector('[data-strip]');
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
   * Remplit le menu des groupes, rangés par année.
   * @param {Array<{id:string,label:string,year:string}>} groups
   * @param {string} selected
   */
  renderGroups(groups, selected) {
    const years = [...new Set(groups.map((g) => g.year))];
    const optgroups = years.map((year) => el('optgroup', { label: year }, groups
      .filter((g) => g.year === year)
      .map((g) => el('option', { value: g.id }, [g.label]))));
    this.groupSelect.replaceChildren(this.groupSelect.options[0], ...optgroups);
    this.groupSelect.value = selected;
  }

  /**
   * Applique un thème et met à jour le sélecteur.
   * @param {'auto'|'light'|'dark'} theme
   */
  renderTheme(theme) {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    for (const button of this.#root.querySelectorAll('[data-theme-choice]')) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    }
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f172a' : '#eef2f7');
  }

  /**
   * Affiche l'état complet.
   * @param {Object} s instantané fourni par le modèle
   */
  render(s) {
    this.groupSelect.value = s.group;
    this.calName.textContent = s.calendarName.replace(/^Agenda\s+(?:MMI\s+(?=BUT))?/i, '');
    this.#calendar.dataset.mode = s.view;
    this.#renderStatus(s);
    this.#renderPeriod(s);
    this.#renderSwitch(s.view);
    this.#renderNow(s);
    this.#renderStrip(s);

    if (!s.group) {
      this.#empty('Choisis ton groupe en haut de l’écran pour afficher ton emploi du temps.');
    } else if (!s.hasData) {
      this.#empty(s.status.state === 'loading' ? 'Chargement du planning…' : 'Aucune donnée pour ce groupe.');
    } else if (s.view === 'month') {
      this.#renderMonth(s);
    } else if (s.view === 'day') {
      this.#renderDay(s);
    } else {
      this.#calendar.replaceChildren(this.#grid(s));
      this.#scrollToNow(s);
    }
  }

  #empty(text) {
    this.#calendar.replaceChildren(el('p', { class: 'empty' }, [text]));
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
    if (s.view === 'month') {
      this.period.textContent = formatMonth(s.month);
    } else if (s.view === 'day') {
      this.period.textContent = formatDayLong(s.cursor);
    } else {
      const first = s.days[0].key;
      const last = s.days[s.days.length - 1].key;
      this.period.textContent = `${formatDayMonth(first)} au ${formatDayMonth(last)}`;
    }
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
    return tint(el('button', { type: 'button', class: 'now-item', 'data-uid': e.uid }, [
      el('span', { class: 'now-label' }, [label]),
      el('span', { class: 'now-title' }, [shortTitle(e), e.type ? ` ${typeLabel(e)}` : '']),
      el('span', { class: 'now-meta' }, [[when, e.room ? `salle ${e.room}` : ''].filter(Boolean).join(' · ')]),
    ]), e);
  }

  /** Bande des jours de la semaine, affichée en vue jour. */
  #renderStrip(s) {
    const show = s.view === 'day' && Boolean(s.group) && s.hasData;
    this.#strip.hidden = !show;
    if (!show) return;
    this.#strip.replaceChildren(...s.strip.map((d) => {
      const info = d.count ? `${d.count} cours` : 'libre';
      return el('li', {}, [
        el('button', {
          type: 'button',
          class: `strip-day${d.isToday ? ' is-today' : ''}`,
          'data-day': d.key,
          'aria-current': d.isSelected ? 'date' : null,
          'aria-label': `${formatDayLong(d.key)}, ${info}${d.cancelled ? `, ${plural(d.cancelled, 'annulé')}` : ''}`,
        }, [
          el('span', { class: 'strip-name', 'aria-hidden': 'true' }, [formatDayShort(d.key).split(' ')[0]]),
          el('span', { class: 'strip-num', 'aria-hidden': 'true' }, [formatDayShort(d.key).split(' ')[1]]),
          el('span', { class: 'strip-info', 'aria-hidden': 'true' }, [
            info,
            d.cancelled ? el('span', { class: 'strip-cancelled' }, [` · ${plural(d.cancelled, 'annulé')}`]) : null,
          ]),
        ]),
      ]);
    }));
  }

  /** Vue jour : frise horaire, et sur grand écran la liste détaillée à côté. */
  #renderDay(s) {
    const day = s.days[0];
    if (day.timed.length === 0 && day.allDay.length === 0) {
      this.#empty('Pas de cours ce jour-là.');
      return;
    }
    const list = el('ol', { class: 'day-list', 'aria-label': `Cours du ${formatDayLong(day.key)}` });
    for (const e of [...day.allDay, ...day.timed]) list.append(el('li', {}, [this.#dayCard(e, s.now)]));
    this.#calendar.replaceChildren(el('div', { class: 'dayview' }, [this.#grid(s), list]));
    this.#scrollToNow(s);
  }

  #dayCard(e, now) {
    const isCurrent = !e.allDay && !e.isCancelled && e.start <= now && e.end > now;
    const classes = ['day-card'];
    if (e.isCancelled) classes.push('is-cancelled');
    if (isCurrent) classes.push('is-current');
    const meta = [
      e.room ? `Salle ${e.room}` : '',
      e.teacher,
      e.allDay ? 'Journée entière' : formatDuration(durationOf(e)),
    ].filter(Boolean).join(' · ');

    return tint(el('button', { type: 'button', class: classes.join(' '), 'data-uid': e.uid }, [
      el('span', { class: 'day-card-time' }, e.allDay
        ? ['Jour']
        : [el('strong', {}, [formatTime(e.start)]), el('span', {}, [formatTime(e.end)])]),
      el('span', { class: 'day-card-body' }, [
        el('span', { class: 'day-card-title' }, [
          el('span', { class: 'day-card-code' }, [[shortTitle(e), typeLabel(e)].filter(Boolean).join(' · ')]),
          e.isCancelled ? cancelledBadge() : null,
          e.isEval ? evalBadge() : null,
          isCurrent ? el('span', { class: 'badge badge-current' }, ['En cours']) : null,
        ]),
        e.label || (e.title && e.code) ? el('span', { class: 'day-card-label' }, [e.label || e.title]) : null,
        el('span', { class: 'day-card-meta' }, [meta]),
        e.groups.length ? el('span', { class: 'day-card-meta' }, [e.groups.join(', ')]) : null,
      ]),
    ]), e);
  }

  /** Grille horaire, une colonne par jour (vue jour et vue semaine). */
  #grid(s) {
    const { start, end } = s.range;
    const total = end - start;
    const grid = el('div', { class: `grid grid-${s.view}` });
    grid.style.setProperty('--days', String(s.days.length));
    grid.style.setProperty('--hours', String(total / 60));

    grid.append(el('div', { class: 'corner', 'aria-hidden': 'true' }));
    for (const day of s.days) {
      grid.append(el('div', { class: `day-head${day.isToday ? ' is-today' : ''}` }, [
        s.view === 'week' ? formatDayShort(day.key) : formatDayLong(day.key),
      ]));
    }

    if (s.days.some((d) => d.allDay.length)) {
      grid.append(el('div', { class: 'allday-label' }, ['Jour']));
      for (const day of s.days) {
        const cell = el('div', { class: 'allday' });
        for (const e of day.allDay) {
          cell.append(tint(el('button', { type: 'button', class: 'chip', 'data-uid': e.uid }, [shortTitle(e)]), e));
        }
        grid.append(cell);
      }
    }

    const gutter = el('div', { class: 'gutter', 'aria-hidden': 'true' });
    for (let m = start; m < end; m += 60) {
      gutter.append(el('span', { class: 'hour' }, [`${String(m / 60).padStart(2, '0')}h`]));
    }
    grid.append(gutter);

    for (const day of s.days) {
      const column = el('section', {
        class: `day${day.isToday ? ' is-today' : ''}${day.isWeekend ? ' is-weekend' : ''}`,
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
    return grid;
  }

  #eventItem(e, column, columns, start, total) {
    const top = ((minutesOfDay(e.start) - start) / total) * 100;
    const height = ((minutesOfDay(e.end) - minutesOfDay(e.start)) / total) * 100;
    const classes = ['event'];
    if (e.isCancelled) classes.push('is-cancelled');
    if (e.isEval) classes.push('is-eval');
    if (durationOf(e) <= 60) classes.push('is-short');

    const button = tint(el('button', { type: 'button', class: classes.join(' '), 'data-uid': e.uid, 'aria-label': accessibleLabel(e) }, [
      el('span', { class: 'event-time', 'aria-hidden': 'true' }, [`${formatTime(e.start)}–${formatTime(e.end)}`]),
      el('span', { class: 'event-title', 'aria-hidden': 'true' }, [
        el('span', { class: 'event-code' }, breakable(shortTitle(e))),
        e.type ? el('span', { class: 'event-type' }, [typeLabel(e)]) : null,
        e.isCancelled ? cancelledBadge() : null,
        e.isEval ? evalBadge() : null,
      ]),
      e.room ? el('span', { class: 'event-room', 'aria-hidden': 'true' }, [e.room]) : null,
      e.teacher ? el('span', { class: 'event-teacher', 'aria-hidden': 'true' }, [e.teacher]) : null,
      e.title && e.code ? el('span', { class: 'event-teacher', 'aria-hidden': 'true' }, [e.title]) : null,
    ]), e);
    button.style.setProperty('--top', String(top));
    button.style.setProperty('--height', String(height));
    button.style.setProperty('--col', String(column));
    button.style.setProperty('--cols', String(columns));
    return el('li', {}, [button]);
  }

  /** Vue mois : une case par jour, trois cours maximum puis « +N autres ». */
  #renderMonth(s) {
    const names = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'];
    const head = el('div', { class: 'month-head', 'aria-hidden': 'true' }, names.map((n) => el('span', {}, [n])));
    const weeks = s.weeks.map((week) => el('div', { class: 'month-week' }, week.map((d) => this.#monthCell(d))));
    this.#calendar.replaceChildren(el('div', { class: 'month' }, [head, ...weeks]));
  }

  #monthCell(d) {
    const events = [...d.allDay, ...d.timed];
    const shown = events.slice(0, 3);
    const more = events.length - shown.length;
    const classes = ['month-day'];
    if (!d.inMonth) classes.push('is-outside');
    if (d.isWeekend) classes.push('is-weekend');
    if (d.isToday) classes.push('is-today');

    const label = [
      formatDayLong(d.key),
      d.count ? `${d.count} cours` : 'pas de cours',
      d.cancelled ? plural(d.cancelled, 'annulé') : '',
    ].filter(Boolean).join(', ');

    return el('button', { type: 'button', class: classes.join(' '), 'data-day': d.key, 'data-open': 'day', 'aria-label': label }, [
      el('span', { class: 'month-num', 'aria-hidden': 'true' }, [d.key.slice(8).replace(/^0/, '')]),
      el('span', { class: 'month-events', 'aria-hidden': 'true' }, shown.map((e) => tint(el('span', {
        class: `month-chip${e.isCancelled ? ' is-cancelled' : ''}`,
      }, [
        e.allDay ? '' : `${shortTime(e.start)} `,
        shortTitle(e),
      ]), e))),
      more > 0 ? el('span', { class: 'month-more', 'aria-hidden': 'true' }, [`+${more} autre${more > 1 ? 's' : ''}`]) : null,
      el('span', { class: 'month-dots', 'aria-hidden': 'true' }, events.map((e) => tint(el('span', {
        class: `dot${e.isCancelled ? ' is-cancelled' : ''}`,
      }), e))),
    ]);
  }

  /** Amène l'heure actuelle (ou le premier cours) à l'écran, une fois par période. */
  #scrollToNow(s) {
    const scrollKey = `${s.view}:${s.cursor}`;
    if (scrollKey === this.#lastScrollKey) return;
    this.#lastScrollKey = scrollKey;
    const grid = this.#calendar.querySelector('.grid');
    if (!grid) return;
    const target = grid.querySelector('.now-line') ?? grid.querySelector('.event');
    if (target && window.innerHeight < grid.offsetHeight + grid.getBoundingClientRect().top) {
      requestAnimationFrame(() => target.scrollIntoView({ block: 'center', behavior: 'auto' }));
    }
  }

  /**
   * Ouvre la fiche détaillée d'un cours.
   * @param {Object} e
   */
  showEvent(e) {
    const title = [shortTitle(e), typeLabel(e)].filter(Boolean).join(' · ');
    const heading = this.#dialog.querySelector('[data-dialog-title]');
    heading.replaceChildren(title, e.isCancelled ? cancelledBadge() : '');
    const sub = e.allDay
      ? formatDayLong(e.startKey)
      : `${formatDayLong(e.startKey)}, de ${formatTime(e.start)} à ${formatTime(e.end)}`;
    this.#dialog.querySelector('[data-dialog-sub]').textContent = sub;

    const rows = [
      ['Intitulé', e.label || (e.code ? e.title : '')],
      ['Durée', e.allDay ? '' : formatDuration(durationOf(e))],
      ['Salle', e.room],
      ['Enseignant', e.teacher],
      ['Groupes', e.groups.join(', ')],
      ['Évaluation', e.isEval ? 'Oui' : ''],
    ].filter(([, value]) => value);
    if (rows.length === 0) rows.push(['Détail', e.summary]);

    const list = this.#dialog.querySelector('[data-dialog-list]');
    list.replaceChildren(...rows.map(([term, value]) => el('div', {}, [el('dt', {}, [term]), el('dd', {}, [value])])));
    this.#dialog.classList.toggle('is-cancelled', e.isCancelled);
    tint(this.#dialog, e);
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  /** @param {(group: string) => void} handler */
  bindGroupChange(handler) {
    this.groupSelect.addEventListener('change', () => handler(this.groupSelect.value));
  }

  /** @param {(theme: string) => void} handler */
  bindTheme(handler) {
    this.#root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-theme-choice]');
      if (button) handler(button.dataset.themeChoice);
    });
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

  /** @param {(key: string, openDay: boolean) => void} handler */
  bindShowDay(handler) {
    this.#root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-day]');
      if (button) handler(button.dataset.day, button.dataset.open === 'day');
    });
  }

  /** @param {() => void} handler */
  bindToday(handler) {
    this.#root.querySelector('[data-today]').addEventListener('click', handler);
    document.addEventListener('keydown', (event) => {
      if (this.#dialog.open || event.target.closest('input, select, textarea')) return;
      if (event.key === 't' || event.key === 'T') handler();
    });
  }

  /** @param {(view: string) => void} handler */
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
