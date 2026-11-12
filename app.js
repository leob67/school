'use strict';
const $ = id => document.getElementById(id);
const LOGIN_ERRORS = {
  acces: "Erreur : Ce compte Discord n'a pas accès au dashboard",
  connexion: 'Erreur : La connexion a échoué, réessaye',
};
const TAB_IDS = ['activity', 'sanctions', 'gestion', 'team', 'anticheat', 'economy', 'perms', 'shop', 'codes', 'afk', 'texts', 'settings'];
// What each tab is looking at. The tabs where you edit open on the test version, the anticheat on the public game.
const tabEnv = { sanctions: 'live', gestion: 'live', anticheat: 'live', economy: 'live', shop: 'test', codes: 'test', afk: 'test' };

let me = null;
// What this person may do on the site (Permissions tab). The server checks it again on every request
const can = key => Boolean(me?.can?.[key]);
// Tabs with a test and a public version: who gets the switch
function canSeeBothEnvs(name) {
  if (name === 'sanctions') return can('sanctions.test');
  if (name === 'gestion') return can('gestion.test');
  if (name === 'anticheat') return can('anticheat.view');
  if (name === 'economy') return can('economy.view');
  return can(`${name}.view`); // shop, codes, afk: the test version is the one being edited
}

function show(id) {
  for (const name of ['loading', 'login', 'pin', 'home']) $(name).hidden = name !== id;
}

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Une erreur est survenue, recharge la page');
  return res.json();
}

async function post(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const answer = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(answer.error || 'Une erreur est survenue, réessaye');
  return answer;
}

// ---------------------------------------------------------------- formats
const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const toUnix = date => Math.floor(date.getTime() / 1000);
function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${hours} h`;
}
const formatDay = date => date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const formatShortDate = date => date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }); // 02/11/26
const formatTime = unix => new Date(unix * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const formatDateTime = unix => new Date(unix * 1000).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const formatNumber = value => Number(value).toLocaleString('fr-FR');
const count = (list, from, to) => list.filter(at => at >= from && at < to).length;

// ---------------------------------------------------------------- notifications, same as in game
const toasts = el('div', 'toasts');
toasts.setAttribute('role', 'status');
document.body.append(toasts);
// kind: 'error' (red, default of the game), 'ok' (green) or 'warn' (orange)
function notify(text, kind = 'ok') {
  const message = kind === 'error' ? `Erreur : ${text}` : text;
  const toast = el('div', `toast ${kind}`, message);
  toasts.prepend(toast);
  requestAnimationFrame(() => toast.classList.add('shown'));
  while (toasts.children.length > 4) toasts.lastElementChild.remove();
  // The game's timing: longer text stays longer
  setTimeout(() => {
    toast.classList.remove('shown');
    setTimeout(() => toast.remove(), 500);
  }, Math.max(3000, message.length * 75 + 1000));
}

// ---------------------------------------------------------------- tooltip
const tooltip = el('div', 'tooltip');
tooltip.hidden = true;
document.body.append(tooltip);
function addTip(element, text) {
  element.setAttribute('aria-label', text);
  element.addEventListener('mousemove', event => {
    tooltip.textContent = text;
    tooltip.hidden = false;
    const x = Math.min(window.innerWidth - tooltip.offsetWidth - 8, event.clientX + 12);
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  });
  element.addEventListener('mouseleave', () => { tooltip.hidden = true; });
}

// ---------------------------------------------------------------- activity view
const SERVER_TYPE_NAMES = { free: 'Free Access', custom: 'Serveur custom', roleplay: 'Roleplay', whitelist: 'Whitelist', private: 'Serveur privé', studio: 'Studio', other: 'Autre' };
// The colour of a session block: custom servers yellow, free access blue, the rest green
function serverClass(session) {
  return session.serverType === 'custom' ? 'custom' : session.serverType === 'free' ? 'free' : '';
}
// "Serveur custom · Le lycée de Léa", or nothing for old sessions that never said where they were
function serverLabel(session) {
  if (!session.serverType) return '';
  const type = SERVER_TYPE_NAMES[session.serverType] || session.serverType;
  return session.serverName ? ` · ${type} · ${session.serverName}` : ` · ${type}`;
}

// One day as a bar: yellow on a custom server, blue on free access, green elsewhere, dark while offline
function dayTrack(date, sessions) {
  const from = toUnix(date);
  const to = toUnix(addDays(date, 1));
  const track = el('div', 'track');
  let total = 0;
  for (const session of sessions) {
    if (session.end <= from || session.start >= to) continue;
    const start = Math.max(session.start, from);
    const end = Math.min(session.end, to);
    total += end - start;
    const block = el('div', `block ${serverClass(session)}`);
    block.style.left = `${((start - from) / (to - from)) * 100}%`;
    block.style.width = `${Math.max(0.35, ((end - start) / (to - from)) * 100)}%`;
    addTip(block, `${formatTime(session.start)} → ${formatTime(session.end)} (${formatDuration(session.end - session.start)})${serverLabel(session)}`);
    track.append(block);
  }
  return { track, total };
}

function hourScale() {
  const scale = el('div', 'hours');
  for (const hour of [0, 6, 12, 18, 24]) {
    const tick = el('span', '', `${hour} h`);
    tick.style.left = `${(hour / 24) * 100}%`;
    scale.append(tick);
  }
  return scale;
}

function tile(label, value, detail) {
  const box = el('div', 'tile');
  box.append(el('span', 'muted tile-label', label), el('strong', 'tile-value', value));
  if (detail) box.append(el('span', 'muted tile-detail', detail));
  return box;
}

// Each open activity keeps its own period: my week and a moderator's month can be open together
function makeActivityView(root, data) {
  const state = { view: 'week', anchor: startOfDay(new Date()), show: { free: true, custom: true } };
  // The sessions of the server types that are ticked (the rest always counts)
  const shownSessions = () => data.sessions.filter(session => !(session.serverType in state.show) || state.show[session.serverType]);

  function periodBounds() {
    const anchor = state.anchor;
    if (state.view === 'all') {
      // Starts at the oldest thing we know about: old Discord tickets can be older than the first session
      const firsts = [data.firstSession, data.ingameTickets.dated[0], data.discordTickets.dated[0]].filter(Boolean);
      const today = startOfDay(new Date());
      const first = firsts.length ? startOfDay(new Date(Math.min(...firsts) * 1000)) : today;
      return { from: first, to: addDays(today, 1), title: `${formatShortDate(first)} - ${formatShortDate(today)}` };
    }
    if (state.view === 'day') return { from: anchor, to: addDays(anchor, 1), title: formatShortDate(anchor) };
    if (state.view === 'week') {
      const monday = addDays(anchor, -((anchor.getDay() + 6) % 7));
      const sunday = addDays(monday, 6);
      return { from: monday, to: addDays(monday, 7), title: `${formatShortDate(monday)} - ${formatShortDate(sunday)}` };
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: first, to: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1), title: `${formatShortDate(first)} - ${formatShortDate(last)}` };
  }

  function renderChart(bounds) {
    const sessions = shownSessions();
    const chart = el('div', 'chart');
    if (state.view === 'day') {
      chart.append(dayTrack(bounds.from, sessions).track, hourScale());
      return chart;
    }
    if (state.view === 'week') {
      for (let index = 0; index < 7; index += 1) {
        const date = addDays(bounds.from, index);
        const { track, total } = dayTrack(date, sessions);
        const row = el('div', 'week-row');
        const label = el('button', 'link-button', date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }));
        label.type = 'button';
        label.addEventListener('click', () => { state.view = 'day'; state.anchor = date; render(); });
        row.append(label, track, el('span', 'muted week-total', total ? formatDuration(total) : '–'));
        chart.append(row);
      }
      const scale = el('div', 'week-row');
      scale.append(el('span'), hourScale(), el('span'));
      chart.append(scale);
      return chart;
    }

    // All time: one bar per month, newest first
    if (state.view === 'all') {
      const months = [];
      for (let date = new Date(bounds.to.getFullYear(), bounds.to.getMonth(), 1); date >= new Date(bounds.from.getFullYear(), bounds.from.getMonth(), 1); date = new Date(date.getFullYear(), date.getMonth() - 1, 1)) {
        const start = toUnix(date);
        const end = toUnix(new Date(date.getFullYear(), date.getMonth() + 1, 1));
        months.push({ date, seconds: sessions.reduce((sum, session) => sum + Math.max(0, Math.min(session.end, end) - Math.max(session.start, start)), 0) });
      }
      const highest = Math.max(3600, ...months.map(month => month.seconds));
      for (const month of months) {
        const row = el('div', 'week-row');
        const label = el('button', 'link-button', month.date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }));
        label.type = 'button';
        label.addEventListener('click', () => { state.view = 'month'; state.anchor = month.date; render(); });
        const track = el('div', 'track');
        if (month.seconds) {
          const block = el('div', 'block');
          block.style.left = '0';
          block.style.width = `${(month.seconds / highest) * 100}%`;
          track.append(block);
        }
        row.append(label, track, el('span', 'muted week-total', month.seconds ? formatDuration(month.seconds) : '–'));
        chart.append(row);
      }
      return chart;
    }

    // Month: darker means more time in game that day
    const totals = [];
    for (let date = bounds.from; date < bounds.to; date = addDays(date, 1)) totals.push({ date, seconds: dayTrack(date, sessions).total });
    const highest = Math.max(3600, ...totals.map(day => day.seconds));
    const grid = el('div', 'month');
    for (const name of ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']) grid.append(el('span', 'muted month-head', name));
    for (let blank = 0; blank < (bounds.from.getDay() + 6) % 7; blank += 1) grid.append(el('span'));
    for (const day of totals) {
      const cell = el('button', 'month-cell', String(day.date.getDate()));
      cell.type = 'button';
      if (day.seconds > 0) cell.style.setProperty('--level', String(0.2 + 0.8 * (day.seconds / highest)));
      else cell.classList.add('empty');
      addTip(cell, `${formatDay(day.date)} : ${day.seconds ? formatDuration(day.seconds) : 'pas connecté'}`);
      cell.addEventListener('click', () => { state.view = 'day'; state.anchor = day.date; render(); });
      grid.append(cell);
    }
    chart.append(grid);
    return chart;
  }

  function render() {
    const bounds = periodBounds();
    const from = toUnix(bounds.from);
    const to = toUnix(bounds.to);
    const inPeriod = shownSessions().filter(session => session.end > from && session.start < to);
    const seconds = inPeriod.reduce((sum, session) => sum + Math.min(session.end, to) - Math.max(session.start, from), 0);
    // Per day, on the days of the period that have started: today counts, the days to come don't
    const periodEnd = Math.min(bounds.to, addDays(startOfDay(new Date()), 1));
    const days = Math.max(1, Math.round((periodEnd - bounds.from) / 86400000));
    const average = value => `Moyenne : ${value} / jour`;
    const averageCount = total => average(formatNumber(Number((total / days).toFixed(total / days < 0.1 ? 2 : 1)))); // 0,04 rather than 0

    const controls = el('div', 'controls');
    const views = el('div', 'segment');
    for (const [view, label] of [['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['all', 'En tout']]) {
      const choice = el('button', view === state.view ? 'segment-on' : '', label);
      choice.type = 'button';
      choice.setAttribute('aria-pressed', String(view === state.view));
      choice.addEventListener('click', () => { state.view = view; render(); });
      views.append(choice);
    }
    const step = direction => {
      const anchor = state.anchor;
      if (state.view === 'day') state.anchor = addDays(anchor, direction);
      else if (state.view === 'week') state.anchor = addDays(anchor, 7 * direction);
      else state.anchor = new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
      render();
    };
    const previous = el('button', 'button', '◀'); previous.type = 'button'; previous.setAttribute('aria-label', 'Période précédente'); previous.addEventListener('click', () => step(-1));
    const next = el('button', 'button', '▶'); next.type = 'button'; next.setAttribute('aria-label', 'Période suivante'); next.addEventListener('click', () => step(1));
    const nav = el('div', 'period-nav');
    if (state.view === 'all') nav.append(el('strong', 'period-title', bounds.title));
    else nav.append(previous, el('strong', 'period-title', bounds.title), next);
    // Untick one to leave its sessions out of everything below
    const filters = el('div', 'server-filters');
    for (const [type, label] of [['free', 'Free Access'], ['custom', 'Serveur custom']]) {
      const box = input('checkbox', undefined, { checked: state.show[type] });
      box.addEventListener('change', () => { state.show[type] = box.checked; render(); });
      const choice = el('label', `check server-filter ${type}`);
      choice.append(box, el('span', `server-swatch ${type}`), el('span', '', label));
      filters.append(choice);
    }
    controls.append(views, filters, nav);

    const tiles = el('div', 'tiles');
    // All time also has the old tickets with no date, the other views can only count dated ones
    const allTime = state.view === 'all';
    const showIngame = allTime || data.ingameTickets.dated.length > 0;
    const ingameCount = allTime ? data.ingameTickets.total : count(data.ingameTickets.dated, from, to);
    const discordCount = allTime ? data.discordTickets.total : count(data.discordTickets.dated, from, to);
    tiles.append(
      tile('Temps en jeu', formatDuration(seconds), average(formatDuration(seconds / days))),
      tile('Sessions', formatNumber(inPeriod.length), averageCount(inPeriod.length)),
      tile('Tickets en jeu', showIngame ? formatNumber(ingameCount) : '–', showIngame ? averageCount(ingameCount) : average('–')),
      tile('Tickets Discord', data.discordKnown ? formatNumber(discordCount) : '–', data.discordKnown ? averageCount(discordCount) : 'Compte Discord inconnu'),
    );

    const notes = el('p', 'muted note');
    notes.textContent = data.firstSession
      ? `Ça remonte au ${new Date(data.firstSession * 1000).toLocaleDateString('fr-FR', { dateStyle: 'long' })}. Les vieux tickets en jeu n'ont pas de date, ils ne comptent que dans En tout`
      : 'Pas encore de session ici ._.';

    const table = el('table', 'table');
    const head = el('tr');
    for (const name of ['Début', 'Fin', 'Durée', 'Serveur']) head.append(el('th', '', name));
    const headRow = el('thead'); headRow.append(head);
    const bodyRows = el('tbody');
    for (const session of [...inPeriod].reverse().slice(0, 200)) {
      const row = el('tr');
      row.append(el('td', '', formatDateTime(session.start)), el('td', '', formatDateTime(session.end)), el('td', '', formatDuration(session.end - session.start)), el('td', serverClass(session) ? `${serverClass(session)}-server` : '', serverLabel(session).replace(/^ · /, '') || '—'));
      bodyRows.append(row);
    }
    table.append(headRow, bodyRows);
    const tableBox = el('details', 'sessions');
    tableBox.append(el('summary', '', inPeriod.length === 1 ? 'Voir la session de cette période' : inPeriod.length > 200 ? 'Voir les 200 dernières sessions' : `Voir les ${inPeriod.length} sessions de cette période`));
    tableBox.append(table);

    root.replaceChildren(controls, tiles, renderChart(bounds), notes, tableBox);
  }

  render();
}

async function loadActivity() {
  const data = await getJson('/api/activity');
  $('verify-help').hidden = !data.notLinked;
  $('activity-panel').hidden = Boolean(data.notLinked);
  if (!data.notLinked) makeActivityView($('activity-body'), data);
}

// Role colours come from Discord: a very dark one wouldn't be readable on these panels
function readableColor(hex) {
  if (!hex) return null;
  let [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const light = () => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  while (light() < 110) {
    r += (255 - r) * 0.15; g += (255 - g) * 0.15; b += (255 - b) * 0.15;
  }
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;
}

// ---------------------------------------------------------------- tabs
const modTabs = new Map(); // Roblox id -> its nav entry and panel
let currentTab = 'activity';

const TAB_PATHS = { activity: '/', sanctions: '/sanctions', gestion: '/gestion', team: '/equipe', anticheat: '/anticheat', economy: '/economie', perms: '/permissions', shop: '/boutique', codes: '/codes', afk: '/event', texts: '/reglement', settings: '/parametres' };
const ENV_WORDS = { live: 'public', test: 'test' };

function tabUrl(name) {
  if (name.startsWith('mod-')) return `/modo/${name.slice(4)}`;
  return name in tabEnv && canSeeBothEnvs(name) ? `${TAB_PATHS[name]}/${ENV_WORDS[tabEnv[name]]}` : TAB_PATHS[name];
}

function parseUrl(pathname) {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const mod = clean.match(/^\/modo\/(\d{1,20})$/);
  if (mod && Number.isSafeInteger(Number(mod[1])) && Number(mod[1]) > 0) return { tab: `mod-${mod[1]}`, modId: Number(mod[1]) };
  const [base, word, extra] = clean.split('/').slice(1).map(part => `/${part}`);
  if (extra) return null;
  const tab = Object.keys(TAB_PATHS).find(key => TAB_PATHS[key] === (base || '/'));
  if (!tab) return null;
  if (!word) return { tab };
  if (!(tab in tabEnv)) return tab === 'texts' ? { tab } : null; // old /reglement/test and /public links
  const env = Object.keys(ENV_WORDS).find(key => `/${ENV_WORDS[key]}` === word);
  return env ? { tab, env } : null;
}

function canOpen(name) {
  if (name === 'activity' || name === 'settings') return true;
  if (name.startsWith('mod-')) return can('activity.others');
  if (name === 'team') return can('team.view') || can('team.creators'); // the content creators alone are on this tab too
  const perm = { sanctions: 'sanctions.view', gestion: 'gestion.view', anticheat: 'anticheat.view', economy: 'economy.view', shop: 'shop.view', codes: 'codes.view', afk: 'afk.view', texts: 'texts.view' }[name];
  return perm ? can(perm) : me.owner;
}

// A page you can't see, or that doesn't exist, goes back to the default page
function followUrl(how) {
  const route = parseUrl(location.pathname);
  if (!route || !canOpen(route.tab)) {
    location.replace('/');
    return;
  }
  // The test version needs its permission, the rest only see the public game
  if (route.env === 'test' && !canSeeBothEnvs(route.tab)) {
    location.replace('/');
    return;
  }
  if (route.env) tabEnv[route.tab] = route.env;
  if (route.modId) openModTab({ id: route.modId }, how, true);
  else openTab(route.tab, how);
}

function viewPill(kind) {
  const labels = { test: 'Version de test', live: 'Jeu public', both: 'Test et public' };
  return el('span', `view-pill view-${kind}`, labels[kind]);
}

function renderViewBar(name) {
  const bar = $('view-bar');
  bar.hidden = name === 'settings' || name === 'texts' || (name in tabEnv ? !canSeeBothEnvs(name) : !me.owner);
  if (bar.hidden) return;
  const env = tabEnv[name];
  if (!env) {
    const both = name === 'team';
    bar.replaceChildren(viewPill(both ? 'both' : 'live'), el('span', 'muted', both ? "Les rangs marchent sur les deux" : 'Les stats du jeu public, le test ne compte pas ici'));
    return;
  }
  const texts = {
    anticheat: { test: 'Ce qui se passe sur le jeu de test', live: 'Ce qui se passe sur le jeu public' },
    economy: { test: "L'économie du jeu de test", live: "L'économie du jeu public" },
    sanctions: { test: 'Les sanctions du staff sur le jeu de test', live: 'Les sanctions du staff sur le jeu public, en direct' },
    gestion: { test: 'Les sauvegardes du jeu de test', live: 'Les sauvegardes du jeu public' },
    edit: { test: "Tes changements arrivent ici d'abord", live: "Ce que les joueurs ont en ce moment. Rien à modifier ici, ça passe par Publier" },
  };
  const choice = el('div', 'segment');
  for (const [key, label] of [['test', 'Test'], ['live', 'Public']]) {
    const option = el('button', key === env ? 'segment-on' : '', label);
    option.type = 'button';
    option.setAttribute('aria-pressed', String(key === env));
    option.addEventListener('click', () => {
      if (tabEnv[name] === key) return;
      tabEnv[name] = key;
      shopState.editing = null;
      openTab(name);
    });
    choice.append(option);
  }
  const info = el('div', 'view-info');
  info.append(viewPill(env), el('span', 'muted', texts[name in texts ? name : 'edit'][env]));
  bar.replaceChildren(info, choice);
}

function openTab(name, how = 'push') {
  currentTab = name;
  closeMenu();
  stopSanctions();
  renderViewBar(name);
  if (how !== 'none' && location.pathname !== tabUrl(name)) {
    history[how === 'replace' ? 'replaceState' : 'pushState'](null, '', tabUrl(name));
  }
  for (const tab of TAB_IDS) {
    $(`tab-${tab}`).hidden = tab !== name;
    const choice = $(`nav-${tab}`);
    choice.classList.toggle('segment-on', tab === name);
    choice.setAttribute('aria-pressed', String(tab === name));
  }
  for (const [id, tab] of modTabs) {
    const active = name === `mod-${id}`;
    tab.panel.hidden = !active;
    tab.nav.classList.toggle('segment-on', active);
    tab.open.setAttribute('aria-pressed', String(active));
  }
  if (name === 'sanctions') loadSanctions().catch(err => notify(err.message, 'error'));
  if (name === 'team') loadTeam().catch(err => notify(err.message, 'error'));
  if (name === 'anticheat') loadAnticheat().catch(err => { $('ac-body').textContent = err.message; });
  if (name === 'economy') loadEconomy().catch(err => { $('economy-body').textContent = err.message; });
  if (name === 'perms') loadPerms().catch(err => { $('perms-body').textContent = err.message; });
  if (name === 'gestion') loadGestion().catch(err => notify(err.message, 'error'));
  if (name === 'texts') loadTexts().catch(err => { $('texts-body').textContent = err.message; });
  if (name === 'shop') loadShop().catch(err => notify(err.message, 'error'));
  if (name === 'codes') loadCodes().catch(err => notify(err.message, 'error'));
  if (name === 'afk') loadAfk().catch(err => notify(err.message, 'error'));
  if (name === 'settings') loadSettings().catch(err => notify(err.message, 'error'));
}

function closeModTab(id) {
  const tab = modTabs.get(id);
  if (!tab) return;
  tab.nav.remove();
  tab.panel.remove();
  modTabs.delete(id);
  editingNotes.delete(id); // a note being written there is dropped with the tab
  if (currentTab === `mod-${id}`) openTab('team');
}

async function openModTab(row, how = 'push', fromUrl = false) {
  if (modTabs.has(row.id)) return openTab(`mod-${row.id}`, how);

  let data;
  try {
    data = await getJson(`/api/activity?id=${row.id}`);
    if (!data.player) throw new Error('Ce joueur est introuvable');
  } catch (err) {
    if (fromUrl) return location.replace('/');
    return notify(err.message, 'error');
  }
  const name = data.player.name || String(row.id);

  const nav = el('span', 'nav-mod');
  const open = el('button', '', name);
  open.type = 'button';
  const color = readableColor(data.player.color);
  if (color) open.style.color = color;
  open.addEventListener('click', () => openTab(`mod-${row.id}`));
  const close = el('button', 'nav-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', `Fermer l'onglet de ${name}`);
  close.addEventListener('click', () => closeModTab(row.id));
  nav.append(open, close);
  $('nav-mods').append(nav);

  const panel = el('div', 'mod-tab');
  const activity = el('section', 'panel');
  const title = el('header', 'panel-title');
  title.append(el('h2', '', `L'activité de ${name}`));
  if (data.player.gerant) title.append(gerantBadge());
  const body = el('div', 'panel-body');
  activity.append(title, body);
  panel.append(activity);
  if (can('team.rankups')) panel.append(modRankupsPanel(row.id));
  // The Conseil's note on this staff member: nobody else sees the panel (and the server refuses them anyway)
  if (me.conseil || me.owner) panel.append(staffNotePanel(row.id, name));
  $('mod-tabs').append(panel);

  modTabs.set(row.id, { nav, open, panel });
  makeActivityView(body, data);
  openTab(`mod-${row.id}`, how);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- Discord-like text (the Conseil's notes)
// Built as page elements straight from the text, never as HTML: whatever is written in a note stays text.
// names: what the server found for the mentions ({ users, roles, channels }, by id)

const TIME_STYLES = {
  t: { hour: '2-digit', minute: '2-digit' },
  T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
  d: { day: '2-digit', month: '2-digit', year: 'numeric' },
  D: { day: 'numeric', month: 'long', year: 'numeric' },
  f: { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
  F: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
};
function relativeTime(unix) {
  const seconds = unix - Date.now() / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
  const [unit, size] = units.find(([, length]) => Math.abs(seconds) >= length) || units[units.length - 1];
  return new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' }).format(Math.round(seconds / size), unit);
}

// Inline rules, in the order they win when two start at the same place. inner: the part that is formatted again
const MD_RULES = [
  { re: /\\([^A-Za-z0-9\s])/g, make: m => document.createTextNode(m[1]) },
  { re: /``([\s\S]+?)``|`([^`]+?)`/g, make: m => el('code', 'md-code', m[1] ?? m[2]) },
  { re: /<(a?):(\w{2,32}):(\d{15,22})>/g, make: m => {
    const image = el('img', 'md-emoji');
    image.src = `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'webp'}?size=48`;
    image.alt = `:${m[2]}:`;
    image.title = `:${m[2]}:`;
    image.loading = 'lazy';
    return image;
  } },
  { re: /<t:(-?\d{1,13})(?::([tTdDfFR]))?>/g, make: m => {
    const unix = Number(m[1]);
    const date = new Date(unix * 1000);
    if (Number.isNaN(date.getTime())) return document.createTextNode(m[0]);
    const time = el('span', 'md-time', m[2] === 'R' ? relativeTime(unix) : date.toLocaleString('fr-FR', TIME_STYLES[m[2] || 'f']));
    time.title = date.toLocaleString('fr-FR', TIME_STYLES.F);
    return time;
  } },
  { re: /<(@!?|@&|#)(\d{15,22})>/g, make: (m, names) => {
    if (m[1] === '#') return el('span', 'md-mention', `#${names.channels?.[m[2]] || 'salon-inconnu'}`);
    if (m[1] === '@&') {
      const role = names.roles?.[m[2]];
      const mention = el('span', 'md-mention', `@${role?.name || 'rôle-inconnu'}`);
      const color = readableColor(role?.color);
      if (color) mention.style.setProperty('--mention', color);
      if (color) mention.classList.add('md-role');
      return mention;
    }
    return el('span', 'md-mention', `@${names.users?.[m[2]] || 'utilisateur-inconnu'}`);
  } },
  { re: /@(everyone|here)\b/g, make: m => el('span', 'md-mention', m[0]) },
  { re: /\[([^\[\]\n]{1,300})\]\(<?(https?:\/\/[^\s<>()]+)>?\)/g, make: m => mdLink(m[2], m[1]) },
  { re: /<?(https?:\/\/[^\s<>]*[^\s<>.,:;"')\]!?])>?/g, make: m => mdLink(m[1], m[1]) },
  { re: /\*\*([\s\S]+?)\*\*(?!\*)/g, tag: 'strong' },
  { re: /__([\s\S]+?)__(?!_)/g, tag: 'u' },
  { re: /\*(?=\S)([\s\S]*?\S)\*(?!\*)/g, tag: 'em' },
  { re: /(?<![A-Za-z0-9_])_([^_\n]+?)_(?![A-Za-z0-9_])/g, tag: 'em' },
  { re: /~~([\s\S]+?)~~/g, tag: 's' },
  { re: /\|\|([\s\S]+?)\|\|/g, tag: 'span', className: 'md-spoiler' },
];

// Only real web addresses become links, opened in a new tab
function mdLink(address, text) {
  let url;
  try { url = new URL(address); } catch { return document.createTextNode(text); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return document.createTextNode(text);
  const link = el('a', 'md-link', text);
  link.href = url.href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function mdInline(text, names, depth = 0) {
  const out = document.createDocumentFragment();
  if (depth > 12) { out.append(text); return out; }
  // Where each rule matches next: searched again only once the text passed it
  const next = MD_RULES.map(() => null);
  let at = 0;
  while (at < text.length) {
    let best = -1;
    for (let index = 0; index < MD_RULES.length; index += 1) {
      if (next[index] === undefined) continue; // no more of this one
      if (!next[index] || next[index].index < at) {
        const rule = MD_RULES[index];
        rule.re.lastIndex = at;
        next[index] = rule.re.exec(text) || undefined;
        if (next[index] === undefined) continue;
      }
      if (best < 0 || next[index].index < next[best].index) best = index;
    }
    if (best < 0) break;
    const match = next[best];
    const rule = MD_RULES[best];
    if (match.index > at) out.append(text.slice(at, match.index));
    if (rule.make) out.append(rule.make(match, names));
    else {
      const node = el(rule.tag, rule.className);
      node.append(mdInline(match[1], names, depth + 1));
      if (rule.className === 'md-spoiler') {
        node.title = 'Clique pour voir';
        node.addEventListener('click', () => node.classList.add('open'));
      }
      out.append(node);
    }
    at = match.index + match[0].length;
    next[best] = null;
  }
  if (at < text.length) out.append(text.slice(at));
  return out;
}

const MD_LIST = /^(\s*)([-*]|\d{1,3}[.)]) +(.*)$/;
function mdBlocks(text, names, depth = 0) {
  const out = document.createDocumentFragment();
  // Code blocks first: nothing inside them is formatted
  const parts = text.split(/(```[\s\S]*?```)/g);
  for (const part of parts) {
    const fenced = /^```(?:([\w+#.-]{1,20})\n)?([\s\S]*?)```$/.exec(part);
    if (fenced && part.length > 6) {
      const pre = el('pre', 'md-codeblock');
      pre.append(el('code', '', fenced[2].replace(/^\n|\n$/g, '')));
      out.append(pre);
      continue;
    }
    mdLines(part.replace(/^\n|\n$/g, '').split('\n'), names, depth, out);
  }
  return out;
}

function mdLines(lines, names, depth, out) {
  if (lines.length === 1 && lines[0] === '') return;
  let index = 0;
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    const block = el('div', 'md-p');
    block.append(mdInline(paragraph.join('\n'), names, depth));
    out.append(block);
    paragraph = [];
  };
  while (index < lines.length) {
    const line = lines[index];
    // ">>> ": everything after it is quoted
    if (depth < 3 && /^>>> /.test(line)) {
      flush();
      const quote = el('blockquote', 'md-quote');
      quote.append(mdBlocks([line.slice(4), ...lines.slice(index + 1)].join('\n'), names, depth + 1));
      out.append(quote);
      return;
    }
    if (depth < 3 && /^> |^>$/.test(line)) {
      flush();
      const quoted = [];
      while (index < lines.length && /^> |^>$/.test(lines[index])) { quoted.push(lines[index].slice(2)); index += 1; }
      const quote = el('blockquote', 'md-quote');
      quote.append(mdBlocks(quoted.join('\n'), names, depth + 1));
      out.append(quote);
      continue;
    }
    const heading = /^(#{1,3}) +(.+)$/.exec(line);
    if (heading) {
      flush();
      const title = el(`h${heading[1].length + 2}`, `md-h md-h${heading[1].length}`);
      title.append(mdInline(heading[2], names, depth));
      out.append(title);
      index += 1;
      continue;
    }
    const subtext = /^-# +(.+)$/.exec(line);
    if (subtext) {
      flush();
      const small = el('small', 'md-sub');
      small.append(mdInline(subtext[1], names, depth));
      out.append(small);
      index += 1;
      continue;
    }
    if (MD_LIST.test(line)) {
      flush();
      // Two spaces more: one level deeper (three at most)
      const stack = [];
      while (index < lines.length && MD_LIST.test(lines[index])) {
        const [, indent, marker, content] = MD_LIST.exec(lines[index]);
        const level = Math.min(2, Math.floor(indent.replace(/\t/g, '  ').length / 2));
        const kind = /\d/.test(marker) ? 'OL' : 'UL';
        while (stack.length > level + 1) stack.pop();
        if (stack.length === level + 1 && stack[level].tagName !== kind) stack.pop(); // "1." after "-": a new list
        while (stack.length < level + 1) {
          const list = el(kind.toLowerCase(), 'md-list');
          if (list.tagName === 'OL' && stack.length === 0) list.start = Number.parseInt(marker, 10) || 1;
          if (stack.length) (stack[stack.length - 1].lastElementChild || stack[stack.length - 1]).append(list);
          else out.append(list);
          stack.push(list);
        }
        const item = el('li');
        item.append(mdInline(content, names, depth));
        stack[stack.length - 1].append(item);
        index += 1;
      }
      continue;
    }
    paragraph.push(line);
    index += 1;
  }
  flush();
}

// What is written, as Discord would show it
function discordText(text, names = {}) {
  const box = el('div', 'md');
  box.append(mdBlocks(String(text || ''), names));
  return box;
}

// ---------------------------------------------------------------- the Conseil's note on a staff member (bottom of their activity)
// Puts **...** around what is selected (or the line markers in front of each selected line), keeping Ctrl+Z when the browser allows it
function wrapSelection(area, before, after = before) {
  const { selectionStart: start, selectionEnd: end, value } = area;
  const picked = value.slice(start, end);
  area.focus();
  if (!document.execCommand?.('insertText', false, before + picked + after)) area.setRangeText(before + picked + after, start, end, 'end');
  area.setSelectionRange(start + before.length, start + before.length + picked.length);
  area.dispatchEvent(new Event('input'));
}
function prefixLines(area, prefix) {
  const { selectionStart, selectionEnd, value } = area;
  const start = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const end = selectionEnd;
  const lines = value.slice(start, end).split('\n');
  const done = lines.every(line => line.startsWith(prefix)) ? lines.map(line => line.slice(prefix.length)) : lines.map(line => prefix + line);
  area.focus();
  area.setSelectionRange(start, end);
  const text = done.join('\n');
  if (!document.execCommand?.('insertText', false, text)) area.setRangeText(text, start, end, 'end');
  area.setSelectionRange(start, start + text.length);
  area.dispatchEvent(new Event('input'));
}

const NOTE_TOOLS = [
  { label: 'G', title: 'Gras (**texte**)', className: 'tool-bold', run: area => wrapSelection(area, '**') },
  { label: 'I', title: 'Italique (*texte*)', className: 'tool-italic', run: area => wrapSelection(area, '*') },
  { label: 'S', title: 'Souligné (__texte__)', className: 'tool-underline', run: area => wrapSelection(area, '__') },
  { label: 'B', title: 'Barré (~~texte~~)', className: 'tool-strike', run: area => wrapSelection(area, '~~') },
  { label: 'Titre', title: 'Titre (# en début de ligne, ## et ### plus petits)', run: area => prefixLines(area, '## ') },
  { label: '• Liste', title: 'Liste (- en début de ligne)', run: area => prefixLines(area, '- ') },
  { label: '❝ Citation', title: 'Citation (> en début de ligne)', run: area => prefixLines(area, '> ') },
  { label: '</>', title: 'Code (`texte`, ou ``` sur plusieurs lignes)', run: area => (area.value.slice(area.selectionStart, area.selectionEnd).includes('\n') ? wrapSelection(area, '```\n', '\n```') : wrapSelection(area, '`')) },
  { label: 'Spoiler', title: 'Spoiler (||texte||)', run: area => wrapSelection(area, '||') },
];

const editingNotes = new Set(); // notes being written: leaving the page asks first
window.addEventListener('beforeunload', event => {
  if (editingNotes.size) event.preventDefault();
});

function staffNotePanel(robloxId, name) {
  const panel = el('section', 'panel note-panel');
  const title = el('header', 'panel-title note-title');
  title.append(el('h2', '', 'Note du Conseil'), el('span', 'muted note-private', 'Seuls le Conseil et le propriétaire la voient'));
  const body = el('div', 'panel-body');
  body.append(el('p', 'muted', 'Ça charge...'));
  panel.append(title, body);
  const state = { note: null, names: {}, max: 20000, draft: null };

  function show() {
    editingNotes.delete(robloxId);
    const parts = [];
    if (state.note?.content) parts.push(discordText(state.note.content, state.names));
    else parts.push(el('p', 'muted', `Rien d'écrit sur ${name} pour l'instant`));
    const foot = el('div', 'note-foot');
    foot.append(el('span', 'muted', state.note ? `Modifiée par ${state.note.updatedBy} le ${formatDateTime(state.note.updatedAt)}` : ''));
    foot.append(button(state.note ? 'Modifier' : 'Écrire une note', edit));
    parts.push(foot);
    body.replaceChildren(...parts);
  }

  function edit() {
    editingNotes.add(robloxId);
    const area = el('textarea', 'note-area');
    area.value = state.draft ?? state.note?.content ?? '';
    area.maxLength = state.max;
    area.rows = 16;
    area.spellcheck = true;
    area.placeholder = 'Écris comme sur Discord : **gras**, *italique*, __souligné__, ~~barré~~, # titre, - liste, > citation, `code`, ||spoiler||, <@id> pour mentionner';
    const counter = el('span', 'muted note-count');
    const preview = el('div', 'note-preview');
    preview.hidden = true;

    const tools = el('div', 'note-tools');
    for (const tool of NOTE_TOOLS) {
      const toolButton = el('button', `note-tool ${tool.className || ''}`, tool.label);
      toolButton.type = 'button';
      toolButton.title = tool.title;
      toolButton.addEventListener('mousedown', event => event.preventDefault()); // keeps the selection in the text
      toolButton.addEventListener('click', () => { if (!area.hidden) tool.run(area); });
      tools.append(toolButton);
    }
    const views = el('div', 'segment');
    const write = el('button', 'segment-on', 'Écrire');
    const look = el('button', '', 'Aperçu');
    for (const [choice, previewing] of [[write, false], [look, true]]) {
      choice.type = 'button';
      choice.addEventListener('click', () => {
        write.classList.toggle('segment-on', !previewing);
        look.classList.toggle('segment-on', previewing);
        area.hidden = previewing;
        tools.classList.toggle('disabled', previewing);
        preview.hidden = !previewing;
        // The mentions not known yet stay "inconnu" until it's saved
        if (previewing) preview.replaceChildren(area.value.trim() ? discordText(area.value, state.names) : el('p', 'muted', 'Rien à montrer'));
        else area.focus();
      });
      views.append(choice);
    }
    const top = el('div', 'note-top');
    top.append(tools, views);

    const update = () => {
      state.draft = area.value;
      counter.textContent = `${formatNumber(area.value.length)} / ${formatNumber(state.max)}`;
      counter.classList.toggle('warning-text', area.value.length > state.max * 0.95);
    };
    area.addEventListener('input', update);
    update();

    const save = button('Enregistrer', async () => {
      save.disabled = true;
      try {
        const answer = await post('/api/notes', { robloxId, content: area.value, since: state.note?.updatedAt || 0 });
        state.note = answer.note;
        state.names = answer.names || {};
        state.draft = null;
        notify(answer.note ? 'Note enregistrée' : 'Note vidée');
        show();
      } catch (err) {
        save.disabled = false;
        notify(err.message, 'error');
      }
    });
    const cancel = button('Annuler', () => {
      if (area.value !== (state.note?.content || '') && cancel.dataset.armed !== '1') {
        cancel.dataset.armed = '1';
        cancel.textContent = 'Tout perdre ?';
        setTimeout(() => { cancel.dataset.armed = '0'; cancel.textContent = 'Annuler'; }, 4000);
        return;
      }
      state.draft = null;
      show();
    });
    area.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!save.disabled) save.click();
      }
    });
    const foot = el('div', 'note-foot');
    const actions = el('div', 'note-actions');
    actions.append(cancel, save);
    foot.append(counter, actions);
    body.replaceChildren(top, area, preview, foot);
    area.focus();
  }

  getJson(`/api/notes?id=${robloxId}`).then(answer => {
    state.note = answer.note;
    state.names = answer.names || {};
    state.max = answer.max || state.max;
    show();
  }).catch(err => body.replaceChildren(el('p', 'muted', err.message)));
  return panel;
}

// ---------------------------------------------------------------- team
let teamRoles = [];
const teamState = { rows: [], unknown: [], roles: [], search: '', sort: 'rank', show: { free: true, custom: true } };
// Time of a row with the server types that are ticked (the rest always counts), like the activity page
function teamSeconds(row, days) {
  const split = row[`split${days}`];
  if (!split) return row[`seconds${days}`] || 0;
  return split.other + (teamState.show.free ? split.free : 0) + (teamState.show.custom ? split.custom : 0);
}
let openMenu = null;

function button(text, onClick, danger) {
  const element = el('button', danger ? 'button danger' : 'button', text);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

// Two clicks: a removal takes effect in every server straight away
function confirmButton(text, action) {
  const element = button(text, async () => {
    if (element.dataset.armed !== '1') {
      element.dataset.armed = '1';
      element.textContent = "T'es sûr ?";
      setTimeout(() => { element.dataset.armed = '0'; element.textContent = text; }, 4000);
      return;
    }
    await action();
  }, true);
  return element;
}

async function run(action, done) {
  try {
    const answer = await action();
    if (answer.warning) notify(answer.warning, 'warn');
    else notify(typeof done === 'function' ? done(answer) : done);
    await loadTeam();
  } catch (err) {
    notify(err.message, 'error');
  }
}

function closeMenu() {
  if (!openMenu) return;
  openMenu.element.remove();
  openMenu = null;
}
document.addEventListener('click', event => {
  if (openMenu && !openMenu.element.contains(event.target)) closeMenu();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
window.addEventListener('scroll', closeMenu, true);
window.addEventListener('resize', closeMenu);

// The "..." of a team member: change the rank or take the perms away, and the Gérant role on its own
function toggleRowMenu(row, anchor) {
  const wasOpen = openMenu?.row === row.id;
  closeMenu();
  if (wasOpen) return;

  const menu = el('div', 'menu');
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', `Options pour ${row.name}`);

  // A frozen moderator from the old list has no rank here: whoever manages the team can give one
  const rankable = row.role ? row.canManage : can('team.manage');
  let select = null;
  if (rankable) {
    const label = el('label', 'menu-label', 'Changer son rang');
    select = el('select');
    select.append(...teamState.roles.map(role => new Option(role.name, role.id)));
    // Their old rank is chosen for a frozen moderator from the old list
    select.value = row.roleId || teamState.roles.find(role => role.name === row.oldGroup)?.id || '';
    label.append(select);
    const save = button('Valider', async () => {
      if (select.value === row.roleId) return closeMenu();
      closeMenu();
      await run(() => post('/api/staff', { name: row.name, roleId: select.value }), `${row.name} a bien reçu son rang`);
    });
    const remove = confirmButton('Retirer ses perms', async () => {
      closeMenu();
      await run(() => post('/api/staff/remove', { robloxId: row.id }), `${row.name} a bien été retiré de l'équipe`);
    });
    menu.append(label, save, remove);
  }
  // Not tied to the rank: it stays when the rank changes, and only goes when they leave the team
  if (row.role && can('team.gerant')) {
    const who = row.discordName || row.name;
    if (row.gerant) {
      menu.append(confirmButton('Retirer le rôle Gérant', async () => {
        closeMenu();
        await run(() => post('/api/staff/gerant', { robloxId: row.id, value: false }), `${who} n'a plus le rôle Gérant`);
      }));
    } else {
      menu.append(button('Donner le rôle Gérant', async () => {
        closeMenu();
        await run(() => post('/api/staff/gerant', { robloxId: row.id, value: true }), `${who} a maintenant le rôle Gérant`);
      }));
    }
  }
  if (row.hasPin && can('team.pins')) {
    menu.append(confirmButton('Retirer son code PIN', async () => {
      closeMenu();
      await run(() => post('/api/staff/pin/remove', { robloxId: row.id }), `Le code PIN de ${row.name} a été retiré, il peut se reconnecter sans`);
    }));
  }
  document.body.append(menu);

  // Opens under the button, or above it at the bottom of the screen
  const box = anchor.getBoundingClientRect();
  const size = menu.getBoundingClientRect();
  const top = box.bottom + 6 + size.height > window.innerHeight ? box.top - size.height - 6 : box.bottom + 6;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, Math.min(box.right - size.width, window.innerWidth - size.width - 8))}px`;
  openMenu = { element: menu, row: row.id };
  (select || menu.querySelector('button'))?.focus();
}

// "Gérant" next to a rank: the staff server role given apart from the ranks
function gerantBadge() {
  const badge = el('span', 'gerant-badge', 'Gérant');
  addTip(badge, 'A le rôle Gérant sur le Discord staff');
  return badge;
}

// A small padlock: this person has a PIN on the dashboard (the owner only sees it)
function lockIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'pin-lock');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2zM9 7a3 3 0 0 1 6 0v2H9V7zm3 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z');
  svg.append(path);
  const box = el('span', 'pin-lock-box');
  box.append(svg);
  addTip(box, 'Code PIN activé');
  return box;
}

// A Discord picture, or an empty circle so the names stay aligned
function memberPicture(url) {
  const picture = el(url ? 'img' : 'span', 'member-pic');
  if (url) {
    picture.src = url;
    picture.alt = '';
    picture.loading = 'lazy';
    picture.addEventListener('error', () => { picture.style.visibility = 'hidden'; });
  }
  return picture;
}

// ---------------------------------------------------------------- rankup logs (Équipe)
const RANKUP_KINDS = {
  add: { label: 'Ajout', tone: 'ok' },
  up: { label: 'Rankup', tone: 'ok' },
  down: { label: 'Derank', tone: 'danger' },
  freeze: { label: 'Gel', tone: 'cold' },
  unfreeze: { label: 'Dégel', tone: 'ok' },
  remove: { label: 'Retrait', tone: 'danger' },
  gerant_add: { label: 'Gérant donné', tone: 'gerant' },
  gerant_remove: { label: 'Gérant retiré', tone: 'danger' },
  seed: { label: 'Propriétaire', tone: '' },
};
const rankupState = { entries: [], search: '', shown: 50 };

function rankupChange(entry) {
  const cell = el('td');
  if (entry.kind === 'add') cell.append('Ajouté en ', el('strong', '', entry.to || '?'));
  else if (entry.kind === 'remove') cell.append('Perms retirées', el('small', 'muted cell-note', `Il était ${entry.from || '?'}`));
  else if (entry.kind === 'gerant_add') cell.append('Rôle Gérant donné sur le Discord staff');
  else if (entry.kind === 'gerant_remove') cell.append('Rôle Gérant retiré sur le Discord staff');
  else if (entry.kind === 'seed') cell.append('Rang ', el('strong', '', entry.to || '?'), ' remis tout seul par le site');
  else cell.append(el('span', 'muted', entry.from || '?'), ' → ', el('strong', '', entry.to || '?'));
  return cell;
}

function renderRankups() {
  const body = $('rankups-body');
  const plain = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const terms = rankupState.search.split(',').map(part => plain(part.trim()).replace(/^@/, '')).filter(Boolean);
  const rows = rankupState.entries.filter(entry => terms.every(term => [entry.name, entry.by, entry.from, entry.to, RANKUP_KINDS[entry.kind]?.label].some(value => plain(value).includes(term))));

  const table = el('table', 'table rankups');
  const head = el('tr');
  for (const label of ['Quand', 'Modo', 'Quoi', 'Changement', 'Par']) head.append(el('th', '', label));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const entry of rows.slice(0, rankupState.shown)) {
    const tr = el('tr');
    const when = el('td', 'num', formatTime(entry.at));
    when.append(el('small', 'muted subline', formatShortDate(new Date(entry.at * 1000))));
    const who = el('td');
    if (entry.robloxId && can('activity.others')) {
      const open = el('button', 'link-button', `@${entry.name}`);
      open.type = 'button';
      open.addEventListener('click', () => openModTab({ id: entry.robloxId }));
      who.append(open);
    } else who.append(el('span', '', `@${entry.name}`));
    const kind = RANKUP_KINDS[entry.kind] || { label: entry.kind, tone: '' };
    const what = el('td');
    what.append(el('span', `rankup-kind ${kind.tone}`, kind.label));
    tr.append(when, who, what, rankupChange(entry), el('td', '', entry.by || '?'));
    tbody.append(tr);
  }
  if (!rows.length) {
    const tr = el('tr');
    const cell = el('td', 'muted', rankupState.entries.length ? 'Rien avec cette recherche ._.' : 'Aucun changement de rang pour l\'instant');
    cell.colSpan = 5;
    tr.append(cell);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);

  // The search box is made once: typing in it only redraws the list under it
  let list = body.querySelector('.rankups-list');
  if (!list) {
    const field = input('search', rankupState.search, { autocomplete: 'off', placeholder: 'un modo, un rang, qui l\'a fait' });
    field.addEventListener('input', () => { rankupState.search = field.value; rankupState.shown = 50; renderRankups(); });
    const box = el('label', 'search', 'Chercher dans les logs. Sépare avec des virgules pour combiner');
    box.append(field);
    list = el('div', 'rankups-list');
    body.replaceChildren(box, list);
  }
  const parts = [scroll];
  if (rows.length > rankupState.shown) {
    parts.push(button(`Voir les plus anciens (${formatNumber(rows.length - rankupState.shown)})`, () => { rankupState.shown += 100; renderRankups(); }));
  }
  list.replaceChildren(...parts);
}

// The rankup logs of one staff member, on their activity page
function modRankupsPanel(robloxId) {
  const section = el('section', 'panel');
  const title = el('header', 'panel-title');
  title.append(el('h2', '', 'Logs de rankup'));
  const body = el('div', 'panel-body');
  body.append(el('p', 'muted', 'Ça charge...'));
  section.append(title, body);
  getJson(`/api/staff/rankups?id=${robloxId}`).then(({ entries }) => {
    if (!entries.length) {
      body.replaceChildren(el('p', 'muted', "Aucun changement de rang fait depuis le site pour l'instant"));
      return;
    }
    const table = el('table', 'table rankups');
    const head = el('tr');
    for (const label of ['Quand', 'Quoi', 'Changement', 'Par']) head.append(el('th', '', label));
    const thead = el('thead');
    thead.append(head);
    const tbody = el('tbody');
    for (const entry of entries) {
      const tr = el('tr');
      const when = el('td', 'num', formatTime(entry.at));
      when.append(el('small', 'muted subline', formatShortDate(new Date(entry.at * 1000))));
      const kind = RANKUP_KINDS[entry.kind] || { label: entry.kind, tone: '' };
      const what = el('td');
      what.append(el('span', `rankup-kind ${kind.tone}`, kind.label));
      tr.append(when, what, rankupChange(entry), el('td', '', entry.by || '?'));
      tbody.append(tr);
    }
    table.append(thead, tbody);
    const scroll = el('div', 'table-scroll');
    scroll.append(table);
    body.replaceChildren(scroll);
  }).catch(err => body.replaceChildren(el('p', 'muted', err.message)));
  return section;
}

async function loadRankups() {
  rankupState.entries = (await getJson('/api/staff/rankups')).entries;
  renderRankups();
}

// ---------------------------------------------------------------- former moderators (bottom of Équipe)
async function copyText(text, what) {
  try {
    await navigator.clipboard.writeText(String(text));
    notify(`${what} copié`);
  } catch {
    notify('Le navigateur a refusé de copier', 'error');
  }
}

function toggleFormerMenu(entry, anchor, canEdit) {
  const key = `former-${entry.id}`;
  const wasOpen = openMenu?.row === key;
  closeMenu();
  if (wasOpen) return;
  const menu = el('div', 'menu');
  menu.setAttribute('role', 'dialog');
  menu.setAttribute('aria-label', `Options pour ${entry.name || entry.id}`);
  menu.append(button("Copier l'identifiant Roblox", () => { closeMenu(); copyText(entry.id, 'Identifiant Roblox'); }));
  if (entry.discordId) menu.append(button("Copier l'identifiant Discord", () => { closeMenu(); copyText(entry.discordId, 'Identifiant Discord'); }));
  if (canEdit) {
    menu.append(confirmButton("Retirer de l'historique", async () => {
      closeMenu();
      await run(() => post('/api/staff/former/remove', { robloxId: entry.id }), `${entry.name || entry.id} n'est plus dans l'historique`);
    }));
  }
  document.body.append(menu);
  const box = anchor.getBoundingClientRect();
  const size = menu.getBoundingClientRect();
  const top = box.bottom + 6 + size.height > window.innerHeight ? box.top - size.height - 6 : box.bottom + 6;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.max(8, Math.min(box.right - size.width, window.innerWidth - size.width - 8))}px`;
  openMenu = { element: menu, row: key };
}

function renderFormer(list, canEdit) {
  const body = $('former-body');
  if (!list.length) {
    body.replaceChildren(el('p', 'muted', "Personne pour l'instant ^^"));
    return;
  }
  const table = el('table', 'table mods');
  const head = el('tr');
  for (const label of ['Ancien modo', 'Dernier rang', 'Retiré le', '']) head.append(el('th', '', label));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const entry of list) {
    const tr = el('tr');
    const who = el('div', 'member-who');
    const names = el('div');
    names.append(el('strong', '', entry.discordName || (entry.name ? `@${entry.name}` : String(entry.id))));
    if (entry.discordName && entry.name) names.append(el('small', 'muted cell-note', `@${entry.name}`));
    who.append(memberPicture(entry.avatar), names);
    const nameCell = el('td');
    nameCell.append(who);
    const when = el('td', '', entry.removedAt ? formatDateTime(entry.removedAt) : '–');
    if (entry.removedBy) when.append(el('small', 'muted cell-note', `par ${entry.removedBy}`));
    const actions = el('td', 'cell-actions');
    const more = button('...', event => {
      event.stopPropagation();
      toggleFormerMenu(entry, more, canEdit);
    });
    more.classList.add('more');
    more.setAttribute('aria-label', `Options pour ${entry.name || entry.id}`);
    actions.append(more);
    tr.append(nameCell, el('td', '', entry.role || '–'), when, actions);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);
  body.replaceChildren(scroll);
}

function renderMods() {
  const search = teamState.search.toLowerCase();
  const shownName = row => row.discordName || row.name || '';
  const rows = teamState.rows
    .filter(row => !search || shownName(row).toLowerCase().includes(search) || (row.name || '').toLowerCase().includes(search))
    .sort((a, b) => {
      if (teamState.sort === 'name') return shownName(a).localeCompare(shownName(b));
      // Highest rank first, same rank by name, no rank at the bottom
      if (teamState.sort === 'rank') return ((b.rank ?? -1) - (a.rank ?? -1)) || shownName(a).localeCompare(shownName(b));
      if (teamState.sort === 'seconds7') return teamSeconds(b, 7) - teamSeconds(a, 7);
      if (teamState.sort === 'seconds30') return teamSeconds(b, 30) - teamSeconds(a, 30);
      return (b[teamState.sort] || 0) - (a[teamState.sort] || 0);
    });

  const table = el('table', 'table mods');
  const head = el('tr');
  for (const [label, key] of [['Membre', 'name'], ['Rang', 'rank'], ['7 jours', 'seconds7'], ['30 jours', 'seconds30'], ['Tickets en jeu', 'ingameTickets'], ['Tickets Discord', 'discordTickets'], ['Vu', 'lastSeen'], ['', null]]) {
    const th = el('th');
    if (key) {
      const sort = el('button', 'link-button', label + (teamState.sort === key ? ' ▾' : ''));
      sort.type = 'button';
      sort.addEventListener('click', () => { teamState.sort = key; renderMods(); });
      th.append(sort);
    } else th.textContent = label;
    head.append(th);
  }
  const thead = el('thead'); thead.append(head);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    const nameCell = el('td');
    const open = el('button', 'link-button', row.discordName || row.name || String(row.id));
    open.type = 'button';
    const nameColor = readableColor(row.color);
    if (nameColor) open.style.color = nameColor;
    open.addEventListener('click', () => openModTab(row));
    const who = el('div', 'member-who');
    const names = el('div');
    const nameLine = el('div', 'member-name-line');
    nameLine.append(open);
    if (row.hasPin) nameLine.append(lockIcon());
    if (row.online) {
      const dot = el('span', `online-dot ${serverClass(row.online)}`);
      addTip(dot, [SERVER_TYPE_NAMES[row.online.serverType], row.online.serverName].filter(Boolean).join(' · ') || 'Serveur inconnu');
      nameLine.append(dot);
    }
    names.append(nameLine);
    if (row.discordName && row.name) names.append(el('small', 'muted cell-note', `@${row.name}`));
    if (!row.verified) names.append(el('small', 'muted cell-note', 'Pas vérifié'));
    who.append(memberPicture(row.avatar), names);
    nameCell.append(who);

    const rankCell = el('td');
    if (row.role) {
      rankCell.textContent = row.role;
      if (row.gerant) rankCell.append(gerantBadge());
    } else {
      rankCell.append(el('span', 'warning-text', '⚠ Pas de rang en jeu'));
      if (row.oldGroup) rankCell.append(el('small', 'muted cell-note', `Avant : ${row.oldGroup}`));
    }
    tr.append(nameCell, rankCell,
      el('td', 'num', formatDuration(teamSeconds(row, 7))),
      el('td', 'num', formatDuration(teamSeconds(row, 30))),
      el('td', 'num', formatNumber(row.ingameTickets)),
      el('td', 'num', row.discordTickets === null ? '–' : formatNumber(row.discordTickets)),
      el('td', '', row.lastSeen ? formatDateTime(row.lastSeen) : '–'));
    const actions = el('td', 'cell-actions');
    if (row.role) {
      if (row.canManage || can('team.gerant')) {
        const more = button('...', event => {
          event.stopPropagation();
          toggleRowMenu(row, more);
        });
        more.classList.add('more');
        more.setAttribute('aria-label', `Options pour ${row.name}`);
        actions.append(more);
      }
    } else if (row.oldGroup === 'Modérateur gelé') {
      // Frozen on purpose: the same menu as the others (give a rank back, or take them off the team)
      if (can('team.manage')) {
        const more = button('...', event => {
          event.stopPropagation();
          toggleRowMenu(row, more);
        });
        more.classList.add('more');
        more.setAttribute('aria-label', `Options pour ${row.name}`);
        actions.append(more);
      }
    } else {
      actions.append(button('Préparer', () => {
        $('staff-name').value = row.name || '';
        const match = teamRoles.find(role => role.game === row.oldGroup);
        const choice = match && [...$('staff-role').options].find(option => option.value === match.id);
        if (choice) $('staff-role').value = choice.value;
        $('staff-form').scrollIntoView({ block: 'center' });
        $('staff-name').focus();
      }));
      actions.append(confirmButton('Retirer', () => run(() => post('/api/staff/forget', { robloxId: row.id }), `${row.name || row.id} n'est plus sur la liste`)));
    }
    tr.append(actions);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const box = el('div', 'table-scroll');
  box.append(table);

  const unknown = el('div');
  if (teamState.unknown.length) {
    unknown.append(el('h3', 'subtitle', 'Ils ont un rôle Discord, mais on connaît pas leur Roblox'));
    for (const person of teamState.unknown) {
      const line = el('p', 'muted unknown-row');
      const pseudo = el('strong', '', person.name);
      const personColor = readableColor(person.color);
      if (personColor) pseudo.style.color = personColor;
      line.append(memberPicture(person.avatar), pseudo);
      if (person.hasPin) line.append(lockIcon());
      line.append(` · ${person.role || ''} · ${formatNumber(person.discordTickets)} tickets Discord`);
      unknown.append(line);
    }
    unknown.append(el('p', 'muted note', 'Il leur faut juste un /verify pour que leur activité apparaisse'));
  }
  $('mods-list').replaceChildren(box, unknown);
}

async function loadTeam() {
  // Only the content creators (Gérant Vidéaste): the team itself stays hidden
  const creatorsOnly = !can('team.view');
  for (const id of ['mods-panel', 'staff', 'former-panel']) $(id).hidden = creatorsOnly;
  $('rankups-panel').hidden = creatorsOnly || !can('team.rankups');
  if (creatorsOnly) {
    renderCreators(await getJson('/api/staff'));
    return;
  }
  if (can('team.rankups')) loadRankups().catch(err => { $('rankups-body').replaceChildren(el('p', 'muted', err.message)); });
  const [staff, mods] = await Promise.all([getJson('/api/staff'), getJson('/api/mods')]);
  teamRoles = mods.roles;
  const editable = new Map(staff.members.map(member => [member.id, member.canEdit]));
  teamState.rows = mods.rows.map(row => ({ ...row, canManage: editable.get(row.id) === true }));
  teamState.unknown = mods.unknown;
  teamState.roles = staff.roles;
  const select = $('staff-role');
  const kept = select.value;
  // Nothing chosen by default: the first rank of the list is the highest one
  select.replaceChildren(new Option('Choisis un rang', ''), ...staff.roles.map(role => new Option(role.name, role.id)));
  if (kept) select.value = kept;
  renderMods();
  renderFormer(staff.former || [], staff.canEditFormer);
  renderCreators(staff);
}

function renderCreators(staff) {
  if (staff.canSetCreators) {
    const creators = staff.members.filter(member => member.creator);
    $('creator-list').replaceChildren(...creators.map(member => {
      const row = el('div', 'member');
      const info = el('div', 'member-info');
      info.append(el('strong', '', member.name), el('small', '', 'Freecam autorisée, Monteur Vidéo sur Discord'));
      const actions = el('div', 'member-actions');
      actions.append(confirmButton('Retirer', () => run(() => post('/api/creators', { name: member.name, value: false }), `${member.name} n'a plus la freecam`)));
      row.append(info, actions);
      return row;
    }));
    if (!creators.length) $('creator-list').textContent = "Personne pour l'instant ._.";
    $('creators').hidden = false;
  }
}

$('mods-search').addEventListener('input', event => { teamState.search = event.target.value; renderMods(); });
// Untick one to leave its time out of the 7 and 30 day columns (and of the ranking when sorted by them)
for (const [type, label] of [['free', 'Free Access'], ['custom', 'Serveur custom']]) {
  const box = input('checkbox', undefined, { checked: teamState.show[type] });
  box.addEventListener('change', () => { teamState.show[type] = box.checked; renderMods(); });
  const choice = el('label', `check server-filter ${type}`);
  choice.append(box, el('span', `server-swatch ${type}`), el('span', '', label));
  $('mods-filters').append(choice);
}
$('staff-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('staff-name').value.trim();
  await run(() => post('/api/staff', { name, roleId: $('staff-role').value, discordId: $('staff-discord').value.trim() || null }), answer => (answer.linked ? `${name} a bien reçu son rang et son compte est vérifié <3` : `${name} a bien reçu son rang`));
  $('staff-name').value = '';
  $('staff-discord').value = '';
});
$('creator-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = $('creator-name').value.trim();
  await run(() => post('/api/creators', { name, value: true, discordId: $('creator-discord').value.trim() }), `${name} est maintenant créateur de contenu, avec le rôle Monteur Vidéo <3`);
  $('creator-name').value = '';
  $('creator-discord').value = '';
});

// ---------------------------------------------------------------- economy: what the players own, trade and gain
// span: the period of the Échanges and Ajoutés columns, picked with 24 h / 7 j / 30 j above the table
// changed: while the table is drawn after a live refresh, the cells that moved ("kind\0name" -> {total: 'up'...})
// The table shows the lines by packets of ECON_PAGE: the whole list is more than 480 lines, nobody reads them all
const ECON_PAGE = 50;
const ECON_MAX = 500; // the table never holds more than this, even after many clicks
const econState = { search: '', span: 'day', sort: 'total', desc: true, icons: {}, changed: null, limit: ECON_PAGE };
// /economie/public opened without being logged in (or without the permission): only this page, the main game's numbers
let publicEconomy = false;
const econApi = (path, query) => (publicEconomy ? `/api/public/economy${path}${query ? `?${query}` : ''}` : `/api/economy${path}?${query}`);
const ECON_SINCE = 'Seuls les joueurs qui se sont connectés depuis le 11 novembre 2026 sont comptés.';
const ECON_SINCE_SHORT = 'connectés depuis le 11 novembre 2026';
// The periods start again at midnight (Paris): a new day, a new week (Monday), a new month
const ECON_SPANS = [['day', "Aujourd'hui"], ['week', 'Cette semaine'], ['month', 'Ce mois-ci']];
const ECON_SPAN_TEXT = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois-ci' };
// Live money: every change is shown at the time it happened in game plus ECON_DELAY, always the same delay, so the
// gaps between two changes are the real ones. The delay covers the way here: the game looks at the money every 1 s
// and sends every 5 s, then this page asks every ECON_REFRESH (1 + 5 + 3 s, and some margin for the network)
const ECON_DELAY = 15000;
const ECON_REFRESH = 3000;
const ECON_SHOW_EVERY = 200; // how often the page looks for changes whose time has come
const ECON_ROWS_EVERY = 10; // the table every 10th ask (30 s, the public page's numbers are kept 30 s)

// A money value rolls from what's shown to its new number. live: a glow, and the difference floats up in the corner
// of box (none without box); a newer one replaces it
// A label that appears in a tile, rises at a steady speed and fades. Each one always appears at the same place of
// its tile; the earlier ones are already higher when the next comes, so several show at once and none is moved by
// another. A label never changes once it's shown: a number that comes before the last label has risen by
// ECON_LABEL_SPACE of its height (it would sit on it) waits for that moment, and only what comes during that wait
// joins it, and only with the same sign: a gain and a loss never merge (at most one of each waits, the second shows
// one gap after the first). value + render(value) -> [class, text]; max: past it the oldest leaves
const ECON_LABEL_SPACE = 0.95; // the digits are about 0.7 of the font size: a little room between two labels
function labelGap(stack, label) {
  const style = getComputedStyle(stack);
  const rise = Math.abs(parseFloat(style.getPropertyValue('--rise'))) || 100; // px
  const life = parseFloat(style.getPropertyValue('--life')) || 1.6; // s
  const size = parseFloat(getComputedStyle(label).fontSize) || 15;
  return ((size * ECON_LABEL_SPACE) / (rise / life)) * 1000;
}
function floatLabel(box, kind, value, render, max) {
  let stack = box.querySelector(`:scope > .econ-stack-${kind}`);
  if (!stack) {
    stack = el('span', `econ-stack econ-stack-${kind}`);
    box.append(stack);
  }
  const show = shownValue => {
    const [className, text] = render(shownValue);
    const label = el('span', className, text);
    label.addEventListener('animationend', () => label.remove());
    stack.append(label);
    while (stack.children.length > max) stack.firstElementChild.remove();
    stack._shownAt = performance.now();
    if (!stack._gap) stack._gap = labelGap(stack, label);
  };
  if (typeof value !== 'number') { show(value); return; }
  const waiting = (stack._waiting ||= []);
  const same = waiting.find(entry => Math.sign(entry.value) === Math.sign(value));
  if (same) { same.value += value; return; }
  const wait = (stack._shownAt ?? -Infinity) + (stack._gap || 0) - performance.now();
  if (!waiting.length && wait <= 0) { show(value); return; }
  waiting.push({ value });
  if (waiting.length > 1) return; // shows after the one already waiting
  const next = () => {
    const entry = waiting.shift();
    if (stack.isConnected && Math.round(entry.value) !== 0) show(entry.value);
    if (waiting.length) setTimeout(next, stack._gap || 0);
  };
  setTimeout(next, Math.max(0, wait));
}

function rollMoney(box, node, to, format, live, spend = false) {
  const from = node._money ?? 0;
  // The label says how much the number changed: from its last target, not from where the roll is right now (a
  // change during the first count-up from 0 isn't "+45 000 000")
  const before = node._target ?? from;
  node._target = to;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (node._roll) cancelAnimationFrame(node._roll);
  if (live && !still && Math.round(to - before) !== 0) {
    if (box) {
      const diff = to - before;
      // spend: money going out, a rise of it is shown red with a minus
      floatLabel(box, 'delta', diff, value => [`econ-delta ${(value > 0) !== spend ? 'econ-up' : 'econ-down'}`, `${signedNumber(spend ? -value : value)} €`], 4);
    }
    node.classList.remove('econ-bump');
    void node.offsetWidth; // restarts the glow
    node.classList.add('econ-bump');
  }
  if (still || Math.round(to) === Math.round(from)) {
    node._money = to;
    node.textContent = format(to);
    return;
  }
  const duration = live ? 600 : 1400;
  const start = performance.now();
  const step = time => {
    const t = Math.min(1, (time - start) / duration);
    const eased = live ? (1 - Math.cos(Math.PI * t)) / 2 : 1 - (1 - t) ** 3;
    node._money = from + (to - from) * eased;
    node.textContent = format(node._money);
    node._roll = t < 1 ? requestAnimationFrame(step) : null;
  };
  node._roll = requestAnimationFrame(step);
}

const signedNumber = value => {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${formatNumber(rounded)}`;
};
const signClass = value => (Math.round(value) > 0 ? 'econ-up' : Math.round(value) < 0 ? 'econ-down' : 'muted');

function econPicture(name, images) {
  const picture = el('div', 'gestion-tag-picture');
  const url = econState.icons[images[name]];
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    picture.append(img);
  }
  return picture;
}

// Pictures of the nametags, 20 at a time like the Gestion. Missing ones stay without a picture
async function loadEconIcons(ids) {
  const wanted = [...new Set(ids)].filter(id => id && !(id in econState.icons));
  for (let i = 0; i < wanted.length; i += 20) {
    const part = wanted.slice(i, i + 20);
    try {
      Object.assign(econState.icons, await getJson(econApi('/icons', `ids=${part.join(',')}`)));
    } catch { /* the names are enough */ }
    for (const id of part) if (!(id in econState.icons)) econState.icons[id] = null;
  }
  return wanted.length > 0;
}

// "Comptes ignorés": the ranks and the players that never count in the economy (they give themselves items)
function econIgnoredSection() {
  const box = el('details', 'econ-ignored');
  box.append(el('summary', '', 'Comptes ignorés'));
  const body = el('div', 'econ-ignored-body', 'Ça charge...');
  box.append(body);
  let loaded = false;
  function render(data) {
    const roleChecks = [];
    const rolesBox = el('div', 'econ-ignored-roles');
    for (const role of data.roles) {
      const check = input('checkbox', undefined, { checked: data.ignoredRoles.includes(role.id) });
      check.dataset.role = role.id;
      const wrap = el('label', 'check', role.name);
      wrap.prepend(check);
      rolesBox.append(wrap);
      roleChecks.push(check);
    }
    let players = data.players.slice();
    const list = el('div', 'gestion-chips');
    const drawPlayers = () => {
      list.replaceChildren(...players.map(player => {
        const chip_ = el('span', 'econ-ignored-player', `${player.name} (${player.id})`);
        const remove = el('button', 'econ-ignored-remove', '×');
        remove.type = 'button';
        remove.setAttribute('aria-label', `Retirer ${player.name}`);
        remove.addEventListener('click', () => { players = players.filter(other => other.id !== player.id); drawPlayers(); });
        chip_.append(remove);
        return chip_;
      }));
      if (!players.length) list.append(el('span', 'muted', 'Aucun joueur'));
    };
    drawPlayers();
    const add = input('text', '', { autocomplete: 'off', placeholder: 'Pseudo ou ID Roblox' });
    const addBox = el('label', 'search', 'Ajouter un joueur');
    addBox.append(add);
    const save = button('Enregistrer', async () => {
      save.disabled = true;
      try {
        const answer = await post('/api/economy/ignored', {
          roles: roleChecks.filter(check => check.checked).map(check => check.dataset.role),
          players: players.map(player => player.id),
          add: add.value,
        });
        notify('Comptes ignorés enregistrés');
        render(answer);
      } catch (err) {
        notify(err.message, 'error');
      }
      save.disabled = false;
    });
    body.replaceChildren(
      el('p', 'muted', "Ces comptes ne comptent pas : ni leur argent, ni leurs objets, ni leurs nametags. Un compte ignoré sort des chiffres dès l'enregistrement ; un compte qui ne l'est plus revient à sa prochaine sauvegarde en jeu."),
      el('h3', 'subtitle', 'Rangs staff'), rolesBox,
      el('h3', 'subtitle', 'Joueurs'), list, addBox, save,
    );
  }
  box.addEventListener('toggle', async () => {
    if (!box.open || loaded) return;
    loaded = true;
    try { render(await getJson('/api/economy/ignored')); } catch (err) { body.textContent = err.message; loaded = false; }
  });
  return box;
}

async function loadEconomy() {
  const env = tabEnv.economy;
  const data = await getJson(publicEconomy ? econApi('', '') : econApi('', `env=${env}`));
  if (currentTab !== 'economy' || tabEnv.economy !== env) return;
  const root = $('economy-body');

  if (!data.players && !data.rows.length) {
    root.replaceChildren(el('p', 'muted', `Aucun chiffre pour l'instant. Les chiffres arrivent dès que les joueurs se connectent avec la nouvelle version du jeu. ${ECON_SINCE}`));
    return;
  }

  // At the top: the period (24 h / 7 j / 30 j), used by the added money and the table's Échanges / Ajoutés columns
  const top = el('div', 'controls econ-status');
  const filters = el('div', 'segment econ-spans');
  const live = el('div', 'econ-live-line');
  // Next to "En direct": how many people have this page open (the server counts who asks for the live money)
  const viewersLabel = el('span', 'econ-viewers');
  const showViewers = count => {
    const text = !count ? '' : publicEconomy
      ? `${formatNumber(count)} visiteur${count > 1 ? 's' : ''} sur la page`
      : `${formatNumber(count)} ${count > 1 ? 'personnes' : 'personne'} sur la page`;
    if (viewersLabel.textContent !== text) viewersLabel.textContent = text; // only when it changes: it is read out loud
  };
  const liveLabel = el('span', 'econ-live', 'En direct');
  const liveHead = el('span', 'econ-live-head');
  liveHead.append(liveLabel, viewersLabel);
  // The note in red with a warning triangle on its left
  const since = el('span', 'econ-since');
  const warn = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  warn.setAttribute('viewBox', '0 0 24 24');
  warn.setAttribute('class', 'econ-since-icon');
  warn.setAttribute('aria-hidden', 'true');
  const warnPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  warnPath.setAttribute('d', 'M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z');
  warn.append(warnPath);
  since.append(warn, el('span', '', ECON_SINCE));
  // The note is a strip of its own: it says what is counted, it is not part of the live line
  const notice = el('div', 'econ-notice');
  notice.append(since);
  live.append(liveHead);
  // On the public page the live line goes next to the title, in the hero; inside the dashboard it stays on top
  (publicEconomy ? $('pub-status') : top).append(live);

  // Money: what the players hold now, and what came in over the period: net, with what was gained and what was spent.
  // The added money's tile goes down beside the search (econ-head).
  // Live: each change of the money is shown when its time (event[8], the game's or the arrival's) plus ECON_DELAY has
  // come, on the server's clock. latest: the server's numbers at the last ask; queue: the changes not shown yet;
  // what's on screen is always latest minus the queue, so it can't drift
  const liveUrl = query => (publicEconomy ? econApi('', query) : econApi('', `env=${env}&${query}`));
  const moving = events => (Array.isArray(events) ? events : []).filter(event => Math.round(event[2]) || Math.round(event[3]) || event[4] || event[5]);
  let latest = structuredClone(data.cash);
  let liveSeq = Number.isFinite(data.liveSeq) ? data.liveSeq : null;
  const queue = [];
  const when = event => event[8] ?? event[1];
  const enqueue = events => {
    queue.push(...moving(events));
    queue.sort((a, b) => when(a) - when(b));
  };
  // The server's clock, from its last answer (this computer's can be off)
  let clockOffset = 0;
  const serverNow = () => Date.now() + clockOffset;
  const readClock = answer => { if (Number.isFinite(answer.now)) clockOffset = answer.now - Date.now(); };
  const backQuery = `part=cash&back=${Math.ceil(ECON_DELAY / 1000) + 2}`; // the changes not due yet
  try {
    const first = await getJson(liveUrl(backQuery));
    readClock(first);
    if (currentTab !== 'economy' || tabEnv.economy !== env) return;
    if (first.cash) {
      latest = first.cash;
      liveSeq = first.seq;
      enqueue(first.events);
      showViewers(first.viewers);
    }
  } catch { /* starts from the page's numbers, without a buffer */ }
  const sum = (list, index) => list.reduce((total, event) => total + event[index], 0);
  // latest without the changes still waiting (per period: only those inside it)
  function behind() {
    const next = structuredClone(latest);
    next.total = Math.max(0, latest.total - sum(queue, 2));
    for (const span of Object.keys(latest.added)) {
      const start = ((latest.windowStart && latest.windowStart[span]) || 0) * 1000;
      const rest = queue.filter(event => when(event) >= start);
      next.added[span] = ((latest.added && latest.added[span]) || 0) - sum(rest, 3);
      next.gained[span] = Math.max(0, ((latest.gained && latest.gained[span]) || 0) - sum(rest, 4));
      next.spent[span] = Math.max(0, ((latest.spent && latest.spent[span]) || 0) - sum(rest, 5));
    }
    return next;
  }
  let shown = behind();
  // The three key numbers side by side: what is in circulation, what was added over the period, how many players
  const tiles = el('div', 'econ-kpis');
  const held = tile('Argent en circulation', '0 €');
  held.classList.add('econ-held');
  held.append(el('span', 'muted tile-detail', "L'argent que les joueurs ont sur eux"));
  const added = tile('Argent ajouté', '0 €');
  added.classList.add('econ-added');
  const playersCard = tile('Joueurs comptés', formatNumber(data.players || 0));
  playersCard.classList.add('econ-players');
  playersCard.append(el('span', 'muted tile-detail', ECON_SINCE_SHORT));
  tiles.append(held, added, playersCard);

  // "Mis à jour il y a X s": how old the numbers on screen are. It ticks on its own so the visitor knows
  // the page is really following the game and not frozen
  const updatedLabel = $('pub-updated');
  const footNote = $('pub-foot-note');
  let lastUpdate = data.lastAt ? data.lastAt * 1000 : Date.now();
  const updateAge = () => {
    const seconds = Math.max(0, Math.round((serverNow() - lastUpdate) / 1000));
    if (updatedLabel) updatedLabel.textContent = seconds < 10 ? 'Mis à jour à l’instant' : seconds < 60 ? `Mis à jour il y a ${seconds} s` : `Mis à jour il y a ${Math.floor(seconds / 60)} min`;
    if (footNote) footNote.textContent = `Chiffres sauvegardés en jeu · dernière mise à jour ${new Date(lastUpdate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  };
  const ageTicker = setInterval(() => { if (!tiles.isConnected) { clearInterval(ageTicker); return; } updateAge(); }, 1000);
  updateAge();
  const heldValue = held.querySelector('.tile-value');
  const addedValue = added.querySelector('.tile-value');
  const addedLabel = added.querySelector('.tile-label');
  // Gained / spent under the net: a bar of their share and both amounts
  const flow = el('div', 'econ-flow');
  const flowBar = el('div', 'econ-flow-bar');
  const flowIn = el('span', 'econ-flow-in');
  flowBar.append(flowIn);
  // Gained and spent side by side, each with its own number floating up
  const flowStat = (cls, label) => {
    const box = el('div', `econ-flow-stat ${cls}`);
    const value = el('strong', '', '0 €');
    box.append(el('span', 'muted', label), value);
    return [box, value];
  };
  const [gainedBox, gainedValue] = flowStat('econ-flow-gained', '▲ Gagné');
  const [spentBox, spentValue] = flowStat('econ-flow-spent', '▼ Dépensé');
  const flowStats = el('div', 'econ-flow-stats');
  flowStats.append(gainedBox, spentBox);
  flow.append(flowBar, flowStats);
  added.append(flow);
  const euros = value => `${formatNumber(Math.round(value))} €`;
  const signedEuros = value => `${signedNumber(value)} €`;
  const amount = (values, span) => (values && values[span]) || 0;

  // taken: the changes this step shows. A new player counted (first save: [7]) is said under the circulation, apart
  // from the number in the corner (the rest of the step)
  function showMoney(live, taken = []) {
    const span = econState.span;
    const moves = live && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const newcomers = taken.filter(event => event[7]);
    const newCash = sum(newcomers, 2);
    const rest = shown.total - (heldValue._target ?? shown.total) - newCash; // from the last target, see rollMoney
    if (moves) {
      // Gains and losses of the same moment get their own labels, never one net number. Money only passed between
      // players (a trade, a payment: neither gained [4] nor spent [5]) gets no label: only the tax, its own change.
      // The changes taken make up rest; when they don't (the queue was reset), the net rest alone
      const heldLabel = value => floatLabel(held, 'delta', value, part => [`econ-delta ${part > 0 ? 'econ-up' : 'econ-down'}`, `${signedNumber(part)} €`], 6);
      const others = taken.filter(event => !event[7]);
      const passed = event => !event[4] && !event[5];
      const shownParts = others.filter(event => !passed(event));
      const passedSum = others.filter(passed).reduce((total, event) => total + event[2], 0);
      const ups = shownParts.reduce((total, event) => total + Math.max(0, event[2]), 0);
      const downs = shownParts.reduce((total, event) => total + Math.min(0, event[2]), 0);
      if (Math.abs(ups + downs + passedSum - rest) < 1) {
        if (Math.round(ups)) heldLabel(ups);
        if (Math.round(downs)) heldLabel(downs);
      } else if (Math.round(rest)) heldLabel(rest);
      if (Math.round(newCash)) {
        const players = newcomers.filter(event => event[7] === 1).length;
        floatLabel(held, 'new', null, () => ['econ-new', `${players > 1 ? `${players} nouveaux joueurs comptés` : 'Nouveau joueur compté'} : +${formatNumber(Math.round(newCash))} €`], 3);
      }
    }
    addedLabel.textContent = `Argent ajouté ${ECON_SPAN_TEXT[span]}`;
    rollMoney(null, heldValue, shown.total, euros, live);
    rollMoney(null, addedValue, amount(shown.added, span), signedEuros, live); // its badge: gained / spent below
    addedValue.classList.remove('econ-up', 'econ-down', 'muted');
    addedValue.classList.add(signClass(amount(shown.added, span)));
    const gained = amount(shown.gained, span);
    const spent = amount(shown.spent, span);
    rollMoney(gainedBox, gainedValue, gained, euros, live);
    rollMoney(spentBox, spentValue, spent, euros, live, true);
    flowIn.style.width = gained + spent > 0 ? `${(gained / (gained + spent)) * 100}%` : '50%';
  }
  showMoney(false);

  // Shows the changes whose time has come (several at the same moment: together)
  const ticker = setInterval(() => {
    if (!tiles.isConnected) { clearInterval(ticker); return; }
    if (document.hidden) return;
    const due = serverNow() - ECON_DELAY;
    let count = 0;
    while (count < queue.length && when(queue[count]) <= due) count++;
    const taken = queue.splice(0, count);
    const next = behind();
    const span = econState.span;
    const same = Math.round(next.total) === Math.round(shown.total)
      && ['added', 'gained', 'spent'].every(key => Math.round(amount(next[key], span)) === Math.round(amount(shown[key], span)));
    shown = next;
    if (!same) showMoney(true, taken);
  }, ECON_SHOW_EVERY);

  // The table again every ECON_ROWS_EVERY asks: the cells that changed flash green or red
  async function refreshRows() {
    const fresh = await getJson(publicEconomy ? econApi('', '') : econApi('', `env=${env}`));
    if (!tiles.isConnected || !Array.isArray(fresh.rows)) return;
    const span = econState.span;
    const before = new Map(data.rows.map(row => [`${row.kind}\u0000${row.name}`, row]));
    const changed = new Map();
    for (const row of fresh.rows) {
      const old = before.get(`${row.kind}\u0000${row.name}`);
      if (!old) continue;
      const marks = {};
      const mark = (key, a, b) => { if (Math.round(a) !== Math.round(b)) marks[key] = b > a ? 'up' : 'down'; };
      mark('total', old.total, row.total);
      mark('holders', old.holders, row.holders);
      mark('trades', old.trades[span], row.trades[span]);
      mark('added', old.added[span], row.added[span]);
      if (Object.keys(marks).length) changed.set(`${row.kind}\u0000${row.name}`, marks);
    }
    data.rows = fresh.rows;
    data.nametagImages = fresh.nametagImages;
    lastUpdate = serverNow();
    econState.changed = changed;
    fill();
    econState.changed = null;
    if (await loadEconIcons(Object.values(data.nametagImages || {})) && tiles.isConnected) fill();
  }

  // Asks: stop by themselves once this page is gone
  let asks = 0;
  async function ask() {
    if (!tiles.isConnected || currentTab !== 'economy' || tabEnv.economy !== env) {
      clearInterval(poll);
      return;
    }
    if (document.hidden) return;
    try {
      const fresh = await getJson(liveUrl(liveSeq === null ? backQuery : `part=cash&after=${liveSeq}`));
      if (!fresh.cash || !tiles.isConnected) return;
      readClock(fresh);
      lastUpdate = serverNow(); // the numbers on screen are as fresh as this answer
      // The dashboard restarted (seq went back): its changes are lost, straight to the numbers
      if (liveSeq !== null && fresh.seq < liveSeq) queue.length = 0;
      else enqueue(fresh.events);
      showViewers(fresh.viewers);
      latest = fresh.cash;
      liveSeq = fresh.seq;
      if (++asks % ECON_ROWS_EVERY === 0) await refreshRows();
    } catch { /* next time */ }
  }
  const poll = setInterval(ask, ECON_REFRESH);

  // Search
  const search = input('search', econState.search, { autocomplete: 'off', placeholder: 'Barre de chocolat...' });
  const searchBox = el('label', 'search', 'Chercher un objet ou un nametag');
  searchBox.append(search);
  for (const [key, label] of ECON_SPANS) {
    const option = el('button', key === econState.span ? 'segment-on' : '', label);
    option.type = 'button';
    option.setAttribute('aria-pressed', String(key === econState.span));
    option.addEventListener('click', () => {
      econState.span = key;
      for (const other of filters.children) {
        other.classList.toggle('segment-on', other === option);
        other.setAttribute('aria-pressed', String(other === option));
      }
      showMoney(false);
      fill();
    });
    filters.append(option);
  }

  // The table, sorted by a click on a column title (again: the other way)
  const columns = [
    ['name', 'Nom', row => row.name],
    ['kind', 'Type', row => row.kind],
    ['total', 'En circulation', row => row.total],
    ['holders', 'Joueurs qui en ont', row => row.holders],
    ['trades', 'Échanges', row => row.trades[econState.span]],
    ['added', 'Ajoutés', row => row.added[econState.span]],
  ];
  // On small screens the table turns into cards: the column titles are gone, so a select sorts the list
  const sortBox = el('div', 'econ-sort-box');
  const sortSelect = el('select', 'econ-sort-select');
  for (const [key, label] of columns) {
    const option = el('option', '', label);
    option.value = key;
    sortSelect.append(option);
  }
  const sortDir = el('button', 'button econ-sort-dir', econState.desc ? '▼' : '▲');
  sortDir.type = 'button';
  sortDir.setAttribute('aria-label', 'Inverser le tri');
  sortSelect.addEventListener('change', () => {
    econState.sort = sortSelect.value;
    econState.desc = econState.sort !== 'name' && econState.sort !== 'kind';
    fill();
  });
  sortDir.addEventListener('click', () => { econState.desc = !econState.desc; fill(); });
  sortBox.append(sortSelect, sortDir);

  const table = el('table', 'table econ-table');
  // The caption says what the table is: on small screens it is the only thing that says it
  const caption = el('caption', 'econ-caption', 'Ce que les joueurs de School FR détiennent, échangent et font tourner sur les serveurs');
  const thead = el('thead');
  const head = el('tr');
  thead.append(head);
  const tbody = el('tbody');
  table.append(caption, thead, tbody);
  const tableBox = el('div', 'table-scroll econ-table-box');
  tableBox.append(table);
  // Below the table: how many lines are shown, and the button that shows the next ones
  const more = el('div', 'econ-more');
  const moreText = el('p', 'muted');
  const moreButton = el('button', 'button', 'Afficher plus');
  moreButton.type = 'button';
  moreButton.addEventListener('click', () => { econState.limit = Math.min(econState.limit + ECON_PAGE, ECON_MAX); fill(); });
  more.append(moreText, moreButton);
  // The number of lines found, next to the search
  const countLabel = el('span', 'econ-count muted');

  function renderHead() {
    head.replaceChildren(...columns.map(([key, label]) => {
      const th = el('th', key === 'name' || key === 'kind' ? '' : 'num');
      th.scope = 'col';
      const sorted = econState.sort === key;
      th.setAttribute('aria-sort', sorted ? (econState.desc ? 'descending' : 'ascending') : 'none');
      const pick = el('button', 'econ-sort', `${label}${sorted ? (econState.desc ? ' ▼' : ' ▲') : ''}`);
      pick.type = 'button';
      pick.setAttribute('aria-label', `Trier par ${label}`);
      pick.addEventListener('click', () => {
        if (econState.sort === key) econState.desc = !econState.desc;
        else {
          econState.sort = key;
          econState.desc = key !== 'name' && key !== 'kind'; // numbers: biggest first, names: A to Z
        }
        fill();
      });
      th.append(pick);
      return th;
    }));
    // The small screens sort with the select, it follows the same column
    sortSelect.value = econState.sort;
    sortDir.textContent = econState.desc ? '▼' : '▲';
    sortDir.setAttribute('aria-label', econState.desc ? 'Trier du plus grand au plus petit' : 'Trier du plus petit au plus grand');
  }

  function tradeCell(row, span) {
    const cell = el('td', 'num');
    cell.dataset.label = 'Échanges';
    // The number and the quantity traded go together: on a phone they stay in the same block
    const content = el('span', 'econ-cell-value', formatNumber(row.trades[span]));
    const quantity = Math.round(row.traded[span]);
    if (row.trades[span] && quantity !== row.trades[span]) content.append(el('small', 'muted econ-sub', `${formatNumber(quantity)} échangés`));
    cell.append(content);
    return cell;
  }

  function fill() {
    econState.search = search.value;
    const word = search.value.trim().toLowerCase();
    const value = columns.find(([key]) => key === econState.sort)?.[2] || (row => row.total);
    const rows = data.rows
      .filter(row => !word || row.name.toLowerCase().includes(word))
      .sort((a, b) => {
        const x = value(a);
        const y = value(b);
        const order = typeof x === 'string' ? x.localeCompare(y, 'fr') : x - y;
        return (econState.desc ? -order : order) || a.name.localeCompare(b.name, 'fr');
      });
    renderHead();
    // Only the first lines are in the table: the list is long, the rest comes with the button
    const limit = Math.min(econState.limit, rows.length);
    tbody.replaceChildren(...rows.slice(0, limit).map(row => {
      const tr = el('tr');
      const nameCell = el('td');
      nameCell.dataset.label = 'Nom';
      const name = el('div', 'econ-name');
      if (row.kind === 'nametag') name.append(econPicture(row.name, data.nametagImages || {}));
      name.append(el('span', '', row.name));
      nameCell.append(name);
      const span = econState.span;
      const kindCell = el('td', '', row.kind === 'nametag' ? 'Nametag' : 'Objet');
      kindCell.dataset.label = 'Type';
      const totalCell = el('td', 'num', formatNumber(Math.round(row.total)));
      totalCell.dataset.label = 'En circulation';
      const holdersCell = el('td', 'num', formatNumber(row.holders));
      holdersCell.dataset.label = 'Joueurs qui en ont';
      const addedCell = el('td', `num ${signClass(row.added[span])}`, signedNumber(row.added[span]));
      addedCell.dataset.label = 'Ajoutés';
      tr.append(nameCell, kindCell, totalCell, holdersCell, tradeCell(row, span), addedCell);
      const marks = econState.changed?.get(`${row.kind}\u0000${row.name}`);
      if (marks) {
        ['total', 'holders', 'trades', 'added'].forEach((key, i) => {
          if (marks[key]) tr.children[i + 2].classList.add(`econ-flash-${marks[key]}`);
        });
      }
      return tr;
    }));
    if (!rows.length) {
      const empty = el('td', 'muted', 'Rien ici');
      empty.colSpan = columns.length;
      const tr = el('tr');
      tr.append(empty);
      tbody.append(tr);
    }
    countLabel.textContent = rows.length ? `${formatNumber(rows.length)} ${rows.length > 1 ? 'lignes' : 'ligne'}` : 'Aucun résultat';
    const left = rows.length - limit;
    moreText.textContent = left > 0 ? `${formatNumber(limit)} lignes affichées sur ${formatNumber(rows.length)}` : '';
    moreButton.hidden = left <= 0;
    moreButton.textContent = `Afficher ${formatNumber(Math.min(ECON_PAGE, left))} de plus`;
  }
  // The search is not filtered at every letter: the table is drawn again after a short pause
  let searchTimer = 0;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { econState.limit = ECON_PAGE; fill(); }, 120);
  });
  fill();

  // The toolbar: the period, the search, the sort (small screens) and the number of lines found
  const toolbar = el('div', 'econ-toolbar');
  toolbar.append(filters, searchBox, sortBox, countLabel);
  // The panel: the note, the numbers, the toolbar and the table. On the public page the live line is in the hero
  root.replaceChildren(...(publicEconomy
    ? [notice, tiles, toolbar, tableBox, more]
    : [top, notice, tiles, toolbar, tableBox, more]));
  if (!publicEconomy && can('economy.edit')) root.append(econIgnoredSection());
  if (await loadEconIcons(Object.values(data.nametagImages || {})) && currentTab === 'economy' && tabEnv.economy === env) fill();
}

// ---------------------------------------------------------------- anticheat
const acState = { hours: 24, code: null };
const MODE_LABELS = { kick: 'Kick', correct: 'Juste corriger', log: 'Juste regarder', off: 'Désactivé', ban: 'Ban' };
const HIST_LABELS = {
  speed: 'Vitesse réelle / limite',
  rise: 'Montée réelle / limite',
  gap: 'Temps entre deux positions (s)',
  hover: 'Temps en l’air sans tomber (s)',
};

function barChart(series, bucketSeconds, hours) {
  const box = el('div', 'bars');
  const now = Math.floor(Date.now() / 1000);
  const first = Math.floor((now - hours * 3600) / bucketSeconds) * bucketSeconds;
  const values = new Map(series.map(point => [point.t, point.total]));
  const highest = Math.max(1, ...series.map(point => point.total));
  for (let t = first; t <= now; t += bucketSeconds) {
    const total = values.get(t) || 0;
    const slot = el('div', 'bar-slot');
    const bar = el('div', 'bar');
    bar.style.height = `${total ? Math.max(4, (total / highest) * 100) : 0}%`;
    slot.append(bar);
    addTip(slot, `${bucketSeconds === 3600 ? formatDateTime(t) : new Date(t * 1000).toLocaleDateString('fr-FR')} : ${formatNumber(total)}`);
    box.append(slot);
  }
  return box;
}

function histogram(name, buckets) {
  const entries = Object.entries(buckets).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const highest = Math.max(1, ...entries.map(([, value]) => value));
  const box = el('div', 'hist');
  box.append(el('strong', 'hist-title', name));
  for (const [bucket, value] of entries) {
    const row = el('div', 'hist-row');
    const track = el('div', 'hist-track');
    const fill = el('div', 'hist-fill');
    fill.style.width = `${(value / highest) * 100}%`;
    track.append(fill);
    row.append(el('span', 'muted', bucket), track, el('span', 'muted num', `${((value * 100) / total).toFixed(1)} %`));
    box.append(row);
  }
  return box;
}

function actionDetail(action) {
  const box = el('details', 'action');
  const verb = action.applied ? (action.action === 'ban' ? 'Ban' : 'Kick') : 'Stoppé par les réglages';
  box.append(el('summary', '', `${formatDateTime(action.at)} · ${action.name || action.roblox_id} · ${action.label} · ${verb}`));
  const facts = el('dl', 'facts');
  const add = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    facts.append(el('dt', 'muted', label), el('dd', '', String(value)));
  };
  const ctx = action.ctx || {};
  add('Mesuré', action.value);
  add('Ping', action.ping !== null ? `${Math.round(action.ping)} ms` : null);
  add('Appareil', action.device);
  add('VR', action.vr ? 'oui' : 'non');
  add('Kicks avant', action.previous);
  add('Revenu', action.rejoined_at ? `après ${formatDuration(action.rejoined_at - action.at)}` : 'pas encore');
  add('En jeu depuis', ctx.session != null ? formatDuration(ctx.session) : null);
  add('Âge du compte', ctx.age != null ? `${ctx.age} jours` : null);
  add('État', ctx.state);
  add('Assis', ctx.seated ? 'oui' : 'non');
  add('Équipe', ctx.team);
  add('En main', ctx.tool);
  add('Faim', ctx.food);
  add('Effet de vitesse', ctx.effect);
  add('Vitesse (studs/s)', ctx.speed);
  add('Position', ctx.pos ? ctx.pos.map(Math.round).join(', ') : null);
  add('Version', action.place_version);
  box.append(facts);
  if (action.timeline?.length) {
    box.append(el('strong', 'subtitle', 'Ce qui s\'est passé juste avant'));
    const list = el('ol', 'timeline');
    for (const step of action.timeline) {
      const parts = [`−${Math.max(0, Math.round(step.ago))} s`, step.code, step.kind];
      for (const key of ['value', 'limit', 'credit', 'dt', 'ping']) if (step[key] !== undefined) parts.push(`${key} ${step[key]}`);
      list.append(el('li', '', parts.join(' · ')));
    }
    box.append(list);
  }
  return box;
}

async function saveAc(changes, message) {
  try {
    await post('/api/ac/config', changes);
    notify(message);
    await loadAnticheat();
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function loadAnticheat() {
  const query = `env=${tabEnv.anticheat}&hours=${acState.hours}`;
  const [data, actions] = await Promise.all([getJson(`/api/ac/summary?${query}`), getJson(`/api/ac/actions?${query}${acState.code ? `&code=${encodeURIComponent(acState.code)}` : ''}`)]);
  const root = $('ac-body');

  const observe = button(data.config.observe ? 'Remettre les sanctions' : 'Stop, plus aucune sanction', () => saveAc({ observe: !data.config.observe }, data.config.observe ? 'Les sanctions sont de retour' : 'Plus aucune sanction, on regarde juste ce qui se passe'), !data.config.observe);
  const status = el('div', 'ac-status');
  status.append(el('strong', data.config.observe ? 'warning-text' : '', data.config.observe ? "⚠ Mode observation : personne n'est sanctionné" : 'Sanctions activées'), el('span', 'muted', `Réglages n°${data.config.version}`), observe);

  const filters = el('div', 'controls');
  const ranges = el('div', 'segment');
  for (const [hours, label] of [[1, '1 h'], [24, '24 h'], [168, '7 j'], [720, '30 j']]) {
    const choice = el('button', hours === acState.hours ? 'segment-on' : '', label);
    choice.type = 'button';
    choice.addEventListener('click', () => { acState.hours = hours; loadAnticheat(); });
    ranges.append(choice);
  }
  filters.append(ranges);

  const exposure = data.exposure;
  const totals = data.codes.reduce((sum, code) => ({ kicks: sum.kicks + code.kicks, bans: sum.bans + code.bans, corrections: sum.corrections + code.corrections }), { kicks: 0, bans: 0, corrections: 0 });
  const tiles = el('div', 'tiles');
  tiles.append(
    tile('Heures de jeu vues', formatNumber(Math.round(exposure.playerHours)), `${formatNumber(exposure.servers)} serveurs, ${formatNumber(exposure.peak || 0)} joueurs au max`),
    tile('Kicks', formatNumber(totals.kicks), exposure.playerHours > 0 ? `${((totals.kicks * 1000) / exposure.playerHours).toFixed(1)} pour 1000 h de jeu` : ''),
    tile('Bans', formatNumber(totals.bans), 'Que sur des preuves'),
    tile('Corrections', formatNumber(totals.corrections), exposure.last ? `Dernier envoi : ${formatTime(exposure.last)}` : 'Rien reçu pour l\'instant'),
    tile('Ping moyen', exposure.ping ? `${Math.round(exposure.ping)} ms` : '–', exposure.fps ? `${Math.round(exposure.fps)} fps serveur` : ''),
  );

  const charts = el('div', 'ac-charts');
  const chartA = el('div'); chartA.append(el('h3', 'subtitle', 'Sanctions'), barChart(data.timeline, data.bucketSeconds, acState.hours));
  const chartB = el('div'); chartB.append(el('h3', 'subtitle', 'Corrections'), barChart(data.correctionsTimeline, data.bucketSeconds, acState.hours));
  charts.append(chartA, chartB);

  // Every check, with its numbers and its mode
  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Détection', 'Mode', 'Corrections', 'Joueurs', 'Sanctions', 'Stoppées', 'Pour 1000 h', 'Ping', 'VR', 'Revenus < 15 min', 'Appareils']) head.append(el('th', '', name));
  const thead = el('thead'); thead.append(head);
  const tbody = el('tbody');
  const stats = new Map(data.codes.map(code => [code.code, code]));
  const weight = code => { const row = stats.get(code); return row ? row.kicks + row.bans + row.wouldSanction + row.corrections : 0; };
  for (const code of Object.keys(data.codes_info).sort((a, b) => weight(b) - weight(a))) {
    const info = data.codes_info[code];
    const row = stats.get(code);
    const tr = el('tr');
    const nameCell = el('td');
    const pick = el('button', 'link-button', info.label);
    pick.type = 'button';
    pick.addEventListener('click', () => { acState.code = acState.code === code ? null : code; loadAnticheat(); });
    nameCell.append(pick);
    const modeCell = el('td');
    const select = el('select');
    select.setAttribute('aria-label', `Mode de ${info.label}`);
    for (const mode of info.modes) select.append(new Option(MODE_LABELS[mode], mode));
    select.value = data.config.modes[code] || info.modes[0];
    select.addEventListener('change', () => saveAc({ modes: { [code]: select.value } }, `${info.label} : ${MODE_LABELS[select.value]}`));
    modeCell.append(select);
    tr.append(nameCell, modeCell,
      el('td', 'num', row ? formatNumber(row.corrections) : '0'),
      el('td', 'num', row ? formatNumber(row.players) : '0'),
      el('td', 'num', row ? formatNumber(row.kicks + row.bans) : '0'),
      el('td', 'num', row ? formatNumber(row.wouldSanction) : '0'),
      el('td', 'num', row?.per1000 != null ? row.per1000.toFixed(1) : '–'),
      el('td', 'num', row?.ping != null ? `${Math.round(row.ping)} ms` : '–'),
      el('td', 'num', row?.vrShare != null ? `${Math.round(row.vrShare * 100)} %` : '–'),
      el('td', 'num', row?.rejoin != null ? `${Math.round(row.rejoin * 100)} %` : '–'),
      el('td', '', row ? Object.entries(row.devices).map(([device, total]) => `${device} ${total}`).join('  ') : ''));
    tbody.append(tr);
  }
  table.append(thead, tbody);
  const tableBox = el('div', 'table-scroll');
  tableBox.append(table);

  const values = el('form', 'form');
  for (const [key, spec] of Object.entries(data.values_info)) {
    const label = el('label', '', spec[3]);
    const input = el('input');
    input.type = 'number';
    input.step = 'any';
    input.min = spec[1];
    input.max = spec[2];
    input.name = key;
    input.value = data.config.values[key];
    label.append(input);
    values.append(label);
  }
  const submit = el('button', 'button', 'Envoyer aux serveurs');
  submit.type = 'submit';
  values.append(submit);
  values.addEventListener('submit', event => {
    event.preventDefault();
    const changes = {};
    for (const input of values.querySelectorAll('input')) changes[input.name] = Number(input.value);
    saveAc({ values: changes }, 'Réglages envoyés aux serveurs');
  });

  const hist = el('div', 'hists');
  for (const [name, buckets] of Object.entries(data.hist)) hist.append(histogram(HIST_LABELS[name] || name, buckets));

  const playerBox = el('div');
  const top = el('div', 'list');
  for (const player of data.topPlayers) {
    const row = el('div', 'member');
    const info = el('div', 'member-info');
    info.append(el('strong', '', player.name || String(player.id)), el('small', '', `${player.actions} sanctions, ${player.codes} détections différentes, dernière : ${formatDateTime(player.last)}`));
    const actionsBox = el('div', 'member-actions');
    actionsBox.append(button('Détails', async () => {
      const details = await getJson(`/api/ac/player?id=${player.id}`);
      playerBox.replaceChildren(el('h3', 'subtitle', player.name || String(player.id)), ...details.actions.map(actionDetail));
      playerBox.scrollIntoView({ block: 'nearest' });
    }));
    row.append(info, actionsBox);
    top.append(row);
  }
  if (!data.topPlayers.length) top.textContent = 'Personne de sanctionné ici ^^';

  const actionList = el('div', 'list');
  if (acState.code) {
    actionList.append(button(`Enlever le filtre : ${data.codes_info[acState.code]?.label || acState.code}`, () => { acState.code = null; loadAnticheat(); }));
  }
  actionList.append(...actions.actions.map(actionDetail));
  if (!actions.actions.length) actionList.append(el('p', 'muted', 'Aucune sanction sur cette période ^^'));

  const section = (title, ...children) => {
    const box = el('section', 'ac-section');
    box.append(el('h3', 'subtitle', title), ...children);
    return box;
  };
  root.replaceChildren(status, filters, tiles, charts,
    section('Détections', tableBox),
    section('Dernières sanctions', actionList),
    section('Les plus sanctionnés', top, playerBox),
    section('Ce qu\'on mesure en vrai', hist.childElementCount ? hist : el('p', 'muted', "Rien reçu pour l'instant ._.")),
    section('Réglages en direct', el('p', 'muted note', 'Ça part sur tous les serveurs en moins de 30 secondes, pas besoin de publier'), values));
}

// ---------------------------------------------------------------- shop
const SECTION_LABELS = { Event: 'Event', Perm: 'Permanent', Temp: 'Rotation du jour', Nametags: 'Nametags' };
const shopState = {
  section: 'Event', search: '', data: null, editing: null,
  // Nametag board: the form of a new nametag, the pack being renamed or created, the folded packs, the pictures, the card being dragged
  adding: false, packEditing: null, packCreating: false, collapsed: new Set(), tagSale: 'all', icons: {}, iconsGivenUp: 0, dragging: null,
  // Ctrl/Cmd+click: the nametags picked to be moved together, the last one clicked (start of a Shift+click range), each nametag's pack
  selected: new Set(), selectAnchor: null, tagPacks: {},
};

function field(label, control) {
  const box = el('label', '', label);
  box.append(control);
  return box;
}

function input(type, value, extra = {}) {
  const element = el('input');
  element.type = type;
  if (value !== undefined && value !== null) element.value = value;
  Object.assign(element, extra);
  return element;
}

function dataList(id, names) {
  const list = el('datalist');
  list.id = id;
  list.append(...names.map(name => new Option(name, name)));
  return list;
}

function basePriceText(item) {
  if (item.Currency === 'EventPoint') return `${formatNumber(item.Price)} points`;
  if (item.Currency) return `${formatNumber(item.Price)} ${item.Currency}`;
  if (item.Price > 1e9) return `Robux (produit ${item.Price})`;
  return `${formatNumber(item.Price)}€`;
}

function priceText(item) {
  if (!item.PriceStepEvery) return basePriceText(item);
  return `${basePriceText(item)}, +${item.PriceStepAdd || 1} tous les ${item.PriceStepEvery} achats`;
}

// The IDs of an animated nametag's frames, whatever the separators: "123, 456", one per line, rbxassetid://123, links...
const frameIds = text => (text.match(/\d{5,20}/g) || []).map(id => `rbxassetid://${id}`);

function shopForm() {
  const section = shopState.section;
  const nametag = section === 'Nametags';
  const editing = shopState.editing;
  const old = editing ? shopState.data.list[section][editing] : {};
  const form = el('form', 'form');

  const name = input('text', editing || '', { required: true, maxLength: 100, autocomplete: 'off', disabled: Boolean(editing) });
  if (!nametag) name.setAttribute('list', 'shop-tools');
  const price = input('number', old.Price ?? '', { required: true, min: 0, step: 1 });
  form.append(field(nametag ? 'Nom du nametag' : 'Objet', name), field(nametag ? 'Prix (ou ID du produit Robux)' : 'Prix', price));

  let kind; let currencyItem; let image; let display; let creator; let sale; let eventTag; let imageKind; let frames; let frameDelay;
  let textMode; let shade; let shadeTouched = false; let packSelect;
  if (nametag) {
    // A still image: one ID. Animated: the frames' IDs (as roblox-upload-gif prints them) and the time between two frames
    const wasAnimated = Array.isArray(old.Id);
    imageKind = el('select');
    imageKind.append(new Option('Image fixe', ''), new Option('Animé (plusieurs images)', 'animated'));
    imageKind.value = wasAnimated ? 'animated' : '';
    image = input('text', wasAnimated ? '' : (old.Id || ''), { maxLength: 200 });
    frames = el('textarea', 'afk-tips');
    frames.rows = 3;
    frames.placeholder = 'Les IDs des images dans l’ordre, séparés par des virgules ou un par ligne';
    frames.value = wasAnimated ? old.Id.map(id => String(id).replace('rbxassetid://', '')).join(', ') : '';
    frameDelay = input('number', old.FrameDelay ?? 0.1, { min: 0.01, max: 10, step: 0.01 });
    const frameCount = el('span', 'muted', '');
    const countFrames = () => { frameCount.textContent = `${frameIds(frames.value).length} images`; };
    frames.addEventListener('input', countFrames);
    countFrames();
    const imageBox = field('Image', image);
    const framesBox = field('Images du nametag animé', frames);
    framesBox.append(frameCount);
    framesBox.style.gridColumn = '1 / -1';
    const delayBox = field('Temps entre deux images (secondes)', frameDelay);
    const showKind = () => {
      const animated = imageKind.value === 'animated';
      imageBox.hidden = animated;
      framesBox.hidden = !animated;
      delayBox.hidden = !animated;
    };
    imageKind.addEventListener('change', showKind);
    showKind();
    display = input('text', old.DisplayName || '', { maxLength: 100 });
    creator = input('text', old.Creator || '', { maxLength: 100, placeholder: 'Proposé par Mr. Oreo, Dessiné par Mme. Diana...' });
    sale = input('checkbox', undefined, { checked: Boolean(old.IsSale) });
    const saleBox = el('label', 'check', 'En vente');
    saleBox.prepend(sale);
    eventTag = input('checkbox', undefined, { checked: Boolean(old.IsEvent) || (!editing && Boolean(shopState.presetEvent)) });
    shopState.presetEvent = false;
    const eventBox = el('label', 'check', "Nametag d'event (en haut de la boutique)");
    eventBox.prepend(eventTag);
    form.append(field("Type d'image", imageKind), imageBox, delayBox, framesBox, field('Nom affiché', display), field('Crédit (affiché tel quel)', creator), saleBox, eventBox);

    // How the game writes the name over the picture, and how dark the effect over the picture is
    textMode = el('select');
    textMode.append(new Option('Darkmode (pseudo en blanc)', ''), new Option('Whitemode (pseudo en noir)', 'White'));
    textMode.value = old.TextMode === 'White' ? 'White' : '';
    // A nametag from before the setting has no value: the game keeps its old tint, which looks like 30 %
    const legacyShade = Boolean(editing) && typeof old.Shade !== 'number';
    // A value with a decimal (set outside this form) keeps it: the slider would round it otherwise
    shade = input('range', undefined, { min: 0, max: 100, step: Number.isInteger(old.Shade ?? 0) ? 1 : 0.1 });
    shade.value = legacyShade ? LEGACY_SHADE : (old.Shade ?? 0);
    const shadeValue = el('output', 'num');
    const shadeRow = el('div', 'shade-row');
    shadeRow.append(shade, shadeValue);
    const shadeBox = field("Opacité de l'effet sombre", shadeRow);
    const shadeNote = el('small', 'field-note', "Ancien effet du jeu (pareil que 30 %) tant que tu ne touches pas au curseur");
    shadeNote.hidden = !legacyShade;
    shadeBox.append(shadeNote);
    const packs = shopState.data.list.Packs || {};
    packSelect = el('select');
    packSelect.append(new Option('Sans pack', ''), ...Object.keys(packs).sort((a, b) => packs[a].Order - packs[b].Order || a.localeCompare(b, 'fr')).map(pack => new Option(pack, pack)));
    packSelect.value = old.Pack && packs[old.Pack] ? old.Pack : '';
    // The name's own colour and how see-through it is, over this nametag (the game: Modules.NametagStyle)
    const nameColorOn = input('checkbox', undefined, { checked: Boolean(old.NameColor) });
    const nameColor = input('color', old.NameColor || '#ffffff');
    const nameColorRow = el('div', 'shade-row name-color-row');
    const nameColorCheck = el('label', 'check', 'Couleur à part');
    nameColorCheck.prepend(nameColorOn);
    nameColorRow.append(nameColorCheck, nameColor);
    const nameColorBox = el('div', 'field-box', 'Couleur du pseudo');
    nameColorBox.append(nameColorRow);
    const nameAlpha = input('range', undefined, { min: 0, max: 100, step: 1 });
    nameAlpha.value = old.NameTransparency ?? 0;
    const nameAlphaValue = el('output', 'num');
    const nameAlphaRow = el('div', 'shade-row');
    nameAlphaRow.append(nameAlpha, nameAlphaValue);
    form._nameLook = () => ({ NameColor: nameColorOn.checked ? nameColor.value : null, NameTransparency: Number(nameAlpha.value) || null });
    form._nameInputs = [nameColorOn, nameColor, nameAlpha, nameAlphaValue];
    form.append(field('Pseudo sur le nametag', textMode), nameColorBox, field('Transparence du pseudo', nameAlphaRow), shadeBox, field('Pack', packSelect));

    // The nametag as the game shows it, live while the settings move
    const preview = el('div', 'tag-preview');
    const picture = tagPicture('', 0);
    picture.append(el('span', 'tag-preview-name', 'M. Belmont'));
    preview.append(picture, el('small', 'muted', 'Aperçu'));
    const showLook = () => {
      picture.querySelector('.tag-shade').style.opacity = Number(shade.value) / 100;
      shadeValue.textContent = `${shade.value} %`;
      picture.classList.toggle('tag-white', textMode.value === 'White');
      const [nameColorOn, nameColor, nameAlpha, nameAlphaValue] = form._nameInputs;
      const previewName = picture.querySelector('.tag-preview-name');
      nameColor.disabled = !nameColorOn.checked;
      previewName.style.color = nameColorOn.checked ? nameColor.value : '';
      previewName.style.opacity = 1 - Number(nameAlpha.value) / 100;
      nameAlphaValue.textContent = `${nameAlpha.value} %`;
    };
    const showPicture = async () => {
      const id = imageKind.value === 'animated' ? tagImageId({ Id: frameIds(frames.value) }) : tagImageId({ Id: image.value });
      picture.dataset.icon = id;
      await loadShopIcons([id]);
      showShopIcons(preview);
    };
    let pictureTimer = null;
    const pictureSoon = () => { clearTimeout(pictureTimer); pictureTimer = setTimeout(showPicture, 500); };
    shade.addEventListener('input', () => { shadeTouched = true; shadeNote.hidden = true; showLook(); });
    textMode.addEventListener('change', showLook);
    for (const control of form._nameInputs.slice(0, 3)) control.addEventListener('input', showLook);
    image.addEventListener('input', pictureSoon);
    frames.addEventListener('input', pictureSoon);
    imageKind.addEventListener('change', showPicture);
    showLook();
    showPicture();
    form.prepend(preview);
  }
  kind = el('select');
  kind.append(new Option(nametag ? 'Argent ou Robux' : 'Argent', ''), new Option("Points d'event", 'EventPoint'), new Option('Un objet', 'item'));
  kind.value = !old.Currency ? '' : old.Currency === 'EventPoint' ? 'EventPoint' : 'item';
  currencyItem = input('text', old.Currency && old.Currency !== 'EventPoint' ? old.Currency : '', { maxLength: 100, autocomplete: 'off' });
  currencyItem.setAttribute('list', 'shop-tools');
  const itemBox = field('Quel objet ?', currencyItem);
  itemBox.hidden = kind.value !== 'item';
  kind.addEventListener('change', () => { itemBox.hidden = kind.value !== 'item'; });
  form.append(field('Se paye en', kind), itemBox);
  const stepEvery = input('number', old.PriceStepEvery ?? '', { min: 1, step: 1, placeholder: 'Vide : prix fixe' });
  const stepAdd = input('number', old.PriceStepAdd ?? 1, { min: 1, step: 1 });
  form.append(field('Le prix monte tous les X achats (tous serveurs)', stepEvery), field('Il monte de', stepAdd));
  const rarity = input('number', old.Rarity ?? 30, { min: 0, step: 1 });
  const desc = input('text', old.Desc || '', { maxLength: 500, autocomplete: 'off' });
  form.append(field('Rareté', rarity), field('Description', desc));

  const save = el('button', 'button', editing ? 'Valider' : 'Ajouter');
  save.type = 'submit';
  form.append(save);
  if (editing) {
    form.append(button('Annuler', () => { shopState.editing = null; shopState.adding = false; renderShop(); }));
    if (!nametag) {
      if (old.OffSale) form.append(button('Remettre en vente', () => shopAction('/api/shop/item', { section, name: editing, data: { OffSale: false } }, `${editing} est de nouveau en vente sur la version de test`)));
      else form.append(confirmButton('Mettre hors vente', () => shopAction('/api/shop/item/remove', { section, name: editing }, `${editing} est hors vente sur la version de test`)));
    }
  } else if (nametag) {
    form.append(button('Annuler', closeTagForm));
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const itemName = name.value.trim();
    const data = { Price: Number(price.value), Rarity: Number(rarity.value), Desc: desc.value };
    if (nametag) {
      Object.assign(data, { DisplayName: display.value, Creator: creator.value, IsSale: sale.checked, IsEvent: eventTag.checked });
      data.TextMode = textMode.value || null;
      Object.assign(data, form._nameLook());
      data.Pack = packSelect.value || null;
      // An older nametag keeps its old effect (no value) unless the slider was moved
      if (!editing || shadeTouched) data.Shade = Number(shade.value);
      if (imageKind.value === 'animated') {
        const ids = frameIds(frames.value);
        if (ids.length < 2) return notify('Il faut au moins 2 images pour un nametag animé', 'error');
        const delay = Number(frameDelay.value);
        if (!(delay >= 0.01 && delay <= 10)) return notify('Le temps entre deux images doit être entre 0.01 et 10 secondes', 'error');
        data.Id = ids;
        data.FrameDelay = delay;
      } else {
        data.Id = image.value.trim();
        data.FrameDelay = null;
      }
    }
    data.Currency = kind.value === 'item' ? currencyItem.value.trim() : kind.value;
    if (kind.value === 'item' && !data.Currency) return notify('Choisis avec quel objet ça se paye', 'error');
    data.PriceStepEvery = stepEvery.value ? Number(stepEvery.value) : null;
    data.PriceStepAdd = stepEvery.value ? Number(stepAdd.value) : null;
    shopAction('/api/shop/item', { section, name: itemName, data }, editing ? `${itemName} a bien été modifié sur la version de test` : `${itemName} est en boutique sur la version de test`);
  });
  return form;
}

// With "Public" chosen (and the right to publish), an edit goes to the test version and to the main game at once
const shopLiveEdit = () => tabEnv.shop === 'live' && can('shop.edit') && can('shop.publish');
async function shopAction(url, body, done) {
  try {
    const live = shopLiveEdit();
    await post(url, live ? { ...body, live: true } : body);
    notify(live ? done.replace('sur la version de test', 'sur le test et le jeu public') : done);
    shopState.selected.clear();
    shopState.editing = null;
    shopState.adding = false;
    shopState.packEditing = null;
    shopState.packCreating = false;
    await loadShop();
  } catch (err) {
    notify(err.message, 'error');
  }
}

function shopTabs() {
  const tabs = el('div', 'segment');
  for (const [key, label] of Object.entries(SECTION_LABELS)) {
    const choice = el('button', key === shopState.section ? 'segment-on' : '', label + ' (' + Object.keys(shopState.data.list[key]).length + ')');
    choice.type = 'button';
    choice.addEventListener('click', () => { shopState.section = key; shopState.editing = null; renderShop(); });
    tabs.append(choice);
  }
  const sales = el('button', shopState.section === 'Sales' ? 'segment-on' : '', 'Ventes');
  sales.type = 'button';
  sales.addEventListener('click', () => { shopState.section = 'Sales'; shopState.editing = null; renderShop(); });
  tabs.append(sales);
  const controls = el('div', 'controls');
  controls.append(tabs);
  return controls;
}

const SALES_PERIODS = { 1: "Aujourd'hui", 7: '7 jours', 30: '30 jours', 0: 'Tout' };
const salesState = { days: 7, token: 0 };

function salesSpentText(row) {
  if (row.currency === 'Robux') return '—';
  if (row.currency === 'Argent') return formatNumber(row.spent) + '€';
  if (row.currency === 'EventPoint') return formatNumber(row.spent) + ' points';
  return formatNumber(row.spent) + ' ' + row.currency;
}

async function renderSales() {
  const root = $('shop-body');
  const token = ++salesState.token;
  const env = tabEnv.shop;
  const days = salesState.days;

  const period = el('div', 'segment');
  for (const key of [1, 7, 30, 0]) {
    const choice = el('button', key === days ? 'segment-on' : '', SALES_PERIODS[key]);
    choice.type = 'button';
    choice.addEventListener('click', () => { salesState.days = key; renderSales(); });
    period.append(choice);
  }
  const periodBox = el('div', 'controls');
  periodBox.append(period);
  const hint = el('p', 'muted note', 'Tous les serveurs ensemble. Compté depuis la mise à jour qui a ajouté ces stats, avec environ 1 minute de retard. Les jours sont en heure UTC');
  root.replaceChildren(releaseBar('shop', shopState.data.release, loadShop), shopTabs(), periodBox, hint, el('p', 'muted', 'Chargement...'));

  let data;
  try {
    data = await getJson('/api/shop/sales?env=' + env + '&days=' + days);
  } catch (err) {
    if (token === salesState.token) notify(err.message, 'error');
    return;
  }
  if (token !== salesState.token || shopState.section !== 'Sales' || currentTab !== 'shop') return;

  const sumOf = currency => data.rows.filter(row => row.currency === currency).reduce((total, row) => total + row.spent, 0);
  const tiles = el('div', 'tiles');
  tiles.append(
    tile('Achats', formatNumber(data.rows.reduce((total, row) => total + row.count, 0))),
    tile("Points d'event dépensés", formatNumber(sumOf('EventPoint'))),
    tile('Argent dépensé', formatNumber(sumOf('Argent')) + '€'),
  );

  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Objet', 'Type', 'Achats', 'Dépensé']) head.append(el('th', '', name));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  for (const row of data.rows) {
    const line = el('tr');
    line.append(el('td', '', row.name), el('td', '', row.kind === 'Nametag' ? 'Nametag' : 'Objet'), el('td', 'num', formatNumber(row.count)), el('td', 'num', salesSpentText(row)));
    tbody.append(line);
  }
  if (!data.rows.length) {
    const line = el('tr');
    const cell = el('td', 'muted', 'Aucun achat sur cette période ._.');
    cell.colSpan = 4;
    line.append(cell);
    tbody.append(line);
  }
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);
  root.replaceChildren(releaseBar('shop', shopState.data.release, loadShop), shopTabs(), periodBox, hint, tiles, scroll);
}

// ---------------------------------------------------------------- shop: the nametag board (packs, drag and drop)
const NO_PACK = ''; // the "Sans pack" section
const LEGACY_SHADE = 30; // what the game's old tint looks like, for a nametag from before the setting (no Shade field)
const tagImageId = item => /\d{5,20}/.exec(String((Array.isArray(item.Id) ? item.Id[0] : item.Id) || ''))?.[0] || '';
const tagCountText = total => `${formatNumber(total)} nametag${total > 1 ? 's' : ''}`;

// Pictures by Roblox image id. In shopState.icons: a link, null while it's being asked, false when Roblox has no picture to give.
// Roblox refuses many requests in a row and answers "Pending" for a picture it's still making: 100 ids per request,
// and what is missing is asked again a little later, a few times
const SHOP_ICON_WAITS = [0, 3000, 6000, 12000, 25000];
const SHOP_ICON_RETRY = 60_000; // a picture given up on is tried again on a later render, not before
async function loadShopIcons(ids) {
  const stale = shopState.iconsGivenUp && Date.now() - shopState.iconsGivenUp > SHOP_ICON_RETRY;
  const wanted = [...new Set(ids)].filter(id => id && (!(id in shopState.icons) || (stale && shopState.icons[id] === false)));
  if (!wanted.length) return;
  if (stale) shopState.iconsGivenUp = 0;
  // Marked straight away: a second render while this one loads doesn't ask for them again
  for (const id of wanted) shopState.icons[id] = null;
  for (const wait of SHOP_ICON_WAITS) {
    const missing = wanted.filter(id => !shopState.icons[id]);
    if (!missing.length) break;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    for (let i = 0; i < missing.length; i += 100) {
      try {
        Object.assign(shopState.icons, await getJson(`/api/shop/icons?ids=${missing.slice(i, i + 100).join(',')}`));
      } catch { /* asked again on the next round */ }
    }
    showShopIcons($('shop-body'));
  }
  const lost = wanted.filter(id => !shopState.icons[id]);
  if (lost.length) {
    for (const id of lost) shopState.icons[id] = false;
    shopState.iconsGivenUp = Date.now();
    showShopIcons($('shop-body'));
  }
}

function showShopIcons(root) {
  for (const box of root.querySelectorAll('[data-icon]')) {
    const img = box.querySelector('img');
    const id = box.dataset.icon;
    const url = shopState.icons[id];
    // No image id at all, or none to get from Roblox: a grey box that says so instead of a black one
    box.classList.toggle('tag-nopic', !id || url === false);
    if (!url) img.hidden = true;
    else if (img.getAttribute('src') !== url) { img.src = url; img.hidden = false; }
  }
}

// The picture with the game's dark effect over it
function tagPicture(imageId, shade) {
  const box = el('div', 'tag-picture');
  box.dataset.icon = imageId;
  const img = el('img');
  img.alt = '';
  img.hidden = true;
  img.draggable = false; // the card is what gets dragged, not its picture
  const layer = el('div', 'tag-shade');
  layer.style.opacity = shade / 100;
  box.append(img, layer, el('span', 'tag-nopic-text', "pas d'aperçu"));
  return box;
}

function tagPriceText(item) {
  // A Robux nametag's Price is the ID of its product: the price in Robux is set on Roblox, the site doesn't know it
  if (item.Price > 1e9) return 'Robux';
  if (item.Currency === 'EventPoint') return `${formatNumber(item.Price)} points`;
  if (item.Currency) return `${formatNumber(item.Price)} ${item.Currency}`;
  return `${formatNumber(item.Price)}€`;
}

const closeTagForm = () => { shopState.editing = null; shopState.adding = false; renderShop(); };

function moveTag(name, pack) {
  return shopAction('/api/shop/nametag/pack', { name, pack: pack || null },
    pack ? `${name} est dans le pack ${pack} sur la version de test` : `${name} n'est plus dans un pack sur la version de test`);
}

// Several nametags in one request: one new version for the game, not one per nametag
function moveTags(names, pack) {
  if (names.length === 1) return moveTag(names[0], pack);
  return shopAction('/api/shop/nametag/pack', { names, pack: pack || null },
    pack ? `${names.length} nametags sont dans le pack ${pack} sur la version de test` : `${names.length} nametags ne sont plus dans un pack sur la version de test`);
}

// The selection changed: the cards and the bar follow, without redrawing the board (the page stays where it is)
function showTagSelection() {
  const root = $('shop-body');
  for (const card of root.querySelectorAll('.tag-card[data-tag]')) {
    const on = shopState.selected.has(card.dataset.tag);
    card.classList.toggle('tag-selected', on);
    card.setAttribute('aria-pressed', String(on));
  }
  const bar = root.querySelector('.tag-select-bar');
  if (!bar) return;
  const total = shopState.selected.size;
  bar.hidden = total === 0;
  bar.querySelector('.tag-select-count').textContent = `${tagCountText(total)} sélectionné${total > 1 ? 's' : ''}`;
}

function clearTagSelection() {
  if (!shopState.selected.size) return;
  shopState.selected.clear();
  shopState.selectAnchor = null;
  showTagSelection();
}

// Ctrl/Cmd+click: this card in or out. Shift+click: everything from the last card clicked to this one, in the same pack
function selectTagCard(card, name, range) {
  const anchor = shopState.selectAnchor;
  const siblings = [...card.parentElement.querySelectorAll('.tag-card[data-tag]')];
  const from = range && anchor ? siblings.findIndex(other => other.dataset.tag === anchor) : -1;
  if (from >= 0) {
    const to = siblings.indexOf(card);
    for (const other of siblings.slice(Math.min(from, to), Math.max(from, to) + 1)) shopState.selected.add(other.dataset.tag);
  } else if (shopState.selected.has(name)) shopState.selected.delete(name);
  else shopState.selected.add(name);
  shopState.selectAnchor = name;
  showTagSelection();
}

// Escape drops the selection (the nametag form has its own Escape)
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && currentTab === 'shop' && !shopState.editing && !shopState.adding) clearTagSelection();
});

// A section or a chip of the drop bar: a dragged card dropped on it moves to that pack
function packDropTarget(element, pack) {
  element.addEventListener('dragover', event => {
    // from: the pack the dragged cards are all in (nothing to do there), undefined when they come from several
    if (!shopState.dragging || shopState.dragging.from === pack) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    element.classList.add('pack-drop');
  });
  element.addEventListener('dragleave', event => {
    if (!element.contains(event.relatedTarget)) element.classList.remove('pack-drop');
  });
  element.addEventListener('drop', event => {
    event.preventDefault();
    element.classList.remove('pack-drop');
    const dragged = shopState.dragging;
    shopState.dragging = null;
    if (dragged && dragged.from !== pack) moveTags(dragged.names, pack);
  });
}

// While a card is dragged the browser ignores the wheel and hardly scrolls by itself: a far away pack couldn't be reached.
// The page (the window is what scrolls on this site) follows the pointer near the top or the bottom of the screen,
// faster as it gets closer to the edge
const DRAG_SCROLL_ZONE = 120; // px from the edge where it starts
const DRAG_SCROLL_MAX = 25; // px per frame, right at the edge
const dragScroll = { x: 0, y: null, frame: 0 };

function dragScrollSpeed(x, y) {
  let bottom = window.innerHeight;
  // The bar of pack chips sits at the bottom: over it nothing scrolls (it's a place to drop), and the bottom zone starts above it
  const bar = document.querySelector('.board-dragging .pack-dropbar');
  const box = bar && bar.childElementCount ? bar.getBoundingClientRect() : null;
  if (box && box.height > 0) {
    if (y >= box.top && x >= box.left && x <= box.right) return 0;
    bottom = Math.min(bottom, box.top);
  }
  if (y < DRAG_SCROLL_ZONE) return -Math.ceil(DRAG_SCROLL_MAX * Math.min(1, (DRAG_SCROLL_ZONE - y) / DRAG_SCROLL_ZONE));
  if (y > bottom - DRAG_SCROLL_ZONE) return Math.ceil(DRAG_SCROLL_MAX * Math.min(1, (y - (bottom - DRAG_SCROLL_ZONE)) / DRAG_SCROLL_ZONE));
  return 0;
}

function dragScrollStep() {
  dragScroll.frame = 0;
  if (!shopState.dragging || dragScroll.y === null) return;
  const speed = dragScrollSpeed(dragScroll.x, dragScroll.y);
  if (speed) window.scrollBy(0, speed);
  // Goes on while the pointer stays in the zone, even without moving
  dragScroll.frame = requestAnimationFrame(dragScrollStep);
}

function stopDragScroll() {
  dragScroll.y = null;
  if (dragScroll.frame) cancelAnimationFrame(dragScroll.frame);
  dragScroll.frame = 0;
}

document.addEventListener('dragover', event => {
  if (!shopState.dragging) return;
  dragScroll.x = event.clientX;
  dragScroll.y = event.clientY;
  if (!dragScroll.frame) dragScroll.frame = requestAnimationFrame(dragScrollStep);
}, true);
document.addEventListener('dragend', stopDragScroll, true);
document.addEventListener('drop', stopDragScroll, true);
// Out of the window: nothing moves until the pointer is back
document.addEventListener('dragleave', event => { if (!event.relatedTarget) stopDragScroll(); }, true);
// The wheel during a drag, on the browsers that send it
document.addEventListener('wheel', event => {
  if (!shopState.dragging || event.ctrlKey) return;
  event.preventDefault();
  const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1; // lines, pages, pixels
  window.scrollBy(0, event.deltaY * unit);
}, { passive: false });

function tagCard(name, item, pack, packList, readOnly) {
  const card = el('div', item.IsSale ? 'tag-card' : 'tag-card tag-off');
  const info = el('div', 'tag-card-info');
  info.append(el('strong', 'tag-card-name', item.DisplayName || name));
  if (item.DisplayName && item.DisplayName !== name) info.append(el('small', 'muted tag-card-id', name));
  const meta = el('div', 'tag-card-meta');
  meta.append(el('span', 'num', tagPriceText(item)));
  if (!item.IsSale) meta.append(el('span', 'tag-badge off', 'Hors vente'));
  if (Array.isArray(item.Id)) meta.append(el('span', 'tag-badge anim', 'Animé'));
  if (item.IsEvent) meta.append(el('span', 'tag-badge event', 'Event'));
  if (item.TextMode === 'White') meta.append(el('span', 'tag-badge white', 'Whitemode'));
  card.title = name;
  card.dataset.tag = name;
  card.append(tagPicture(tagImageId(item), typeof item.Shade === 'number' ? item.Shade : LEGACY_SHADE), info, meta);
  if (readOnly) return card;
  if (shopState.selected.has(name)) card.classList.add('tag-selected');
  card.setAttribute('aria-pressed', String(shopState.selected.has(name)));

  card.classList.add('tag-editable');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  const open = () => { shopState.selected.clear(); shopState.selectAnchor = null; shopState.editing = name; shopState.adding = false; renderShop(); };
  card.addEventListener('click', event => {
    // With Ctrl, Cmd or Shift the click picks the card instead of opening its form
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      selectTagCard(card, name, event.shiftKey);
    } else open();
  });
  card.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === card) open(); });

  card.draggable = true;
  card.addEventListener('dragstart', event => {
    // A selected card takes the whole selection with it, any other card goes alone
    const names = shopState.selected.has(name) && shopState.selected.size > 1 ? [...shopState.selected] : [name];
    const from = names.every(other => shopState.tagPacks[other] === pack) ? pack : undefined;
    shopState.dragging = { names, from };
    event.dataTransfer.setData('text/plain', names.join(', '));
    event.dataTransfer.effectAllowed = 'move';
    if (names.length > 1 && event.dataTransfer.setDragImage) {
      // What follows the pointer says how many are moving
      const badge = el('div', 'tag-drag-count', tagCountText(names.length));
      document.body.append(badge);
      event.dataTransfer.setDragImage(badge, -12, -12);
      setTimeout(() => badge.remove(), 0);
    }
    const board = card.closest('.tag-board-box');
    // Later: a change of the page inside dragstart cancels the drag on some browsers
    setTimeout(() => {
      if (!shopState.dragging) return;
      for (const other of board?.querySelectorAll('.tag-card[data-tag]') || []) other.classList.toggle('tag-dragging', names.includes(other.dataset.tag));
      board?.classList.add('board-dragging');
    }, 0);
  });
  card.addEventListener('dragend', () => {
    shopState.dragging = null;
    const board = card.closest('.tag-board-box');
    card.classList.remove('tag-dragging');
    for (const other of board?.querySelectorAll('.tag-dragging') || []) other.classList.remove('tag-dragging');
    board?.classList.remove('board-dragging');
  });

  // Drag and drop doesn't exist on a touch screen: the same move from a list
  const targets = [...packList.filter(other => other !== pack), ...(pack === NO_PACK ? [] : [NO_PACK])];
  if (targets.length) {
    const move = el('label', 'tag-move');
    move.title = 'Déplacer vers…';
    const glyph = el('span', '', '⇄');
    glyph.setAttribute('aria-hidden', 'true');
    const select = el('select');
    select.setAttribute('aria-label', `Déplacer ${name} vers…`);
    select.append(new Option('Déplacer vers…', ''));
    targets.forEach((target, index) => select.append(new Option(target === NO_PACK ? 'Sans pack' : target, String(index))));
    select.addEventListener('change', () => { if (select.value !== '') moveTag(name, targets[Number(select.value)]); });
    move.append(glyph, select);
    move.addEventListener('click', event => event.stopPropagation());
    move.addEventListener('keydown', event => event.stopPropagation());
    card.append(move);
  }
  return card;
}

// A pack's picture in the game's shop: strips side by side, strip n showing the n-th slice of its nametag, so that
// the strips read like one 5:1 picture. PreviewCount: how many strips. Preview: the nametags of the first strips, the
// game draws the others at random in the pack
const DEFAULT_PREVIEW = 5;
const MAX_PREVIEW = 10;

// What a pack's picture is today. A nametag that is no longer in the pack doesn't count
function packPreview(pack, info) {
  const stored = Number.isInteger(info?.PreviewCount) ? info.PreviewCount : DEFAULT_PREVIEW;
  const count = Math.min(MAX_PREVIEW, Math.max(1, stored));
  const chosen = (Array.isArray(info?.Preview) ? info.Preview : []).filter(name => shopState.tagPacks[name] === pack).slice(0, count);
  return { count, chosen };
}

function packMock(count, chosen) {
  const tags = shopState.data.list.Nametags;
  const box = el('div', 'pack-mock');
  for (let index = 0; index < count; index++) {
    const name = chosen[index];
    const strip = el('div', name ? 'pack-strip' : 'pack-strip pack-strip-random');
    if (name) {
      strip.dataset.icon = tagImageId(tags[name] || {});
      strip.title = name;
      const img = el('img');
      img.alt = '';
      img.hidden = true;
      img.draggable = false;
      // The whole picture, as wide as all the strips, moved so that this strip shows its own slice
      img.style.width = `${count * 100}%`;
      img.style.left = `${-index * 100}%`;
      strip.append(img);
    } else {
      // Drawn at random by the game
      strip.title = 'Aléatoire';
      strip.append(el('span', '', '?'));
    }
    box.append(strip);
  }
  return box;
}

// "Aperçu en jeu" of a pack's form: how many strips, and which nametags on the first ones. Sent with the rest of the form
function packPreviewEditor(pack, info) {
  const tags = shopState.data.list.Nametags;
  const shown = name => tags[name].DisplayName || name;
  const members = Object.keys(tags).filter(name => shopState.tagPacks[name] === pack).sort((a, b) => shown(a).localeCompare(shown(b), 'fr'));
  const state = packPreview(pack, info);
  let picking = null; // the strip whose nametag is being chosen
  let dragIndex = null; // the chosen strip being dragged to another place

  const box = el('div', 'pack-preview');
  const countInput = input('number', state.count, { min: 1, max: MAX_PREVIEW, step: 1, required: true });
  const mockBox = el('div', 'pack-preview-mock');
  const picker = el('div', 'pack-picker');

  // The chosen nametags are the first strips, with no hole: one put on a random strip goes right after them
  const place = (name, index) => {
    const list = state.chosen.filter(other => other !== name);
    const moved = list.length !== state.chosen.length;
    if (index < list.length && !moved) list[index] = name;
    else list.splice(Math.min(index, list.length), 0, name);
    state.chosen = list.slice(0, state.count);
  };

  const drawPicker = () => {
    if (picking === null) {
      picker.hidden = true;
      picker.replaceChildren();
      return;
    }
    picker.hidden = false;
    const current = state.chosen[picking];
    const title = el('strong', '', current ? `Bande ${picking + 1} : ${shown(current)}` : `Choisis le nametag de la bande ${Math.min(picking, state.chosen.length) + 1}`);
    const search = input('search', '', { placeholder: 'Chercher dans le pack', autocomplete: 'off' });
    search.setAttribute('aria-label', 'Chercher dans le pack');
    const list = el('div', 'pack-picker-list');
    const fillList = () => {
      const needle = search.value.trim().toLowerCase();
      const free = members.filter(name => !state.chosen.includes(name) && (!needle || name.toLowerCase().includes(needle) || shown(name).toLowerCase().includes(needle)));
      list.replaceChildren(...free.map(name => {
        const choice = el('button', 'pack-pick');
        choice.type = 'button';
        choice.title = name;
        choice.append(tagPicture(tagImageId(tags[name]), 0), el('span', '', shown(name)));
        choice.addEventListener('click', () => { place(name, picking); picking = null; draw(); });
        return choice;
      }));
      if (!free.length) list.append(el('p', 'muted', !members.length ? "Ce pack est vide : range d'abord des nametags dedans" : needle ? 'Aucun nametag ne correspond ._.' : 'Tous les nametags du pack sont déjà dans l’aperçu'));
      showShopIcons(list);
    };
    search.addEventListener('input', fillList);
    // Enter here would send the whole pack form
    search.addEventListener('keydown', event => { if (event.key === 'Enter') event.preventDefault(); });
    const actions = el('div', 'member-actions');
    if (current) actions.append(button('Aléatoire', () => { state.chosen.splice(picking, 1); picking = null; draw(); }));
    actions.append(button('Fermer', () => { picking = null; draw(); }));
    picker.replaceChildren(title, search, list, actions);
    fillList();
  };

  const draw = () => {
    const mock = packMock(state.count, state.chosen);
    [...mock.children].forEach((strip, index) => {
      const name = state.chosen[index];
      strip.tabIndex = 0;
      strip.setAttribute('role', 'button');
      strip.setAttribute('aria-label', name ? `Bande ${index + 1} : ${name}` : `Bande ${index + 1} : aléatoire`);
      if (picking === index) strip.classList.add('pack-strip-on');
      const pick = () => { picking = picking === index ? null : index; draw(); };
      strip.addEventListener('click', pick);
      strip.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === strip) { event.preventDefault(); pick(); }
      });
      if (name) {
        const clear = el('button', 'strip-clear', '✕');
        clear.type = 'button';
        clear.title = 'Remettre en aléatoire';
        clear.setAttribute('aria-label', `Remettre la bande ${index + 1} en aléatoire`);
        clear.addEventListener('click', event => { event.stopPropagation(); state.chosen.splice(index, 1); picking = null; draw(); });
        strip.append(clear);
        // A chosen strip can be dragged to another place
        strip.draggable = true;
        strip.addEventListener('dragstart', event => {
          event.stopPropagation();
          dragIndex = index;
          event.dataTransfer.setData('text/plain', name);
          event.dataTransfer.effectAllowed = 'move';
        });
        strip.addEventListener('dragend', () => { dragIndex = null; });
      }
      // What is dropped here: another strip, or one card of this pack dragged from the board below
      const dropped = () => {
        if (dragIndex !== null) return state.chosen[dragIndex];
        const dragged = shopState.dragging;
        return dragged && dragged.names.length === 1 && members.includes(dragged.names[0]) ? dragged.names[0] : null;
      };
      strip.addEventListener('dragover', event => {
        if (!dropped()) return;
        event.preventDefault();
        event.stopPropagation();
        strip.classList.add('pack-drop');
      });
      strip.addEventListener('dragleave', () => strip.classList.remove('pack-drop'));
      strip.addEventListener('drop', event => {
        const name_ = dropped();
        if (!name_) return;
        event.preventDefault();
        // Not for the pack section around: the card stays in its pack
        event.stopPropagation();
        dragIndex = null;
        place(name_, index);
        picking = null;
        draw();
      });
    });
    mockBox.replaceChildren(mock);
    drawPicker();
    showShopIcons(box);
  };

  countInput.addEventListener('input', () => {
    const wanted = Number(countInput.value);
    if (!Number.isInteger(wanted) || wanted < 1 || wanted > MAX_PREVIEW) return;
    state.count = wanted;
    state.chosen = state.chosen.slice(0, wanted);
    if (picking !== null && picking >= wanted) picking = null;
    draw();
  });
  const tools = el('div', 'member-actions');
  tools.append(button('Tout aléatoire', () => { state.chosen = []; picking = null; draw(); }));
  box.append(el('strong', 'subtitle', 'Aperçu en jeu'), field("Nombre de nametags dans l'aperçu", countInput), mockBox,
    el('p', 'muted field-note', "Clique sur une bande pour choisir son nametag (ou glisse dessus un nametag du pack), ✕ pour la remettre en aléatoire. Les nametags choisis s'affichent en premier, les autres bandes sont tirées au hasard dans le pack"),
    tools, picker);
  draw();
  return {
    box,
    // null: the number typed isn't one the game takes
    read() {
      const wanted = Number(countInput.value);
      if (!Number.isInteger(wanted) || wanted < 1 || wanted > MAX_PREVIEW) return null;
      return { previewCount: wanted, preview: state.chosen.slice(0, wanted) };
    },
  };
}

// Name, description and picture of a pack: a new one (pack = null) or an existing one
function packForm(pack, info) {
  const form = el('form', 'pack-form');
  const name = input('text', pack || '', { required: true, maxLength: 40, autocomplete: 'off' });
  const desc = input('text', info?.Desc || '', { maxLength: 200, autocomplete: 'off', placeholder: 'Facultatif' });
  const save = el('button', 'button', pack ? 'Valider' : 'Créer le pack');
  save.type = 'submit';
  form.append(field('Nom du pack', name), field('Description', desc), save, button('Annuler', () => { shopState.packEditing = null; shopState.packCreating = false; renderShop(); }));
  // A new pack has no nametag to show yet: its picture is set once it has some
  const preview = pack ? packPreviewEditor(pack, info) : null;
  if (preview) form.append(preview.box);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const wanted = name.value.trim();
    if (!wanted) return notify('Donne un nom au pack', 'error');
    if (!pack) return shopAction('/api/shop/pack/create', { name: wanted, desc: desc.value }, `Le pack ${wanted} est créé sur la version de test`);
    const picture = preview.read();
    if (!picture) return notify(`L'aperçu d'un pack montre entre 1 et ${MAX_PREVIEW} nametags`, 'error');
    shopAction('/api/shop/pack/update', { name: pack, newName: wanted, desc: desc.value, ...picture }, `Le pack ${wanted} a bien été modifié sur la version de test`);
  });
  return form;
}

// Two clicks, and the second one says what happens to the nametags of the pack
function packDeleteButton(pack, size) {
  const element = button('Supprimer', () => {
    if (element.dataset.armed !== '1') {
      element.dataset.armed = '1';
      element.textContent = size > 1 ? `Ses ${size} nametags retournent dans « Sans pack ». Confirmer ?`
        : size === 1 ? 'Son nametag retourne dans « Sans pack ». Confirmer ?' : 'Supprimer ce pack vide ?';
      setTimeout(() => { element.dataset.armed = '0'; element.textContent = 'Supprimer'; }, 6000);
      return;
    }
    shopAction('/api/shop/pack/remove', { name: pack }, size ? `Le pack ${pack} est supprimé, ses nametags sont dans « Sans pack » sur la version de test` : `Le pack ${pack} est supprimé sur la version de test`);
  }, true);
  return element;
}

// One pack (or "Sans pack"): header, then its cards. total counts its nametags without the filters
function packSection({ pack, info, cards, total, index, packList, readOnly, filtering }) {
  const real = pack !== NO_PACK;
  const open = filtering || !shopState.collapsed.has(pack);
  const section = el('section', open ? 'pack pack-open' : 'pack');
  if (!readOnly) packDropTarget(section, pack);

  if (real && shopState.packEditing === pack && !readOnly) {
    section.append(packForm(pack, info));
  } else {
    const head = el('div', 'pack-head');
    const toggle = el('button', 'pack-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open));
    const arrow = el('span', 'pack-arrow', '▸');
    arrow.setAttribute('aria-hidden', 'true');
    toggle.append(arrow, el('span', 'pack-name', real ? pack : 'Sans pack'),
      el('span', 'pack-size', filtering ? `${formatNumber(cards.length)} sur ${formatNumber(total)}` : tagCountText(total)));
    toggle.addEventListener('click', () => {
      if (shopState.collapsed.has(pack)) shopState.collapsed.delete(pack); else shopState.collapsed.add(pack);
      renderShop();
    });
    head.append(toggle);
    if (real) {
      // Its picture in the game's shop, small. Changed from "Modifier"
      const picture = packPreview(pack, info);
      const mock = packMock(picture.count, picture.chosen);
      mock.setAttribute('role', 'img');
      mock.setAttribute('aria-label', `Aperçu en jeu : ${picture.count} bande${picture.count > 1 ? 's' : ''}, ${picture.chosen.length ? `${picture.chosen.join(', ')} en premier` : 'tout en aléatoire'}`);
      head.append(mock);
    }
    if (real && !readOnly) {
      const actions = el('div', 'pack-actions');
      const reorder = delta => {
        const order = [...packList];
        [order[index], order[index + delta]] = [order[index + delta], order[index]];
        shopAction('/api/shop/pack/order', { order }, `Le pack ${pack} a changé de place sur la version de test`);
      };
      const up = button('↑', () => reorder(-1));
      up.disabled = index === 0;
      up.title = 'Monter le pack';
      up.setAttribute('aria-label', `Monter le pack ${pack}`);
      const down = button('↓', () => reorder(1));
      down.disabled = index === packList.length - 1;
      down.title = 'Descendre le pack';
      down.setAttribute('aria-label', `Descendre le pack ${pack}`);
      actions.append(up, down, button('Modifier', () => { shopState.packEditing = pack; shopState.packCreating = false; renderShop(); }), packDeleteButton(pack, total));
      head.append(actions);
    }
    if (real && info.Desc) head.append(el('p', 'pack-desc', info.Desc));
    section.append(head);
  }

  if (open) {
    const body = el('div', 'pack-body');
    body.append(...cards);
    if (!cards.length) body.append(el('p', 'muted pack-empty', readOnly ? 'Aucun nametag ici' : real ? 'Pack vide : glisse des nametags ici' : 'Tous les nametags sont dans un pack'));
    section.append(body);
  }
  return section;
}

// The nametag form over the page, so the board stays where it was
function tagModal(title, body) {
  const back = el('div', 'modal-back');
  const box = el('div', 'modal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', title);
  box.tabIndex = -1;
  const head = el('div', 'modal-head');
  const close = el('button', 'modal-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer');
  close.addEventListener('click', closeTagForm);
  head.append(el('h3', 'subtitle', title), close);
  const content = el('div', 'modal-body');
  content.append(body);
  box.append(head, content);
  back.append(box);
  back.addEventListener('keydown', event => { if (event.key === 'Escape') closeTagForm(); });
  return back;
}

const TAG_SALE_FILTERS = { all: 'Tous', on: 'En vente', off: 'Hors vente' };

function renderNametagBoard(root, readOnly, controls) {
  const tags = shopState.data.list.Nametags;
  const packs = shopState.data.list.Packs || {};
  const packList = Object.keys(packs).sort((a, b) => packs[a].Order - packs[b].Order || a.localeCompare(b, 'fr'));
  // A pack that no longer exists counts as no pack
  const packOf = name => (tags[name].Pack && packs[tags[name].Pack] ? tags[name].Pack : NO_PACK);
  const shown = name => tags[name].DisplayName || name;
  // On sale first, then by price, cheapest first: euros, then points and items, then Robux (their price is on
  // Roblox, the site doesn't know it, so those stay by name)
  const priceKind = item => (item.Price > 1e9 ? 2 : item.Currency ? 1 : 0);
  const priceOf = item => (item.Price > 1e9 ? 0 : Number(item.Price) || 0);
  const names = Object.keys(tags).sort((a, b) => Number(Boolean(tags[b].IsSale)) - Number(Boolean(tags[a].IsSale))
    || priceKind(tags[a]) - priceKind(tags[b]) || priceOf(tags[a]) - priceOf(tags[b]) || shown(a).localeCompare(shown(b), 'fr'));

  const hint = el('p', 'muted note', readOnly
    ? "Un nametag ne se supprime pas : hors vente, il disparaît de la boutique. Les packs rangent les nametags dans la boutique du jeu"
    : "Clique sur un nametag pour le modifier, glisse-le sur un pack pour le ranger (ou utilise ⇄ sur téléphone). Ctrl + clic (Cmd sur Mac) en sélectionne plusieurs pour les déplacer d'un coup, Maj + clic toute une rangée. Un nametag ne se supprime pas : hors vente, il disparaît de la boutique et reste ici pour le remettre en vente");

  const search = input('search', shopState.search, { autocomplete: 'off', placeholder: 'Nom du nametag' });
  const searchBox = el('label', 'search', 'Chercher');
  searchBox.append(search);
  const saleFilter = el('div', 'segment');
  const board = el('div', 'tag-board');
  const fill = () => {
    const needle = shopState.search.trim().toLowerCase();
    const sale = shopState.tagSale;
    const filtering = Boolean(needle) || sale !== 'all';
    const visible = name => (sale === 'all' || Boolean(tags[name].IsSale) === (sale === 'on'))
      && (!needle || name.toLowerCase().includes(needle) || (tags[name].DisplayName || '').toLowerCase().includes(needle));
    const sections = [];
    [...packList, NO_PACK].forEach((pack, index) => {
      const members = names.filter(name => packOf(name) === pack);
      const kept = members.filter(visible);
      // While searching, only the packs with a result. "Sans pack" with no pack at all is just the list
      if (filtering && !kept.length) return;
      sections.push(packSection({
        pack, info: packs[pack], total: members.length, index, packList, readOnly, filtering,
        cards: kept.map(name => tagCard(name, tags[name], pack, packList, readOnly)),
      }));
    });
    if (!sections.length) sections.push(el('p', 'muted', 'Aucun nametag ne correspond ._.'));
    board.replaceChildren(...sections);
    showShopIcons(board);
  };
  for (const [key, label] of Object.entries(TAG_SALE_FILTERS)) {
    const choice = el('button', key === shopState.tagSale ? 'segment-on' : '', label);
    choice.type = 'button';
    choice.addEventListener('click', () => {
      shopState.tagSale = key;
      for (const other of saleFilter.children) other.classList.toggle('segment-on', other === choice);
      fill();
    });
    saleFilter.append(choice);
  }
  search.addEventListener('input', () => { shopState.search = search.value; fill(); });

  const toolbar = el('div', 'tag-toolbar');
  toolbar.append(searchBox, saleFilter);
  if (!readOnly) {
    const actions = el('div', 'tag-toolbar-actions');
    actions.append(button('Nouveau pack', () => { shopState.packCreating = true; shopState.packEditing = null; renderShop(); }),
      button('Nouveau nametag', () => { shopState.adding = true; shopState.editing = null; renderShop(); }));
    toolbar.append(actions);
  }
  const onSale = names.filter(name => tags[name].IsSale).length;
  const summary = el('p', 'muted tag-count', `${tagCountText(names.length)}, ${formatNumber(onSale)} en vente, ${formatNumber(packList.length)} pack${packList.length > 1 ? 's' : ''}`);

  // Where a dragged card can go without scrolling: every pack, at the bottom of the screen while dragging
  const dropBar = el('div', 'pack-dropbar');
  if (!readOnly && packList.length) {
    dropBar.append(el('span', 'muted', 'Déposer dans :'));
    for (const pack of [...packList, NO_PACK]) {
      const chip_ = el('span', 'drop-chip', pack === NO_PACK ? 'Sans pack' : pack);
      packDropTarget(chip_, pack);
      dropBar.append(chip_);
    }
  }

  // The selection: what is no longer a nametag leaves it, and its bar (count, move, clear) stays at the bottom of the screen
  for (const name of [...shopState.selected]) if (!tags[name] || readOnly) shopState.selected.delete(name);
  shopState.tagPacks = Object.fromEntries(names.map(name => [name, packOf(name)]));
  const selectBar = el('div', 'tag-select-bar');
  if (!readOnly) {
    const targets = [...packList, NO_PACK];
    const moveSelect = el('select');
    moveSelect.setAttribute('aria-label', 'Déplacer la sélection vers…');
    moveSelect.append(new Option('Déplacer vers…', ''));
    targets.forEach((target, index) => moveSelect.append(new Option(target === NO_PACK ? 'Sans pack' : target, String(index))));
    moveSelect.addEventListener('change', () => {
      if (moveSelect.value === '' || !shopState.selected.size) return;
      moveTags([...shopState.selected], targets[Number(moveSelect.value)]);
    });
    selectBar.append(el('strong', 'tag-select-count', ''), moveSelect, button('Tout désélectionner', clearTagSelection));
  }

  const boardBox = el('div', 'tag-board-box');
  // A click next to the cards (not on a card, a pack header or a form) drops the selection
  boardBox.addEventListener('click', event => {
    if (!event.target.closest('.tag-card, .pack-head, .pack-form, .tag-select-bar, .pack-dropbar')) clearTagSelection();
  });
  if (shopState.packCreating && !readOnly) {
    const creating = el('section', 'pack');
    creating.append(packForm(null));
    boardBox.append(creating);
  }
  boardBox.append(board, dropBar);
  if (!readOnly) boardBox.append(selectBar);
  fill();

  const parts = [releaseBar('shop', shopState.data.release, loadShop), dataList('shop-tools', shopState.data.tools), controls, hint, toolbar, summary, boardBox];
  let modal = null;
  if (!readOnly && (shopState.adding || (shopState.editing && tags[shopState.editing]))) {
    modal = tagModal(shopState.editing ? `Modifier ${shopState.editing}` : 'Ajouter un nametag', shopForm());
    parts.push(modal);
  }
  root.replaceChildren(...parts);
  showTagSelection();
  if (modal) modal.firstElementChild.focus();
  else if (shopState.packCreating && !readOnly) boardBox.querySelector('.pack-form input')?.focus();
  else if (shopState.packEditing) board.querySelector('.pack-form input')?.focus();
  loadShopIcons(names.map(name => tagImageId(tags[name])));
}

function renderShop() {
  if (shopState.section === 'Sales') { renderSales(); return; }
  const root = $('shop-body');
  const section = shopState.section;
  const items = shopState.data.list[section];
  const readOnly = (tabEnv.shop === 'live' && !shopLiveEdit()) || !can('shop.edit');
  const controls = shopTabs();
  if (shopLiveEdit()) controls.append(el('p', 'muted note shop-live-note', 'Jeu public : ce que tu changes ici part tout de suite sur le test et sur le jeu public, sans passer par « Publier ».'));
  // The nametags have their own page: a board of packs instead of the table
  if (section === 'Nametags') { renderNametagBoard(root, readOnly, controls); return; }

  const hint = el('p', 'muted note', {
    Event: "Les objets de l'event en cours. Hors vente : ils restent affichés en bas de la boutique",
    Perm: 'Toujours en boutique. Hors vente : ils restent affichés en bas de la boutique',
    Temp: 'Le jeu en tire entre 8 et 12 au hasard chaque jour. Hors vente : ils restent affichés en bas de la boutique',
  }[section]);

  const search = input('search', shopState.search, { autocomplete: 'off' });
  const searchBox = el('label', 'search', 'Chercher');
  searchBox.append(search);

  // Event nametags are added from the Nametags section, with the event box already ticked
  let eventTagBox = null;
  if (section === 'Event') {
    const eventTags = Object.entries(shopState.data.list.Nametags || {}).filter(([, item]) => item.IsEvent && !item.OffSale).map(([name]) => name);
    eventTagBox = el('div', 'controls');
    eventTagBox.append(el('span', 'muted', eventTags.length ? `Nametags d'event en boutique : ${eventTags.join(', ')}` : "Pas de nametag d'event en boutique pour l'instant"));
    if (!readOnly) {
      eventTagBox.append(button("Ajouter un nametag d'event", () => {
        shopState.section = 'Nametags';
        shopState.editing = null;
        shopState.adding = true;
        shopState.presetEvent = true;
        renderShop();
        window.scrollTo(0, 0);
      }));
    }
  }

  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Objet', 'Prix', 'Rareté', 'Description', '']) head.append(el('th', '', name));
  const thead = el('thead'); thead.append(head);
  const tbody = el('tbody');
  const fill = () => {
    const needle = shopState.search.toLowerCase();
    tbody.replaceChildren(...Object.keys(items)
      .filter(name => !needle || name.toLowerCase().includes(needle))
      .sort((a, b) => Number(Boolean(items[a].OffSale)) - Number(Boolean(items[b].OffSale)) || a.localeCompare(b, 'fr'))
      .map(name => {
        const item = items[name];
        const row = el('tr');
        const actions = el('td', 'cell-actions');
        if (!readOnly) {
          actions.append(button('Modifier', () => {
            shopState.editing = name;
            renderShop();
            window.scrollTo(0, 0);
          }));
        }
        row.append(el('td', '', name + (item.OffSale ? ' (hors vente)' : '')), el('td', 'num', priceText(item)), el('td', 'num', String(item.Rarity ?? '')), el('td', 'muted cell-desc', item.Desc || ''), actions);
        return row;
      }));
    if (!tbody.childElementCount) {
      const row = el('tr');
      const cell = el('td', 'muted', 'Rien ici pour l\'instant ._.');
      cell.colSpan = 5;
      row.append(cell);
      tbody.append(row);
    }
  };
  fill();
  search.addEventListener('input', () => { shopState.search = search.value; fill(); });
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);

  const title = el('h3', 'subtitle', shopState.editing ? `Modifier ${shopState.editing}` : 'Ajouter un objet');
  const editing = readOnly ? [] : [title, shopForm()];
  root.replaceChildren(releaseBar('shop', shopState.data.release, loadShop), dataList('shop-tools', shopState.data.tools), controls, hint, ...(eventTagBox ? [eventTagBox] : []), ...editing, searchBox, scroll);
}

async function loadShop() {
  shopState.data = await getJson(`/api/shop?env=${tabEnv.shop}`);
  renderShop();
}

// ---------------------------------------------------------------- codes
const REWARD_TYPES = {
  money: { label: 'Argent', unit: '€' },
  points: { label: "Points d'event", unit: 'points' },
  item: { label: 'Objet', unit: 'en', named: 'tools' },
  vip: { label: 'VIP', unit: 'jours' },
  nametag: { label: 'Nametag', unit: 'en', named: 'nametags' },
  speed: { label: 'Effet de vitesse', unit: 'secondes' },
};

function rewardText(reward) {
  const type = REWARD_TYPES[reward.type];
  if (reward.type === 'item') return `${reward.amount} ${reward.name}`;
  if (reward.type === 'nametag') return `Nametag ${reward.name}`;
  if (reward.type === 'money') return `${formatNumber(reward.amount)}€`;
  return `${formatNumber(reward.amount)} ${type.unit}${reward.type === 'vip' ? ' de VIP' : reward.type === 'speed' ? ' de vitesse' : " d'event"}`;
}

function rewardRow(container) {
  const row = el('div', 'reward-row');
  const type = el('select');
  type.setAttribute('aria-label', 'Récompense');
  for (const [key, spec] of Object.entries(REWARD_TYPES)) type.append(new Option(spec.label, key));
  const amount = input('number', 1, { min: 1, step: 1, required: true });
  amount.setAttribute('aria-label', 'Quantité');
  const name = input('text', '', { maxLength: 100, autocomplete: 'off', placeholder: 'Nom' });
  name.setAttribute('aria-label', 'Nom');
  const update = () => {
    const named = REWARD_TYPES[type.value].named;
    name.hidden = !named;
    name.required = Boolean(named);
    if (named) name.setAttribute('list', named === 'tools' ? 'code-tools' : 'code-nametags');
  };
  type.addEventListener('change', update);
  update();
  const remove = button('✕', () => row.remove());
  remove.setAttribute('aria-label', 'Enlever cette récompense');
  row.append(type, amount, name, remove);
  row.read = () => {
    const reward = { type: type.value, amount: Number(amount.value) };
    if (REWARD_TYPES[type.value].named) reward.name = name.value.trim();
    return reward;
  };
  container.append(row);
}

async function codeAction(url, body, done) {
  try {
    await post(url, body);
    notify(done);
    await loadCodes();
  } catch (err) {
    notify(err.message, 'error');
  }
}

async function loadCodes() {
  const data = await getJson(`/api/codes?env=${tabEnv.codes}`);
  const root = $('codes-body');
  const readOnly = tabEnv.codes === 'live' || !can('codes.edit');

  const form = el('form', 'form');
  const code = input('text', '', { required: true, maxLength: 40, autocomplete: 'off' });
  const expires = input('datetime-local', '');
  const limit = input('number', '', { min: 1, step: 1 });
  form.append(field('Le code', code), field('Expire le (optionnel)', expires), field('Joueurs max (optionnel)', limit));
  const rewards = el('div', 'rewards');
  rewardRow(rewards);
  const rewardsBox = el('div', 'rewards-box');
  rewardsBox.append(el('span', 'muted tile-label', 'Ce que ça donne'), rewards, button('+ Une récompense', () => rewardRow(rewards)));
  const save = el('button', 'button', 'Créer le code');
  save.type = 'submit';
  form.append(rewardsBox, save);
  form.addEventListener('submit', event => {
    event.preventDefault();
    codeAction('/api/codes/save', {
      code: code.value,
      rewards: [...rewards.children].map(row => row.read()),
      expiresAt: expires.value ? Math.floor(new Date(expires.value).getTime() / 1000) : null,
      maxUses: limit.value ? Number(limit.value) : null,
    }, `Le code ${code.value.toLowerCase().trim()} marche sur la version de test`);
  });

  const list = el('div', 'list');
  const now = Date.now() / 1000;
  for (const entry of data.codes) {
    const row = el('div', 'member');
    const info = el('div', 'member-info');
    const state = !entry.active ? 'Désactivé' : entry.expiresAt && entry.expiresAt <= now ? 'Expiré' : entry.maxUses && entry.uses >= entry.maxUses ? 'Plus de place' : 'Actif';
    const details = [`${state}`, `${formatNumber(entry.uses)}${entry.maxUses ? ` / ${formatNumber(entry.maxUses)}` : ''} joueurs`];
    if (entry.otherUses) details.push(`${formatNumber(entry.otherUses)} ${tabEnv.codes === 'live' ? 'en test' : 'sur le jeu public'}`);
    if (entry.expiresAt) details.push(`jusqu'au ${formatDateTime(entry.expiresAt)}`);
    info.append(el('strong', '', entry.code), el('small', '', entry.rewards.map(rewardText).join(', ')), el('small', '', details.join(' · ')));
    const actions = el('div', 'member-actions');
    actions.append(
      button(entry.active ? 'Désactiver' : 'Réactiver', () => codeAction('/api/codes/active', { code: entry.code, active: !entry.active }, entry.active ? `Le code ${entry.code} ne marche plus sur la version de test` : `Le code ${entry.code} remarche sur la version de test`)),
      confirmButton('Supprimer', () => codeAction('/api/codes/remove', { code: entry.code }, `Le code ${entry.code} a bien été supprimé de la version de test`)),
    );
    row.append(info);
    if (!readOnly) row.append(actions);
    list.append(row);
  }
  if (!data.codes.length) list.append(el('p', 'muted', "Pas encore de code ici ._."));

  const legacy = el('details', 'sessions');
  const active = data.legacy.filter(entry => !entry.expired);
  legacy.append(el('summary', '', `Les anciens codes (${data.legacy.length}, dont ${active.length} encore actifs)`));
  legacy.append(el('p', 'muted note', 'Ils restent dans le jeu et marchent comme avant. Pour en changer un, il faut encore passer par Studio'));
  legacy.append(el('p', 'legacy-codes', data.legacy.map(entry => entry.code + (entry.expired ? ' (expiré)' : '')).join(' · ')));

  root.replaceChildren(releaseBar('codes', data.release, loadCodes), dataList('code-tools', data.tools), dataList('code-nametags', data.nametags),
    ...(readOnly ? [] : [el('h3', 'subtitle', 'Nouveau code'), form]),
    el('h3', 'subtitle', 'Tes codes'), list, legacy);
}

// ---------------------------------------------------------------- sanctions, live
const SANCTION_REFRESH = 5000; // the only tab that updates by itself
const SERVER_LABELS = { free: 'Free Access', custom: 'Custom', roleplay: 'Roleplay', whitelist: 'Whitelist', private: 'Privé', studio: 'Studio', other: 'Autre' };
// found: what the server answered for the search, or null when there's no search
const sanctionState = { rows: [], search: '', type: '', types: [], timer: null, done: false, found: null, foundDone: false, searchId: 0, typing: null };

function stopSanctions() {
  clearInterval(sanctionState.timer);
  sanctionState.timer = null;
}

const sanctionPlain = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
// "léa, ban, insulte": every part has to be found, so a staff and a reason combine
const sanctionTerms = search => search.split(',').map(part => sanctionPlain(part.trim()).replace(/^@/, '')).filter(Boolean);
const sanctionTypeLabel = () => sanctionState.types.find(type => type.value === sanctionState.type)?.label || null;

function sanctionMatches(row, terms) {
  const values = [row.type, row.user, row.rpName, row.staff, row.staffDiscord, row.reason, row.notes, row.serverName, deletedText(row)].filter(Boolean).map(sanctionPlain);
  const label = sanctionTypeLabel();
  if (label && row.type !== label) return false;
  return terms.every(term => values.some(value => value.includes(term)));
}
// What the search and the filter add to the address
const sanctionQuery = () => `${sanctionState.search.trim() ? `&search=${encodeURIComponent(sanctionState.search.trim())}` : ''}${sanctionState.type ? `&type=${encodeURIComponent(sanctionState.type)}` : ''}`;

// The search runs on the server, so it covers every logged sanction and not only the ones loaded here
async function searchSanctions(env) {
  const id = ++sanctionState.searchId;
  if (!sanctionState.search.trim() && !sanctionState.type) {
    sanctionState.found = null;
    fillSanctions();
    return;
  }
  try {
    const result = await getJson(`/api/sanctions?env=${env}&limit=100${sanctionQuery()}`);
    if (id !== sanctionState.searchId || currentTab !== 'sanctions' || tabEnv.sanctions !== env) return;
    sanctionState.found = result.rows;
    sanctionState.foundDone = result.done;
    fillSanctions();
  } catch (err) {
    notify(err.message, 'error');
  }
}

// Same look as the team table: picture, Discord name in their role colour, Roblox @ under it
function sanctionStaff(row) {
  const cell = el('td');
  const who = el('div', 'member-who');
  const names = el('div');
  const name = el('span', 'staff-name', row.staffDiscord || (row.staff ? `@${row.staff}` : '?'));
  const color = readableColor(row.staffColor);
  if (color) name.style.color = color;
  names.append(name);
  if (row.staffDiscord && row.staff) names.append(el('small', 'muted cell-note', `@${row.staff}`));
  who.append(memberPicture(row.staffAvatar), names);
  cell.append(who);
  return cell;
}

// A small button that copies a Roblox username (without the @)
function copyButton(text) {
  const copy = el('button', 'copy-button', '⧉');
  copy.type = 'button';
  copy.title = 'Copier le pseudo';
  copy.setAttribute('aria-label', `Copier ${text}`);
  copy.addEventListener('click', async event => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      notify(`${text} copié`);
    } catch {
      notify('Le navigateur a refusé de copier', 'error');
    }
  });
  return copy;
}

// A sanction deleted in game: the game's list shows this in purple instead of the reason
function deletedText(row) {
  if (!row.deleted) return null;
  if (!row.deleted.by) return 'Supprimée';
  return `Supprimée par ${row.deleted.by}${row.deleted.reason ? ` pour : ${row.deleted.reason}` : ''}`;
}

function sanctionRow(row) {
  const line = el('tr');
  const who = el('td');
  const username = row.user ? `@${row.user}` : '?';
  const named = el('strong', '', row.rpName || username);
  who.append(named);
  const handle = row.rpName ? el('small', 'muted subline', username) : named;
  if (row.rpName) who.append(handle);
  if (row.user) handle.append(copyButton(row.user));
  const what = el('td', '', row.type);
  if (row.duration) what.append(el('small', 'muted subline', formatBanDuration(row.duration)));
  if (row.offline) what.append(el('small', 'muted subline', 'Hors ligne'));
  // A "Suppression de sanction" that says which one it deleted
  if (row.target) what.append(el('small', 'muted subline', `${row.target.type} du ${formatShortDate(new Date(row.target.at * 1000))} à ${formatTime(row.target.at)}`));
  let why;
  if (row.deleted) {
    // Like in game: the reason makes way for who deleted it, the rest is in the details
    line.classList.add('sanction-deleted');
    why = el('td', 'cell-desc deleted-text', deletedText(row));
  } else {
    why = el('td', 'cell-desc', row.reason || '');
    if (row.notes) why.append(el('small', 'muted subline', row.notes));
  }
  // An offline sanction: the player wasn't on the staff's server, so it says nothing about them
  const server = el('td');
  if (row.offline) server.append(el('span', 'muted', '—'));
  else {
    server.append(el('span', '', SERVER_LABELS[row.serverType] || 'Autre'));
    if (row.serverName) server.append(el('small', 'muted subline', row.serverName));
  }
  const when = el('td', 'num', formatTime(row.at));
  when.append(el('small', 'muted subline', formatShortDate(new Date(row.at * 1000))));
  line.append(when, what, who, sanctionStaff(row), why, server);
  return line;
}

function fillSanctions() {
  const body = $('sanctions-rows');
  if (!body) return;
  const searching = sanctionState.found !== null;
  const shown = searching ? sanctionState.found : sanctionState.rows;
  body.replaceChildren(...shown.flatMap(row => sanctionLines(row)));
  const more = $('sanctions-more');
  if (more) more.hidden = searching ? sanctionState.foundDone : sanctionState.done;
  if (!shown.length) {
    const line = el('tr');
    const cell = el('td', 'muted', searching ? (sanctionState.search.trim() ? 'Rien avec cette recherche ._.' : 'Aucune sanction de ce type ._.') : "Aucune sanction reçue pour l'instant ._.");
    cell.colSpan = 6;
    line.append(cell);
    body.append(line);
  }
}

// 5 h, 1 jour, 7 jours, 1j, 12h. Logged bans last one second more than asked, rounding to the minute hides it
function formatBanDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1440) return formatDuration(seconds);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (!hours && !rest) return `${days} ${days > 1 ? 'jours' : 'jour'}`;
  return [`${days}j`, hours && `${hours}h`, rest && `${rest}min`].filter(Boolean).join(', ');
}

function showStaffOnline(total) {
  $('sanctions-online')?.replaceChildren('Staff en ligne: ', el('strong', '', total));
}

async function loadSanctions() {
  stopSanctions();
  const env = tabEnv.sanctions;
  const { rows, staffOnline, types } = await getJson(`/api/sanctions?env=${env}&limit=100`);
  if (currentTab !== 'sanctions' || tabEnv.sanctions !== env) return;
  sanctionState.rows = rows;
  sanctionState.done = rows.length < 100;
  sanctionState.types = types || [];
  if (sanctionState.type && !sanctionState.types.some(type => type.value === sanctionState.type)) sanctionState.type = '';

  const search = input('search', sanctionState.search, { autocomplete: 'off', placeholder: 'léa, ban, insulte' });
  search.addEventListener('input', () => {
    sanctionState.search = search.value;
    clearTimeout(sanctionState.typing);
    sanctionState.typing = setTimeout(() => searchSanctions(env), search.value.trim() ? 250 : 0);
  });
  const searchBox = el('label', 'search', 'Chercher un joueur, un staff, une raison... Sépare avec des virgules pour combiner');
  searchBox.append(search);
  // One kind of sanction only
  const typeSelect = el('select');
  typeSelect.append(new Option('Toutes les sanctions', ''), ...sanctionState.types.map(type => new Option(type.label, type.value)));
  typeSelect.value = sanctionState.type;
  typeSelect.addEventListener('change', () => {
    sanctionState.type = typeSelect.value;
    clearTimeout(sanctionState.typing);
    searchSanctions(env);
  });
  const typeBox = el('label', 'search sanction-type', 'Type de sanction');
  typeBox.append(typeSelect);
  const online = el('div', 'staff-online');
  online.id = 'sanctions-online';
  const top = el('div', 'sanctions-top');
  top.append(searchBox, typeBox, online);

  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Quand', 'Sanction', 'Joueur', 'Staff', 'Raison', 'Serveur']) head.append(el('th', '', name));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  tbody.id = 'sanctions-rows';
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);

  const more = button('Voir les plus anciennes', async () => {
    const searching = sanctionState.found !== null;
    const oldest = (searching ? sanctionState.found : sanctionState.rows).at(-1);
    if (!oldest) return;
    const id = sanctionState.searchId;
    try {
      const older = await getJson(`/api/sanctions?env=${env}&before=${oldest.seq}&limit=100${searching ? sanctionQuery() : ''}`);
      if (id !== sanctionState.searchId) return; // the search changed in the meantime
      if (searching) {
        sanctionState.found.push(...older.rows);
        sanctionState.foundDone = older.done;
      } else {
        sanctionState.rows.push(...older.rows);
        if (older.rows.length < 100) sanctionState.done = true;
      }
      fillSanctions();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
  more.id = 'sanctions-more';

  $('sanctions-body').replaceChildren(top, scroll, more);
  showStaffOnline(staffOnline);
  sanctionState.found = null;
  fillSanctions();
  if (sanctionState.search.trim() || sanctionState.type) searchSanctions(env);

  sanctionState.timer = setInterval(async () => {
    if (document.hidden) return;
    try {
      const after = sanctionState.rows[0]?.seq || 0;
      const fresh = await getJson(`/api/sanctions?env=${env}&after=${after}&limit=100`);
      if (currentTab !== 'sanctions' || tabEnv.sanctions !== env) return;
      showStaffOnline(fresh.staffOnline);
      if (!fresh.rows.length) return;
      sanctionState.rows.unshift(...fresh.rows);
      if (sanctionState.found !== null) {
        const terms = sanctionTerms(sanctionState.search);
        sanctionState.found.unshift(...fresh.rows.filter(row => sanctionMatches(row, terms)));
      }
      // A kind seen for the first time joins the filter
      if (fresh.types && fresh.types.length !== sanctionState.types.length) {
        sanctionState.types = fresh.types;
        const select = $('sanctions-body').querySelector('.sanction-type select');
        if (select) {
          select.replaceChildren(new Option('Toutes les sanctions', ''), ...fresh.types.map(type => new Option(type.label, type.value)));
          select.value = sanctionState.type;
        }
      }
      fillSanctions();
    } catch {
      // Tries again in a few seconds
    }
  }, SANCTION_REFRESH);
}

// ---------------------------------------------------------------- test version -> main game
// Everything edited on these tabs goes to the test place. This bar is the only way to the main game.
function releaseBar(area, release, reload) {
  const box = el('div', release.changes.length ? 'release release-pending' : 'release');
  const act = async (url, done) => {
    try {
      await post(url, {});
      notify(done);
      await reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  if (!release.changes.length) {
    const when = release.publishedAt ? `, publié le ${formatDateTime(release.publishedAt)}` : '';
    box.append(el('p', 'muted', `Le test et le jeu public sont pareils${when} ^^`));
    return box;
  }
  const count = release.changes.length;
  const head = el('div', 'release-head');
  head.append(el('strong', '', `${formatNumber(count)} changement${count > 1 ? 's' : ''} seulement sur la version de test`));
  const actions = el('div', 'member-actions');
  // Each button needs its permission (edit to cancel, publish to publish)
  if (can(`${area}.edit`)) actions.append(confirmButton('Tout annuler', () => act(`/api/${area}/discard`, 'La version de test est revenue comme le jeu public')));
  if (can(`${area}.publish`)) {
    const publish = confirmButton('Publier sur le jeu public', () => act(`/api/${area}/publish`, "C'est publié sur le jeu public <3"));
    publish.className = 'button primary';
    actions.append(publish);
  }
  head.append(actions);
  box.append(head);
  for (const warning of release.warnings) box.append(el('p', 'release-warning', warning));
  const details = el('details', 'sessions');
  details.append(el('summary', '', 'Voir les changements'));
  const list = el('ul', 'release-list');
  for (const change of release.changes) list.append(el('li', '', change));
  details.append(list);
  box.append(details);
  return box;
}

// ---------------------------------------------------------------- AFK zone
const AFK_REWARDS = {
  money: { label: 'Argent', unit: '€' },
  points: { label: "Points d'event", unit: 'points' },
  item: { label: 'Objet', named: 'afk-tools' },
  nametag: { label: 'Nametag', named: 'afk-nametags' },
  vip: { label: 'VIP', unit: 'jours' },
};
const afkState = { icons: {} };

function toLocalInput(unix) {
  const date = new Date(unix * 1000);
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function afkRewardRow(container, entry = {}, onChange) {
  const row = el('div', 'afk-reward');
  const pictureBox = el('div', 'afk-icon');
  const picture = el('img');
  picture.alt = '';
  picture.width = 48;
  picture.height = 48;
  picture.hidden = true;
  pictureBox.append(picture);
  const points = input('number', entry.points ?? '', { min: 0, step: 1, required: true });
  const image = input('text', (entry.image || '').replace('rbxassetid://', ''), { required: true, maxLength: 40, autocomplete: 'off' });
  const text = input('text', entry.name || '', { required: true, maxLength: 80, autocomplete: 'off' });
  const type = el('select');
  for (const [key, spec] of Object.entries(AFK_REWARDS)) type.append(new Option(spec.label, key));
  type.value = entry.reward?.type || 'money';
  const amount = input('number', entry.reward?.amount ?? 1, { min: 1, step: 1, required: true });
  const name = input('text', entry.reward?.name || '', { maxLength: 100, autocomplete: 'off' });
  const nameBox = field('Lequel ?', name);
  const amountBox = field('Quantité', amount);
  const time = el('small', 'muted afk-time');
  const update = () => {
    const spec = AFK_REWARDS[type.value];
    nameBox.hidden = !spec.named;
    name.required = Boolean(spec.named);
    if (spec.named) name.setAttribute('list', spec.named);
    amountBox.hidden = type.value === 'nametag';
    if (type.value === 'nametag') amount.value = 1;
  };
  // The ID alone, whatever was pasted: rbxassetid://1234567, or a link to the asset's page
  const cleanImage = () => {
    const raw = image.value.trim();
    const found = raw.match(/[0-9]{5,20}/);
    return found ? found[0] : raw;
  };
  const showIcon = () => {
    const url = afkState.icons[cleanImage()];
    picture.hidden = !url;
    if (url) picture.src = url;
    else picture.removeAttribute('src');
  };
  type.addEventListener('change', update);
  let iconTimer;
  let iconAsked = 0;
  const askIcon = async () => {
    const asked = ++iconAsked;
    const id = cleanImage();
    if (id !== image.value.trim()) image.value = id;
    showIcon(); // the old picture never stays next to a new ID
    await loadAfkIcons([id]);
    if (asked === iconAsked) showIcon();
  };
  image.addEventListener('input', () => {
    clearTimeout(iconTimer);
    iconTimer = setTimeout(askIcon, 400);
  });
  image.addEventListener('change', () => {
    clearTimeout(iconTimer);
    askIcon();
  });
  points.addEventListener('input', onChange);
  update();
  showIcon();
  const remove = button('✕', () => { row.remove(); onChange(); });
  remove.setAttribute('aria-label', 'Enlever cette récompense');
  const fields = el('div', 'afk-fields');
  fields.append(field('Points', points), field('Image (ID)', image), field('Texte en jeu', text), field('Donne', type), amountBox, nameBox);
  row.append(pictureBox, fields, remove, time);
  row.setTime = value => { time.textContent = value; };
  row.points = () => Number(points.value);
  row.read = () => {
    const reward = { type: type.value, amount: Number(amount.value) };
    if (AFK_REWARDS[type.value].named) reward.name = name.value.trim();
    return { points: Number(points.value), image: cleanImage(), name: text.value.trim(), reward };
  };
  container.append(row);
  return row;
}

async function loadAfkIcons(ids) {
  const wanted = ids.filter(id => id && !afkState.icons[id]);
  if (!wanted.length) return;
  try {
    Object.assign(afkState.icons, await getJson(`/api/afk/icons?ids=${encodeURIComponent(wanted.join(','))}`));
  } catch {
    // The page works without the pictures
  }
}

function afkHours(points, perTick) {
  if (!perTick) return '∞';
  // Two rounds of points every ten minutes
  return formatDuration((Math.ceil(points / perTick) * 300));
}

function afkForm(data, readOnly) {
  const config = readOnly ? data.live : data.draft;
  const form = el('form', 'afk-form');

  const ends = input('datetime-local', toLocalInput(config.eventEnds), { required: true });
  const enabled = input('checkbox', undefined, { checked: config.afkEnabled });
  const enabledBox = el('label', 'check', 'Zone AFK ouverte pendant cet event');
  enabledBox.prepend(enabled);
  const perTick = input('number', config.pointsPerTick, { min: 0, max: 1000, step: 1, required: true });
  const bonus = input('number', config.vipBonus, { min: 0, max: 1000, step: 1, required: true });
  const price = input('number', config.resetPrice, { min: 0, step: 1, required: true });
  const settings = el('div', 'form');
  settings.append(field("Fin de l'event", ends), field('Points toutes les 5 min', perTick), field('En plus avec le VIP', bonus), field('Prix du redémarrage (€)', price), enabledBox);

  const rewards = el('div', 'list');
  const updateTimes = () => {
    for (const row of rewards.children) {
      if (row.setTime) row.setTime(`${afkHours(row.points(), Number(perTick.value))} d'AFK, ${afkHours(row.points(), Number(perTick.value) + Number(bonus.value))} avec le VIP`);
    }
  };
  for (const entry of config.rewards) afkRewardRow(rewards, entry, updateTimes);
  updateTimes();
  perTick.addEventListener('input', updateTimes);
  bonus.addEventListener('input', updateTimes);
  const addReward = button('+ Une récompense', () => { afkRewardRow(rewards, {}, updateTimes); updateTimes(); });

  const tips = el('textarea', 'afk-tips');
  tips.rows = 8;
  tips.value = config.tips.join('\n');
  const tipsBox = field('Une astuce par ligne', tips);

  const save = el('button', 'button', 'Valider sur la version de test');
  save.type = 'submit';

  form.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await post('/api/afk/save', {
        eventEnds: Math.floor(new Date(ends.value).getTime() / 1000),
        afkEnabled: enabled.checked,
        pointsPerTick: Number(perTick.value),
        vipBonus: Number(bonus.value),
        resetPrice: Number(price.value),
        rewards: [...rewards.children].map(row => row.read()),
        tips: tips.value.split('\n'),
      });
      notify('Les changements sont sur la version de test');
      await loadAfk();
    } catch (err) {
      notify(err.message, 'error');
    }
  });

  const parts = [
    el('h3', 'subtitle', 'Réglages'),
    el('p', 'muted note', "C'est la seule date à changer : le jeu, le menu et la zone AFK la lisent tous. Plus besoin de la mettre dans Studio"),
    settings,
    el('h3', 'subtitle', 'Récompenses'), rewards,
    ...(readOnly ? [] : [addReward]),
    el('h3', 'subtitle', 'Astuces'), tipsBox,
    ...(readOnly ? [] : [save]),
  ];
  if (readOnly) {
    const locked = el('fieldset', 'afk-locked');
    locked.disabled = true;
    locked.append(...parts);
    form.append(locked);
  } else {
    form.append(...parts);
  }
  return form;
}

function afkStats(data) {
  const stats = data.stats;
  const config = stats.env === 'test' ? data.draft : data.live;
  const box = el('div');

  const controls = el('h3', 'subtitle', 'Ce qui se passe');

  const eventOn = config.eventEnds > Date.now() / 1000;
  const open = config.afkEnabled && eventOn;
  const tiles = el('div', 'tiles');
  tiles.append(
    tile('Event', eventOn ? 'En cours' : 'Fini', `${eventOn ? "jusqu'au" : 'depuis le'} ${formatDateTime(config.eventEnds)}`),
    tile('Zone AFK', open ? 'Ouverte' : 'Fermée', config.afkEnabled ? "Suit la date de l'event" : 'Pas ouverte pour cet event'),
    tile('Dans la zone en ce moment', formatNumber(stats.online), `${formatNumber(stats.servers)} serveur${stats.servers > 1 ? 's' : ''}`),
    tile(`Joueurs vus, session ${stats.session}`, formatNumber(stats.players)),
    tile('Redémarrages', formatNumber(stats.resets), `à ${formatNumber(config.resetPrice)}€`),
    tile('Trop rapides', formatNumber(stats.fast), 'Plus de 1,5× le maximum possible pendant au moins 1 h'),
  );
  box.append(controls, tiles);

  if (!stats.days.length && !stats.players) {
    box.append(el('p', 'muted', "Rien reçu pour l'instant ._."));
    return box;
  }

  if (stats.days.length) {
    const chart = el('div', 'bars');
    const highest = Math.max(1, ...stats.days.map(day => day.players));
    for (const day of stats.days) {
      const slot = el('div', 'bar-slot');
      const bar = el('div', 'bar');
      bar.style.height = `${day.players ? Math.max(4, (day.players / highest) * 100) : 0}%`;
      slot.append(bar);
      addTip(slot, `${new Date(`${day.day}T12:00:00`).toLocaleDateString('fr-FR')} : ${formatNumber(day.players)} joueurs, ${formatNumber(day.points)} points, ${formatNumber(day.claims)} récompenses`);
      chart.append(slot);
    }
    box.append(el('span', 'muted tile-label', 'Joueurs par jour, sur 30 jours'), chart);
  }

  const claims = new Map(stats.claims.map(row => [row.level, row.n]));
  const levels = new Map(stats.levels.map(row => [row.level, row.players]));
  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Récompense', 'Points', 'Déjà prise', 'Joueurs arrêtés là']) head.append(el('th', '', name));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  config.rewards.forEach((entry, index) => {
    const row = el('tr');
    row.append(el('td', '', entry.name), el('td', 'num', formatNumber(entry.points)), el('td', 'num', formatNumber(claims.get(index + 1) || 0)), el('td', 'num', formatNumber(levels.get(index + 1) || 0)));
    tbody.append(row);
  });
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);
  box.append(scroll);
  return box;
}

async function loadAfk() {
  const data = await getJson(`/api/afk?env=${tabEnv.afk}`);
  const readOnly = tabEnv.afk === 'live' || !can('afk.edit');
  await loadAfkIcons((readOnly ? data.live : data.draft).rewards.map(entry => entry.image.replace('rbxassetid://', '')));
  const newSession = confirmButton(`Nouvelle session (la ${data.draft.session + 1})`, async () => {
    try {
      await post('/api/afk/session', {});
      notify('Nouvelle session sur la version de test. Le jeu public attend ta publication', 'warn');
      await loadAfk();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
  const sessionBox = el('div', 'controls');
  const sessionText = el('p', 'muted note', `Session ${data.draft.session} sur la version de test. Une nouvelle session remet les points et les récompenses de tout le monde à zéro quand ils reviennent`);
  sessionBox.append(sessionText, newSession);
  $('afk-body').replaceChildren(
    releaseBar('afk', data.release, loadAfk),
    el('p', 'muted note', "La date arrive partout en 1 minute. Les joueurs déjà dans la zone gardent leurs récompenses affichées jusqu'au prochain serveur, soit 10 minutes maximum"),
    afkStats(data),
    ...(readOnly ? [] : [sessionBox]),
    dataList('afk-tools', data.tools),
    dataList('afk-nametags', data.nametags),
    afkForm(data, readOnly),
  );
}

// The public economy page: no menu, no account, only the Économie panel
function isPublicEconomyUrl() {
  return location.pathname.replace(/\/+$/, '') === '/economie/public';
}
// The description of the page for the links (Discord, search engines): the numbers change, the words don't
const PUBLIC_DESCRIPTION = "L'économie de School FR en direct : l'argent en circulation, les objets les plus échangés et les joueurs comptés sur nos serveurs Roblox. Mis à jour toutes les secondes.";
function setMeta(selector, attribute, name, content) {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, name);
    document.head.append(tag);
  }
  tag.setAttribute('content', content);
}
function setCanonical(url) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.append(link);
  }
  link.href = url;
}
function startPublicEconomy() {
  publicEconomy = true;
  tabEnv.economy = 'live';
  currentTab = 'economy';
  $('nav').hidden = true;
  $('view-bar').hidden = true;
  document.querySelector('#home .who').hidden = true;
  // The public page has its own head: the title of the page, the live line and the footer
  $('pub-hero').hidden = false;
  $('pub-foot').hidden = false;
  document.body.classList.add('public-page');
  for (const tab of TAB_IDS) $(`tab-${tab}`).hidden = tab !== 'economy';
  document.title = 'Économie de School FR · les chiffres de nos serveurs en direct';
  const url = `${location.origin}/economie/public`;
  setMeta('meta[name="description"]', 'name', 'description', PUBLIC_DESCRIPTION);
  setMeta('meta[property="og:title"]', 'property', 'og:title', 'Économie de School FR');
  setMeta('meta[property="og:description"]', 'property', 'og:description', PUBLIC_DESCRIPTION);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', 'Économie de School FR');
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', PUBLIC_DESCRIPTION);
  setCanonical(url);
  show('home');
  loadEconomy().catch(err => { $('economy-body').textContent = err.message; });
}

// ---------------------------------------------------------------- start
async function start() {
  const params = new URLSearchParams(location.search);
  const problem = LOGIN_ERRORS[params.get('erreur')];
  if (problem) {
    $('login-error').textContent = problem;
    $('login-error').hidden = false;
    history.replaceState(null, '', '/');
  }

  let res;
  try {
    res = await fetch('/api/me');
  } catch {
    if (isPublicEconomyUrl()) return startPublicEconomy();
    $('loading').firstElementChild.textContent = 'Le serveur répond pas, recharge la page';
    return;
  }
  if ((res.status === 401 || res.status === 403) && isPublicEconomyUrl()) return startPublicEconomy();
  // If the server redirected to Discord OAuth (and fetch followed to a non-JSON page), res.ok is true but
  // the content-type is HTML — treat any non-JSON successful response as unauthenticated on the public page.
  if (isPublicEconomyUrl() && res.ok && !res.headers.get('content-type')?.includes('application/json')) return startPublicEconomy();
  if (res.status === 401) {
    // Comes back to the same page once logged in
    try { sessionStorage.setItem('sfr-after-login', location.pathname); } catch { /* it just opens the default page */ }
    return show('login');
  }
  if (res.status === 403) {
    $('login-error').textContent = LOGIN_ERRORS.acces;
    $('login-error').hidden = false;
    return show('login');
  }
  if (!res.ok) {
    if (isPublicEconomyUrl()) return startPublicEconomy();
    $('loading').firstElementChild.textContent = 'Une erreur est survenue, recharge la page';
    return;
  }

  me = await res.json();
  if (isPublicEconomyUrl() && (me.pinRequired || !can('economy.view'))) return startPublicEconomy();
  if (me.pinRequired) {
    $('pin-name').textContent = me.discord.name;
    $('pin-code').value = '';
    $('pin-error').hidden = true;
    show('pin');
    $('pin-code').focus();
    return;
  }
  $('name').textContent = me.discord.name;
  if (me.discord.avatar) {
    $('avatar').src = `https://cdn.discordapp.com/avatars/${me.discord.id}/${me.discord.avatar}.png?size=64`;
    $('avatar').hidden = false;
  }

  const roles = [];
  if (me.owner) roles.push('Propriétaire');
  if (me.conseil) roles.push("Conseil d'Administration");
  if (me.role && !(me.owner && me.role.name.startsWith('Propriétaire'))) roles.push(me.role.name);
  $('role').textContent = roles.join(' · ') || 'Aucun';
  if (me.roblox) {
    $('roblox').textContent = me.roblox.name;
    $('verified').textContent = me.roblox.verifiedAt ? new Date(me.roblox.verifiedAt * 1000).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : 'Avec ton compte Discord';
    $('verified-row').hidden = false;
  } else {
    $('roblox').textContent = 'Pas encore lié';
  }

  $('nav-sanctions').hidden = !can('sanctions.view');
  $('nav-gestion').hidden = !can('gestion.view');
  $('nav-team').hidden = !(can('team.view') || can('team.creators'));
  $('nav-anticheat').hidden = !can('anticheat.view');
  $('nav-economy').hidden = !can('economy.view');
  $('nav-perms').hidden = !me.owner;
  $('nav-shop').hidden = !can('shop.view');
  $('nav-codes').hidden = !can('codes.view');
  $('nav-afk').hidden = !can('afk.view');
  $('nav-texts').hidden = !can('texts.view');
  $('nav').hidden = false;
  show('home');
  try {
    const wanted = sessionStorage.getItem('sfr-after-login');
    sessionStorage.removeItem('sfr-after-login');
    if (wanted && location.pathname === '/' && parseUrl(wanted)) history.replaceState(null, '', wanted);
  } catch { /* it just opens the default page */ }
  followUrl('replace');
  await loadActivity();
}

// ---------------------------------------------------------------- permission points of the admin panel
async function loadPerms() {
  const data = await getJson('/api/perms');
  const root = $('perms-body');
  root.replaceChildren();

  // data.roles is highest first: the last one that reaches the points is the lowest rank that has the action
  const roleFor = points => {
    let found = null;
    for (const role of data.roles) if (role.rank >= points) found = role;
    return found ? `dès ${found.name} (${found.rank})` : 'personne';
  };

  // A custom server's owner and staff get RangServeurCustom / RangGerantServeurCustom as their rank there: only the
  // hierarchy (who can act on whom). Their perms are the ticks of "Staff de serveur custom", apart from the points
  const CUSTOM_RANKS = new Set(['RangServeurCustom', 'RangGerantServeurCustom']);
  let customRank = data.config.perms.RangServeurCustom ?? 50;
  let ownerRank = data.config.perms.RangGerantServeurCustom ?? 51;
  const customHints = [];
  const customText = () => '';
  const customLine = () => `Sur un serveur custom, le gérant (son propriétaire) a le rang ${ownerRank} et ses staffs le rang ${customRank} : ça sert pour la hiérarchie (qui peut agir sur qui), pas pour leurs perms. Leurs perms se choisissent plus bas, dans « Staff de serveur custom ». Un vrai staff qui est aussi staff d'un serveur custom a les deux.`;
  const customInfo = el('p', 'muted', customLine());

  // data.roles is highest first: the first one at or under the points
  const levelOf = points => { const role = data.roles.find(r => r.rank <= points); return role ? `au niveau de ${role.name} (${role.rank})` : 'sous tous les rangs'; };
  root.append(
    el('p', 'muted', `Réglages n°${data.config.version}. Un staff a une action quand les points de son rang atteignent ceux de l'action. Les serveurs suivent dans la minute, sans republier le jeu.`),
    el('p', 'muted', `Rangs : ${data.roles.map(role => `${role.name} ${role.rank}`).join(' · ')}`),
    customInfo,
  );

  const form = el('form', 'form');
  const permInputs = [];
  for (const [action, info] of Object.entries(data.actions)) {
    const label = el('label', '', info.label);
    const input = el('input');
    input.type = 'number';
    input.min = 0;
    input.max = 100;
    input.step = 1;
    input.name = action;
    input.value = data.config.perms[action];
    input.title = `Par défaut : ${info.default}`;
    const hint = el('span', 'muted perms-hint', '');
    const showHint = () => {
      const points = Number(input.value);
      hint.textContent = CUSTOM_RANKS.has(action) ? levelOf(points) : roleFor(points) + customText(action, points);
    };
    showHint();
    customHints.push(showHint);
    input.addEventListener('input', () => {
      if (CUSTOM_RANKS.has(action)) {
        if (action === 'RangServeurCustom') customRank = Number(input.value);
        else ownerRank = Number(input.value);
        customInfo.textContent = customLine();
        for (const update of customHints) update();
      } else showHint();
    });
    label.append(input, hint);
    form.append(label);
    permInputs.push(input);
  }
  root.append(el('h3', 'subtitle', 'Points par action'), form);

  // Custom servers: what their staff and their gérant can do, ticked apart from the points above
  const customNote = data.config.customSaved ? '' : ` Pas encore enregistré : coché d'après les anciens points (rang ${customRank} pour les staffs, ${ownerRank} pour le gérant).`;
  root.append(
    el('h3', 'subtitle', 'Staff de serveur custom'),
    el('p', 'muted', `Ce que les staffs et le gérant d'un serveur custom peuvent faire sur leur serveur, sans rapport avec les points du dessus. Les sanctions de tout le jeu (warn, bans, listes...) n'y sont jamais : seulement le kick et la blacklist de leur serveur.${customNote}`),
  );
  const customBox = el('div', 'perms-custom');
  const customChecks = { staff: [], gerant: [] };
  for (const action of data.customActions) {
    const row = el('div', 'perms-custom-row');
    row.append(el('span', 'perms-label', data.actions[action].label));
    for (const [role, text] of [['staff', 'Staffs'], ['gerant', 'Gérant']]) {
      const box = input('checkbox', undefined, { checked: data.config.custom[role].includes(action) });
      box.dataset.action = action;
      const wrap = el('label', 'check', text);
      wrap.prepend(box);
      row.append(wrap);
      customChecks[role].push(box);
    }
    customBox.append(row);
  }
  root.append(customBox);

  // Temp bans: each line is the longest ban for the staff whose points reach it
  root.append(el('h3', 'subtitle', 'Durée maximale d’un ban temporaire'), el('p', 'muted', 'Un staff utilise la ligne la plus longue que ses points atteignent.'));
  const rows = el('div', 'perms-rows');
  const addRow = (points, days) => {
    const row = el('div', 'perms-row');
    const pointsInput = el('input'); pointsInput.type = 'number'; pointsInput.min = 0; pointsInput.max = 100; pointsInput.step = 1; pointsInput.value = points;
    const daysInput = el('input'); daysInput.type = 'number'; daysInput.min = 0.01; daysInput.max = 365; daysInput.step = 'any'; daysInput.value = days;
    const hint = el('span', 'muted perms-hint', roleFor(Number(points)));
    pointsInput.addEventListener('input', () => { hint.textContent = roleFor(Number(pointsInput.value)); });
    row.append(field('Points', pointsInput), field('Jours max', daysInput), hint, button('Retirer', () => row.remove(), true));
    rows.append(row);
  };
  for (const [points, days] of Object.entries(data.config.banTempoDays).sort((a, b) => Number(a[0]) - Number(b[0]))) addRow(points, days);
  root.append(rows, button('Ajouter une ligne', () => addRow(0, 1)));

  const submit = button('Envoyer aux serveurs', async () => {
    const changes = { perms: {}, banTempoDays: {}, custom: {} };
    for (const input of permInputs) changes.perms[input.name] = Number(input.value);
    for (const [role, boxes] of Object.entries(customChecks)) changes.custom[role] = boxes.filter(box => box.checked).map(box => box.dataset.action);
    for (const row of rows.children) {
      const [pointsInput, daysInput] = row.querySelectorAll('input');
      changes.banTempoDays[Number(pointsInput.value)] = Number(daysInput.value);
    }
    try {
      await post('/api/perms/save', changes);
      notify('Permissions envoyées aux serveurs');
      await loadPerms();
    } catch (err) {
      notify(err.message, 'error');
    }
  });
  const actions = el('div', 'controls');
  actions.append(submit);
  root.append(actions);
  root.append(rankSection(data.site, loadPerms), siteAccessSection(data.site, loadPerms));
}

// ---------------------------------------------------------------- the account: PIN and sessions
// The PIN is asked at each login with this Discord account. A stolen Discord account alone doesn't open the dashboard
const pinInput = (placeholder = '') => input('password', '', { inputMode: 'numeric', maxLength: 6, autocomplete: 'off', placeholder, className: 'pin-field' });

function pinForm({ hasPin }) {
  const form = el('form', 'pin-settings');
  const current = hasPin ? pinInput('Code actuel') : null;
  const next = pinInput('Nouveau code');
  const again = pinInput('Encore une fois');
  if (current) form.append(field('Ton code PIN actuel', current));
  form.append(field(hasPin ? 'Nouveau code PIN (6 chiffres)' : 'Code PIN (6 chiffres)', next), field('Confirme-le', again));
  const submit = el('button', 'button', hasPin ? 'Changer le code' : 'Activer le code PIN');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!/^\d{6}$/.test(next.value)) return notify('Le code PIN doit faire 6 chiffres', 'error');
    if (next.value !== again.value) return notify('Les deux codes sont pas pareils', 'error');
    submit.disabled = true;
    try {
      const answer = await post('/api/pin/set', { pin: next.value, current: current ? current.value : undefined });
      me.hasPin = true;
      notify(answer.revoked ? `Code PIN enregistré, ${answer.revoked} autre${answer.revoked > 1 ? 's' : ''} appareil${answer.revoked > 1 ? 's' : ''} déconnecté${answer.revoked > 1 ? 's' : ''}` : 'Code PIN enregistré');
      await loadSettings();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

function pinRemoveForm() {
  const form = el('form', 'pin-settings');
  const current = pinInput('Code actuel');
  form.append(field('Ton code PIN actuel', current));
  const submit = el('button', 'button danger', 'Désactiver le code PIN');
  submit.type = 'submit';
  form.append(submit);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await post('/api/pin/remove', { current: current.value });
      me.hasPin = false;
      notify('Code PIN désactivé');
      await loadSettings();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

async function loadSettings() {
  const pinBody = $('pin-body');
  pinBody.replaceChildren(
    el('p', 'muted', me.hasPin
      ? 'Ton code PIN est activé : il est demandé à chaque connexion avec ton compte Discord. Le changer ou le retirer déconnecte tes autres appareils.'
      : "Optionnel, mais conseillé : un code à 6 chiffres demandé à chaque connexion. Si quelqu'un met la main sur ton compte Discord, il lui faudra aussi ce code pour ouvrir le dashboard. Après 5 mauvais codes, l'accès se bloque et SchoolBot te prévient en message privé."),
    pinForm({ hasPin: me.hasPin }),
  );
  if (me.hasPin) {
    const remove = el('div', 'pin-remove');
    remove.append(el('h3', 'subtitle', 'Retirer le code PIN'), el('p', 'muted note', "Sans code PIN, ton compte Discord suffit pour ouvrir le dashboard."), pinRemoveForm());
    pinBody.append(remove);
  }

  const data = await getJson('/api/sessions');
  const body = $('sessions-body');
  body.replaceChildren(el('p', 'muted', 'Les navigateurs connectés avec ton compte. Si t\'en reconnais pas un, déconnecte-le, puis change ton mot de passe Discord.'));
  const list = el('div', 'list');
  for (const session of data.sessions) {
    const row = el('div', session.current ? 'session current' : 'session');
    const info = el('div', 'session-info');
    info.append(el('strong', '', session.current ? `${session.where} (cet appareil)` : session.where));
    info.append(el('small', '', `Connecté le ${formatDateTime(session.createdAt)} · vu le ${formatDateTime(session.lastSeen)}${session.ip ? ` · ${session.ip}` : ''}${me.hasPin && !session.unlocked ? ' · code PIN pas encore entré' : ''}`));
    row.append(info);
    if (!session.current) {
      row.append(button('Déconnecter', async () => {
        try {
          await post('/api/sessions/revoke', { id: session.id });
          notify('Appareil déconnecté');
          await loadSettings();
        } catch (err) {
          notify(err.message, 'error');
        }
      }, true));
    }
    list.append(row);
  }
  body.append(list);
  if (data.sessions.length > 1) {
    const all = el('div', 'controls');
    all.style.marginTop = '12px';
    all.append(confirmButton('Déconnecter tous les autres appareils', async () => {
      try {
        const answer = await post('/api/sessions/revoke', {});
        notify(`${answer.revoked} appareil${answer.revoked > 1 ? 's' : ''} déconnecté${answer.revoked > 1 ? 's' : ''}`);
        await loadSettings();
      } catch (err) {
        notify(err.message, 'error');
      }
    }));
    body.append(all);
  }
}

$('pin-form').addEventListener('submit', async event => {
  event.preventDefault();
  const code = $('pin-code');
  const error = $('pin-error');
  error.hidden = true;
  if (!/^\d{6}$/.test(code.value)) {
    error.textContent = 'Erreur : Le code PIN fait 6 chiffres';
    error.hidden = false;
    return;
  }
  try {
    await post('/api/pin/unlock', { pin: code.value });
    show('loading');
    await start();
  } catch (err) {
    error.textContent = `Erreur : ${err.message}`;
    error.hidden = false;
    code.value = '';
    code.classList.remove('shake');
    void code.offsetWidth;
    code.classList.add('shake');
    code.focus();
  }
});
async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  location.href = '/';
}
$('pin-logout').addEventListener('click', logout);

for (const tab of TAB_IDS) {
  $(`nav-${tab}`).addEventListener('click', () => openTab(tab));
}
window.addEventListener('popstate', () => { if (me) followUrl('none'); });
$('logout').addEventListener('click', logout);

start();

// ---------------------------------------------------------------- site permissions (Permissions tab, owner only)
// The rank points of each role: what the game gets with the staff list
function rankSection(site, reload) {
  const box = el('div', 'perms-site');
  box.append(
    el('h3', 'subtitle', 'Points des rangs'),
    el('p', 'muted', "Les points que chaque rang a en jeu. Les serveurs suivent dans la minute, avec la liste du staff. Ton rang (le premier) garde toujours le plus de points."),
  );
  const form = el('form', 'form');
  const inputs = [];
  for (const role of site.roles) {
    const value = input('number', role.rank, { min: 0, max: 100, step: 1, name: role.id, title: `Par défaut : ${role.defaultRank}` });
    const label = field(role.name, value);
    if (role.rank !== role.defaultRank) label.append(el('span', 'muted perms-hint', `par défaut ${role.defaultRank}`));
    form.append(label);
    inputs.push(value);
  }
  box.append(form, button('Enregistrer les points', async () => {
    const ranks = Object.fromEntries(inputs.map(value => [value.name, Number(value.value)]));
    try {
      await post('/api/perms/ranks', { ranks });
      notify('Points des rangs envoyés aux serveurs');
      await reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  }));
  return box;
}

// Who opens each tab of the site and does each sensitive thing
function siteAccessSection(site, reload) {
  const box = el('div', 'perms-site');
  box.append(
    el('h3', 'subtitle', 'Accès au site'),
    el('p', 'muted', "Pour chaque chose : à partir de quel rang du serveur staff, et si le Conseil d'administration l'a aussi. Toi, t'as toujours tout, et l'onglet Permissions reste à toi seul."),
  );
  const rows = [];
  let group = null;
  for (const perm of site.perms) {
    if (perm.group !== group) {
      group = perm.group;
      box.append(el('h4', 'perms-group', group));
    }
    const row = el('div', 'perms-access');
    const min = el('select');
    min.append(new Option("Personne d'autre que toi", ''), ...site.roles.map(role => new Option(`dès ${role.name}`, role.id)));
    min.value = perm.rule.min || '';
    const conseil = input('checkbox', undefined, { checked: perm.rule.conseil });
    const conseilBox = el('label', 'check', 'Conseil');
    conseilBox.prepend(conseil);
    const isDefault = () => (min.value || null) === perm.default.min && conseil.checked === perm.default.conseil;
    const mark = el('span', 'muted perms-hint', '');
    const update = () => { mark.textContent = isDefault() ? '' : 'modifié'; };
    min.addEventListener('change', update);
    conseil.addEventListener('change', update);
    update();
    row.append(el('span', 'perms-label', perm.label), min, conseilBox, mark);
    box.append(row);
    rows.push({ key: perm.key, min, conseil });
  }
  box.append(button('Enregistrer les accès', async () => {
    const rules = Object.fromEntries(rows.map(row => [row.key, { min: row.min.value || null, conseil: row.conseil.checked }]));
    try {
      await post('/api/perms/site', { rules });
      notify("Accès enregistrés : ça s'applique tout de suite");
      await reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  }));
  return box;
}

// ---------------------------------------------------------------- Gestion: one player's save, like the Gestion of the panel in game
const gestionState = { query: '', data: null, view: 'sanctions', txFilter: 'all', txSearch: '', sanctionSearch: '', icons: {}, loading: false };

function chip(text, kind = '') {
  return el('span', `gestion-chip ${kind}`.trim(), text);
}

async function loadGestionIcons(ids) {
  const wanted = [...new Set(ids)].filter(id => id && !(id in gestionState.icons));
  for (let i = 0; i < wanted.length; i += 20) {
    const part = wanted.slice(i, i + 20);
    try {
      Object.assign(gestionState.icons, await getJson(`/api/gestion/icons?ids=${part.join(',')}`));
    } catch { /* the names stay without a picture */ }
    for (const id of part) if (!(id in gestionState.icons)) gestionState.icons[id] = null;
  }
}

function nametagPicture(name) {
  const image = gestionState.data?.nametagImages?.[name];
  const url = image && gestionState.icons[image];
  const picture = el('div', 'gestion-tag-picture');
  if (url) {
    const img = el('img');
    img.src = url;
    img.alt = '';
    img.loading = 'lazy';
    picture.append(img);
  }
  return picture;
}

// A player's name that searches them when clicked
function playerLink(id, name) {
  const link = el('button', 'link-button', name ? `@${name}` : `#${id}`);
  link.type = 'button';
  link.title = 'Voir sa gestion';
  link.addEventListener('click', () => searchGestion(name || `id:${id}`));
  return link;
}

async function searchGestion(query) {
  const text = String(query || '').trim();
  if (!text || gestionState.loading) return;
  gestionState.loading = true;
  gestionState.query = text;
  const input = $('gestion-search');
  if (input) input.value = text;
  $('gestion-result').replaceChildren(el('p', 'muted', 'Ça charge...'));
  try {
    const res = await fetch(`/api/gestion?user=${encodeURIComponent(text)}&env=${tabEnv.gestion}`);
    const answer = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(answer.error || 'Une erreur est survenue, réessaye');
    gestionState.data = answer;
    gestionState.editing = false;
    if (!answer.inventory && gestionState.view === 'inventory') gestionState.view = 'sanctions';
    gestionState.txFilter = 'all';
    gestionState.txSearch = '';
    gestionState.sanctionSearch = '';
    await loadGestionIcons(Object.values(answer.nametagImages || {}));
    renderGestion();
  } catch (err) {
    gestionState.data = null;
    $('gestion-result').replaceChildren(el('p', 'muted', `Erreur : ${err.message}`));
  } finally {
    gestionState.loading = false;
  }
}

async function loadGestion() {
  const root = $('gestion-body');
  if (root.dataset.ready === tabEnv.gestion) return;
  const again = root.dataset.ready && gestionState.query;
  root.dataset.ready = tabEnv.gestion;
  gestionState.data = null;
  const form = el('form', 'gestion-search');
  const query = input('text', '', { id: 'gestion-search', placeholder: 'Pseudo Roblox', maxLength: 40, autocomplete: 'off', required: true });
  const go = el('button', 'button primary', 'Chercher');
  go.type = 'submit';
  form.append(query, go);
  form.addEventListener('submit', event => {
    event.preventDefault();
    searchGestion(query.value);
  });
  const result = el('div', 'gestion-result');
  result.id = 'gestion-result';
  root.replaceChildren(form, result);
  $('gestion-result').append(el('p', 'muted', `Cherche un joueur pour voir sa gestion : sanctions, listes, nom RP... Les infos viennent de sa sauvegarde du jeu ${tabEnv.gestion === 'test' ? 'de test' : 'public'}.`));
  if (again) searchGestion(gestionState.query); // same player, other version
}

function gestionHeader(data) {
  const { user, info } = data;
  const head = el('div', 'gestion-head');
  const avatar = el('div', 'gestion-avatar');
  if (user.avatar) {
    const img = el('img');
    img.src = user.avatar;
    img.alt = '';
    avatar.append(img);
  }
  const who = el('div', 'gestion-who');
  const title = el('div', 'gestion-name');
  title.append(el('strong', '', info.rpName || user.displayName || user.name), el('span', 'muted', ` @${user.name}`));
  const status = data.online ? chip('En jeu', 'ok') : chip(info.lastSeen ? `Hors ligne depuis le ${formatDateTime(info.lastSeen)}` : 'Hors ligne');
  const chips = el('div', 'gestion-chips');
  chips.append(status);
  // Banned by Roblox from every place of the game (custom servers too), not just the free access ban of the save
  const global = info.globalBan;
  if (global?.active) {
    const banned = chip(global.until ? `Ban global jusqu'au ${formatDateTime(global.until)}` : 'Ban global', 'danger');
    banned.title = global.source === 'roblox'
      ? `Banni par Roblox de tout le jeu${global.since ? ` depuis le ${formatDateTime(global.since)}` : ''}`
      : "D'après la raison de son ban : c'est une de celles qui bannissent de tout le jeu";
    chips.append(banned);
  }
  if (info.ban.perm && !global?.active) chips.append(chip('Ban perm', 'danger'));
  else if (info.ban.until > Date.now() / 1000) chips.append(chip(`Ban temp jusqu'au ${formatDateTime(info.ban.until)}`, 'danger'));
  if (info.lists.surveillance) chips.append(chip('Liste surveillance', 'warn'));
  if (info.lists.rouge) chips.append(chip('Liste rouge', 'danger'));
  if (info.lists.noire) chips.append(chip('Liste noire', 'dark'));
  if (info.colle > 0) chips.append(chip(`En colle (${info.colle} min)`, 'warn'));
  for (const ban of info.roleBans) chips.append(chip(`Rôle ${ban.role} bloqué jusqu'à ${formatDateTime(ban.until)}`, 'warn'));
  who.append(title, chips);
  const facts = el('div', 'gestion-facts');
  const fact = (label, value) => {
    const box = el('div', 'gestion-fact');
    box.append(el('span', 'muted', label), el('strong', '', value));
    return box;
  };
  facts.append(fact('Temps joué', `${formatNumber(info.timePlayed)} min`), fact('Sanctions', formatNumber(data.sanctions.filter(entry => !entry.deleted).length)));
  if (info.created) facts.append(fact('Première connexion', formatShortDate(new Date(info.created * 1000))));
  if (info.ticketsResolved) facts.append(fact('Tickets résolus', formatNumber(info.ticketsResolved)));
  if (info.anticheatKicks) facts.append(fact('Kicks Anticheat', formatNumber(info.anticheatKicks)));
  head.append(avatar, who, facts);
  const extra = [];
  if (info.ban.reason && (info.ban.perm || info.ban.until > Date.now() / 1000)) extra.push(el('p', 'gestion-note', `Raison du ban : ${info.ban.reason}`));
  if (info.globalBan?.active && info.globalBan.reason && info.globalBan.reason !== info.ban.reason) extra.push(el('p', 'gestion-note', `Raison du ban global : ${info.globalBan.reason}`));
  if (info.warn) extra.push(el('p', 'gestion-note', `Warn en cours : ${info.warn}`));
  return [head, ...extra];
}

// ---------------------------------------------------------------- one sanction, opened by a click (Sanctions tab and Gestion)
const openSanctions = new Set(); // the rows open right now: they stay open when the list refreshes
const sanctionKey = row => `${row.seq || 0}|${row.at}|${row.type}|${row.user}|${row.staff}`;

// Only what the row above doesn't already show
function sanctionDetails(row) {
  const line = el('tr', 'sanction-details');
  const cell = el('td');
  cell.colSpan = 6;
  const grid = el('div', 'sanction-detail-grid');
  const add = (label, value) => {
    if (value === null || value === undefined || value === '') return;
    const item = el('div', 'sanction-detail');
    item.append(el('span', 'muted', label), el('span', '', String(value)));
    grid.append(item);
  };
  if (row.deleted) {
    add('Raison', row.reason);
    add('Notes', row.notes);
    add('Supprimée le', row.deleted.at ? formatDateTime(row.deleted.at) : null);
  }
  if (row.duration && row.at) add('Fin', formatDateTime(row.at + row.duration));
  add('Rôle à ce moment', row.role);
  add('Temps de jeu à ce moment', Number.isFinite(row.timePlayed) ? `${formatNumber(row.timePlayed)} min` : null);
  cell.append(grid.children.length ? grid : el('p', 'muted', 'Rien de plus que ce qui est au-dessus'));
  line.append(cell);
  return line;
}

// A sanction row that opens its details below it. decorate changes the row before it's shown (Gestion)
function sanctionLines(row, decorate) {
  const line = sanctionRow(row);
  if (decorate) decorate(line);
  line.classList.add('sanction-row');
  line.title = 'Clique pour voir tous les détails';
  const key = sanctionKey(row);
  line.addEventListener('click', event => {
    if (event.target.closest('a, button')) return;
    const next = line.nextElementSibling;
    if (next?.classList.contains('sanction-details')) {
      next.remove();
      openSanctions.delete(key);
      line.classList.remove('sanction-open');
    } else {
      line.after(sanctionDetails(row));
      openSanctions.add(key);
      line.classList.add('sanction-open');
    }
  });
  if (!openSanctions.has(key)) return [line];
  line.classList.add('sanction-open');
  return [line, sanctionDetails(row)];
}

// Roblox's record of the bans from the whole game and the unbans, as sanction rows. Done by "School Bot": the bot of the
// game, the one that will ban from the whole game from the site and in game later. The in-game Gestion shows the same
function globalBanRows(data) {
  return (Array.isArray(data.banHistory) ? data.banHistory : []).map((row, index) => ({
    seq: `global-${index}`,
    at: row.at || 0,
    type: row.ban ? (row.duration ? 'Ban global temporaire' : 'Ban global') : 'Déban global',
    duration: row.ban ? row.duration : null,
    reason: row.reason || (row.ban ? 'Ban sans raison' : 'Débanni'),
    notes: row.privateReason || null,
    user: data.user.name,
    rpName: data.info.rpName || null,
    staffDiscord: 'School Bot',
    globalBan: true,
  }));
}

// The same table as the Sanctions tab, for this player only. A sanction deleted in game stays, shown as in game.
// The global bans (Roblox) are among them by date
function gestionSanctions(data) {
  const all = [...data.sanctions, ...globalBanRows(data)].sort((a, b) => (b.at || 0) - (a.at || 0));
  const box = el('div', '');
  const search = input('search', gestionState.sanctionSearch, { autocomplete: 'off', placeholder: 'ban, insulte, un staff' });
  const searchBox = el('label', 'search', 'Chercher une sanction, un staff, une raison... Clique sur une ligne pour tout voir');
  searchBox.append(search);
  const top = el('div', 'sanctions-top');
  top.append(searchBox);
  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Quand', 'Sanction', 'Joueur', 'Staff', 'Raison', 'Serveur']) head.append(el('th', '', name));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);
  const plain = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const fill = () => {
    gestionState.sanctionSearch = search.value;
    const terms = search.value.split(',').map(part => plain(part.trim()).replace(/^@/, '')).filter(Boolean);
    const rows = all.filter(row => terms.every(term => [row.type, row.reason, row.notes, row.staff, row.staffDiscord, row.rpName, row.role, row.serverName, deletedText(row)].some(value => plain(value).includes(term))));
    tbody.replaceChildren(...rows.flatMap(row => sanctionLines(row, line => {
      if (!row.serverType) line.lastElementChild.replaceChildren(el('span', 'muted', '—'));
    })));
    if (!rows.length) {
      const line = el('tr');
      const cell = el('td', 'muted', all.length ? 'Rien avec cette recherche ._.' : 'Aucune sanction, il est clean ^^');
      cell.colSpan = 6;
      line.append(cell);
      tbody.append(line);
    }
  };
  search.addEventListener('input', fill);
  fill();
  box.append(top, scroll);
  return box;
}

// Roblox's record of the bans from the whole game (BanAsync, or by hand on the Creator Hub) and the unbans. The in-game
// Gestion shows the same rows among the sanctions
function gestionBanHistory(data) {
  const box = el('div', '');
  box.append(el('p', 'muted', 'Les bans de tout le jeu chez Roblox (serveurs custom compris). Les blocages de 30 s après un kick ne sont pas listés.'));
  const table = el('table', 'table');
  const head = el('tr');
  for (const name of ['Quand', 'Action', 'Durée', 'Raison', 'Par']) head.append(el('th', '', name));
  const thead = el('thead');
  thead.append(head);
  const tbody = el('tbody');
  const duration = seconds => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return [days && `${days} j`, hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ') || `${seconds} s`;
  };
  for (const row of data.banHistory) {
    const line = el('tr');
    const action = el('td');
    action.append(chip(row.ban ? 'Ban global' : 'Déban', row.ban ? 'danger' : 'ok'));
    line.append(
      el('td', '', row.at ? formatDateTime(row.at) : '?'),
      action,
      el('td', '', row.ban ? (row.duration ? duration(row.duration) : 'Permanent') : '—'),
      el('td', '', [row.reason, row.privateReason && `(note privée : ${row.privateReason})`].filter(Boolean).join(' ') || '—'),
      el('td', 'muted', row.by === 'creator' ? 'À la main (Creator Hub)' : 'Le jeu'),
    );
    tbody.append(line);
  }
  if (!data.banHistory.length) {
    const line = el('tr');
    const cell = el('td', 'muted', 'Jamais banni de tout le jeu ^^');
    cell.colSpan = 5;
    line.append(cell);
    tbody.append(line);
  }
  table.append(thead, tbody);
  const scroll = el('div', 'table-scroll');
  scroll.append(table);
  box.append(scroll);
  return box;
}

// What one side of a trade put in: nametags with their picture, objects, money
function tradeSideBox(title, side) {
  const box = el('div', 'trade-side');
  box.append(el('h4', '', title));
  const list = el('div', 'trade-items');
  if (side.cash) list.append(el('div', 'trade-item trade-cash', `${formatNumber(side.cash)} €`));
  for (const tag of side.nametags) {
    const item = el('div', 'trade-item');
    item.append(nametagPicture(tag.name), el('span', '', `${tag.name}${tag.count > 1 ? ` ×${tag.count}` : ''}`));
    list.append(item);
  }
  for (const thing of side.items) list.append(el('div', 'trade-item', `${thing.name}${thing.count > 1 ? ` ×${thing.count}` : ''}`));
  if (!list.children.length) list.append(el('span', 'muted', 'Rien'));
  box.append(list);
  return box;
}

function transactionCard(entry) {
  const card = el('div', `tx tx-${entry.type}`);
  const head = el('div', 'tx-head');
  const who = entry.other ? playerLink(entry.other, entry.otherName) : el('span', '');
  const line = el('div', 'tx-line');
  if (entry.type === 'payment') {
    line.append(chip('Paiement', entry.gave ? 'warn' : 'ok'), el('span', '', entry.gave ? `A payé ${formatNumber(entry.amount)} € à ` : `A reçu ${formatNumber(entry.amount)} € de `), who);
  } else if (entry.type === 'give') {
    line.append(chip('Don', entry.gave ? 'warn' : 'ok'), el('span', '', `${entry.gave ? 'A donné' : 'A reçu'} ${entry.item || 'un objet'}${entry.amount > 1 ? ` ×${entry.amount}` : ''} ${entry.gave ? 'à ' : 'de '}`), who);
  } else if (entry.type === 'admin') {
    line.append(chip('Modif staff', 'warn'), el('span', '', `Changé depuis le dashboard${entry.staff ? ` par ${entry.staff}` : ''}`));
  } else if (entry.type === 'trade') {
    line.append(chip('Trade'), el('span', '', 'Trade avec '), who);
  } else {
    line.append(chip(entry.label || 'Autre'), el('span', '', 'avec '), who);
  }
  head.append(line, el('span', 'muted', entry.date ? formatDateTime(entry.date) : ''));
  card.append(head);
  if (entry.type === 'admin') {
    const list = el('div', 'trade-items');
    for (const part of describeEdit(entry.changes)) list.append(el('div', 'trade-item', part));
    card.append(list);
  }
  if (entry.type === 'trade') {
    if (entry.unreadable) card.append(el('p', 'muted', 'Contenu illisible'));
    else {
      const sides = el('div', 'trade-sides');
      sides.append(tradeSideBox('A donné', entry.gave), el('div', 'trade-arrow', '⇄'), tradeSideBox('A reçu', entry.got));
      card.append(sides);
    }
  }
  // A click opens what the card doesn't show. Stays open when the list is filtered
  const key = `${entry.date}|${entry.type}|${entry.other}|${entry.item || ''}|${entry.amount || ''}`;
  card.classList.add('tx-clickable');
  card.title = 'Clique pour voir les détails';
  const toggle = open => {
    card.querySelector('.tx-details')?.remove();
    card.classList.toggle('tx-open', open);
    if (open) card.append(transactionDetails(entry));
  };
  card.addEventListener('click', event => {
    if (event.target.closest('a, button, .tx-details')) return;
    const open = !openTransactions.has(key);
    if (open) openTransactions.add(key); else openTransactions.delete(key);
    toggle(open);
  });
  if (openTransactions.has(key)) toggle(true);
  return card;
}

const openTransactions = new Set();
// How long ago, in words: il y a 3 jours, il y a 2 h...
function sinceText(unix) {
  const seconds = Math.max(0, Date.now() / 1000 - unix);
  if (seconds < 3600) return `il y a ${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `il y a ${Math.round(seconds / 3600)} h`;
  const days = Math.round(seconds / 86400);
  return days < 60 ? `il y a ${days} jour${days > 1 ? 's' : ''}` : `il y a ${Math.round(days / 30)} mois`;
}

// Only what the card doesn't already show
function transactionDetails(entry) {
  const box = el('div', 'tx-details');
  const grid = el('div', 'sanction-detail-grid');
  const add = (label, ...value) => {
    const item = el('div', 'sanction-detail');
    const shown = el('span', '');
    shown.append(...value);
    item.append(el('span', 'muted', label), shown);
    grid.append(item);
  };
  if (entry.date) add('Il y a', sinceText(entry.date).replace(/^il y a /, ''));
  if (entry.otherName) {
    const name = el('span', '', entry.otherDisplayName && entry.otherDisplayName !== entry.otherName ? `${entry.otherDisplayName} (@${entry.otherName})` : `@${entry.otherName}`);
    add("L'autre joueur", name, copyButton(entry.otherName));
  }
  if (entry.type === 'trade' && !entry.unreadable) {
    const things = side => side.items.reduce((total, item) => total + item.count, 0) + side.nametags.reduce((total, tag) => total + tag.count, 0);
    const balance = entry.got.cash - entry.gave.cash;
    if (entry.gave.cash || entry.got.cash) add('Argent au final', `${balance > 0 ? '+' : ''}${formatNumber(balance)} €`);
    add('Objets et nametags', `${things(entry.gave)} donnés, ${things(entry.got)} reçus`);
  }
  box.append(grid);
  return box;
}

function gestionTransactions(data) {
  const box = el('div', '');
  const bar = el('div', 'controls');
  const filters = el('div', 'segment');
  const labels = { all: 'Tout', trade: 'Trades', give: 'Dons', payment: 'Paiements' };
  if (data.transactions.some(entry => entry.type === 'admin')) labels.admin = 'Modifs staff';
  const list = el('div', 'tx-list');
  const search = input('search', gestionState.txSearch, { placeholder: 'Chercher un joueur, un objet, un nametag...', autocomplete: 'off' });
  const fill = () => {
    const word = search.value.trim().toLowerCase();
    gestionState.txSearch = search.value;
    const words = entry => [entry.otherName, entry.item, ...(entry.type === 'trade' ? [...entry.gave.items, ...entry.gave.nametags, ...entry.got.items, ...entry.got.nametags].map(thing => thing.name) : [])];
    const rows = data.transactions.filter(entry => (gestionState.txFilter === 'all' || entry.type === gestionState.txFilter)
      && (!word || words(entry).some(value => value && value.toLowerCase().includes(word))));
    list.replaceChildren(...(rows.length ? rows.slice(0, 200).map(transactionCard) : [el('p', 'muted', 'Rien ici')]));
    if (rows.length > 200) list.append(el('p', 'muted', `Et ${rows.length - 200} de plus, cherche pour les trouver`));
  };
  for (const [key, label] of Object.entries(labels)) {
    const count = key === 'all' ? data.transactions.length : data.transactions.filter(entry => entry.type === key).length;
    const option = el('button', key === gestionState.txFilter ? 'segment-on' : '', `${label} (${count})`);
    option.type = 'button';
    option.addEventListener('click', () => {
      gestionState.txFilter = key;
      for (const other of filters.children) other.classList.toggle('segment-on', other === option);
      fill();
    });
    filters.append(option);
  }
  search.addEventListener('input', fill);
  bar.append(filters, search);
  fill();
  box.append(el('p', 'muted', 'Les 300 dernières transactions de ce joueur, les plus récentes en haut. Clique sur un pseudo pour voir sa gestion.'), bar, list);
  return box;
}

// ---------------------------------------------------------------- editing money and inventory (gestion.edit)
// Only the differences are sent: what the player earns or spends in the meantime is kept
function gestionInventoryEditor(data) {
  const inv = data.inventory;
  const box = el('div', 'inv-editor');
  box.append(el('p', 'muted', `Change les valeurs puis envoie. Si ${data.user.name} est en jeu, son serveur le fait tout de suite. Sinon, un serveur modifie sa sauvegarde, en général dans la minute.`));
  const lists = data.catalog || { tools: [], nametags: [] };
  box.append(dataList('inv-tools', lists.tools), dataList('inv-nametags', lists.nametags));

  const money = el('div', 'form');
  const moneyInputs = {};
  for (const [key, label] of [['cash', 'Argent (€)'], ['casierCash', 'Casier (€)'], ['eventPoints', "Points d'event"], ['timePlayed', 'Temps joué (min)']]) {
    inv[key] ??= 0; // a site older than the save reader: nothing to compare with
    const value = input('number', inv[key], { min: 0, step: 1 });
    moneyInputs[key] = value;
    const box_ = field(label, value);
    value.addEventListener('input', () => box_.classList.toggle('inv-changed', Number(value.value) !== inv[key]));
    money.append(box_);
  }
  box.append(money);

  const editors = {};
  const listEditor = (key, title, things, listId) => {
    const section = el('div', 'inv-edit-section');
    section.append(el('h4', 'perms-group', title));
    const rows = el('div', 'inv-edit-rows');
    const entries = new Map();
    const addRow = (name, original) => {
      if (entries.has(name)) return entries.get(name);
      const row = el('div', 'inv-edit-row');
      if (key === 'nametags') row.append(nametagPicture(name));
      const count = input('number', original, { min: 0, max: 10000, step: 1 });
      const mark = () => row.classList.toggle('inv-changed', Number(count.value) !== original);
      const minus = button('−', () => { count.value = Math.max(0, Number(count.value) - 1); mark(); });
      const plus = button('+', () => { count.value = Number(count.value) + 1; mark(); });
      count.addEventListener('input', mark);
      row.append(el('span', 'inv-edit-name', name), minus, count, plus);
      rows.append(row);
      const entry = { original, input: count, mark };
      entries.set(name, entry);
      return entry;
    };
    for (const thing of things) addRow(thing.name, thing.count);
    const adder = el('form', 'inv-edit-add');
    const name = input('text', '', { placeholder: key === 'nametags' ? 'Ajouter un nametag' : 'Ajouter un objet', maxLength: 100, autocomplete: 'off' });
    name.setAttribute('list', listId);
    const add = el('button', 'button', 'Ajouter');
    add.type = 'submit';
    adder.append(name, add);
    adder.addEventListener('submit', event => {
      event.preventDefault();
      const value = name.value.trim();
      if (!value) return;
      const entry = addRow(value, 0);
      entry.input.value = Math.max(1, Number(entry.input.value));
      entry.mark();
      name.value = '';
    });
    section.append(rows, adder);
    editors[key] = entries;
    return section;
  };
  box.append(listEditor('items', 'Inventaire', inv.items, 'inv-tools'), listEditor('stored', 'Casier', inv.stored, 'inv-tools'), listEditor('nametags', 'Nametags', inv.nametags, 'inv-nametags'));

  const send = button('Envoyer au jeu', async () => {
    const changes = {};
    for (const [key, value] of Object.entries(moneyInputs)) {
      const delta = Math.max(0, Math.round(Number(value.value) || 0)) - inv[key];
      if (delta) changes[key] = delta;
    }
    for (const [key, entries] of Object.entries(editors)) {
      const list = {};
      for (const [name, entry] of entries) {
        const delta = Math.max(0, Math.round(Number(entry.input.value) || 0)) - entry.original;
        if (delta) list[name] = delta;
      }
      if (Object.keys(list).length) changes[key] = list;
    }
    if (!Object.keys(changes).length) return notify('Rien à changer', 'error');
    try {
      const answer = await post('/api/gestion/edit', { env: tabEnv.gestion, userId: data.user.id, userName: data.user.name, changes });
      gestionState.editing = false;
      renderGestion();
      waitForEdit(answer.id, data.user.id);
    } catch (err) {
      notify(err.message, 'error');
    }
  });
  send.className = 'button primary';
  const actions = el('div', 'controls');
  actions.append(send, button('Annuler', () => { gestionState.editing = false; renderGestion(); }));
  box.append(actions);
  return box;
}

// Waits for the game to do it, then shows the new values (the save itself is written by the game a bit later)
async function waitForEdit(id, userId) {
  notify('Envoyé au jeu, en attente d’un serveur...');
  const until = Date.now() + 150000;
  while (Date.now() < until) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    let state;
    try { state = await getJson(`/api/gestion/edit?id=${encodeURIComponent(id)}`); } catch { continue; }
    if (state.status === 'done') {
      notify(state.mode === 'online' ? 'C’est fait en jeu, en direct <3' : 'C’est fait sur sa sauvegarde <3');
      const data = gestionState.data;
      if (data?.user.id === userId && state.result) {
        Object.assign(data.inventory, state.result.money || {});
        if (Number.isFinite(state.result.money?.timePlayed)) data.info.timePlayed = state.result.money.timePlayed;
        for (const key of ['items', 'stored', 'nametags']) {
          const values = state.result[key];
          if (!values) continue;
          const list = new Map(data.inventory[key].map(thing => [thing.name, thing.count]));
          for (const [name, count] of Object.entries(values)) list.set(name, count);
          data.inventory[key] = [...list].filter(([, count]) => count > 0).map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        }
        renderGestion();
      }
      return;
    }
    if (state.status === 'failed') return notify(`Le jeu n'a pas pu le faire : ${state.error || 'erreur inconnue'}`, 'error');
  }
  notify("Toujours en attente : aucun serveur ne l'a pris. Le jeu a-t-il la mise à jour ?", 'error');
}

// "+500 €", "Rose +2"... for a staff edit in the transactions
function describeEdit(changes) {
  const parts = [];
  const signed = value => `${value > 0 ? '+' : ''}${formatNumber(value)}`;
  if (changes?.cash) parts.push(`${signed(changes.cash)} €`);
  if (changes?.casierCash) parts.push(`Casier ${signed(changes.casierCash)} €`);
  if (changes?.eventPoints) parts.push(`${signed(changes.eventPoints)} points d'event`);
  if (changes?.timePlayed) parts.push(`${signed(changes.timePlayed)} min de temps de jeu`);
  for (const [key, label] of [['items', ''], ['stored', 'Casier : '], ['nametags', 'Nametag ']]) {
    for (const [name, delta] of Object.entries(changes?.[key] || {})) parts.push(`${label}${name} ${signed(delta)}`);
  }
  return parts;
}

function gestionInventory(data) {
  if (gestionState.editing && can('gestion.edit')) return gestionInventoryEditor(data);
  const inv = data.inventory;
  const box = el('div', '');
  const tiles = el('div', 'gestion-tiles');
  const tile = (label, value) => {
    const item = el('div', 'gestion-fact');
    item.append(el('span', 'muted', label), el('strong', '', value));
    return item;
  };
  tiles.append(tile('Argent', `${formatNumber(inv.cash)} €`), tile('Casier', `${formatNumber(inv.casierCash)} €`), tile("Points d'event", formatNumber(inv.eventPoints)), tile("Points d'event (total)", formatNumber(inv.totalEventPoints)));
  if (inv.donation) tiles.append(tile('Dons Robux', formatNumber(inv.donation)));
  // A VIP for life is saved with an end date far away (past what a date can show)
  const vipText = inv.vipUntil <= Date.now() / 1000 ? 'Non' : inv.vipUntil > 4102444800 ? 'À vie' : `jusqu'au ${formatShortDate(new Date(inv.vipUntil * 1000))}`;
  tiles.append(tile('VIP', vipText));
  const grid = (title, things, pictures) => {
    const section = el('div', '');
    section.append(el('h4', 'perms-group', `${title} (${things.length})`));
    const list = el('div', 'trade-items');
    for (const thing of things) {
      const item = el('div', 'trade-item');
      if (pictures) item.append(nametagPicture(thing.name));
      item.append(el('span', '', `${thing.name}${thing.count > 1 ? ` ×${thing.count}` : ''}`));
      list.append(item);
    }
    if (!things.length) list.append(el('span', 'muted', 'Rien'));
    section.append(list);
    return section;
  };
  if (can('gestion.edit')) {
    const edit = button('Modifier', () => { gestionState.editing = true; renderGestion(); });
    const bar = el('div', 'controls');
    bar.append(el('span', 'muted', tabEnv.gestion === 'test' ? 'Jeu de test' : 'Jeu public'), edit);
    box.append(bar);
  }
  box.append(tiles, grid('Inventaire', inv.items), grid('Casier', inv.stored), grid('Nametags', inv.nametags, true));
  return box;
}

function renderGestion() {
  const data = gestionState.data;
  const root = $('gestion-result');
  if (!data) return;
  const views = { sanctions: `Sanctions (${data.sanctions.length + globalBanRows(data).length})` };
  if (data.transactions) views.transactions = `Transactions (${data.transactions.length})`;
  if (data.inventory) views.inventory = 'Inventaire et argent';
  if (!(gestionState.view in views)) gestionState.view = 'sanctions';
  const tabs = el('div', 'segment');
  for (const [key, label] of Object.entries(views)) {
    const option = el('button', key === gestionState.view ? 'segment-on' : '', label);
    option.type = 'button';
    option.addEventListener('click', () => { gestionState.view = key; renderGestion(); });
    tabs.append(option);
  }
  const content = { sanctions: gestionSanctions, transactions: gestionTransactions, inventory: gestionInventory }[gestionState.view](data);
  root.replaceChildren(...gestionHeader(data), tabs, content);
}

// ---------------------------------------------------------------- Règlement: the rules and the custom server guide shown in game
const RICH_COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;
// The game's rich text, for the preview: everything escaped, then only a few tags given back
function richPreview(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return escaped
    .replace(/&lt;(\/?)(b|i|u|s)&gt;/gi, '<$1$2>')
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&lt;font\b([^&]*(?:&quot;[^&]*&quot;[^&]*)*)&gt;/gi, (all, attrs) => {
      const color = /color\s*=\s*&quot;([^&]*)&quot;/i.exec(attrs)?.[1];
      return color && RICH_COLOR.test(color.trim()) ? `<span style="color:${color.trim()}">` : '<span>';
    })
    .replace(/&lt;\/font&gt;/gi, '</span>');
}

async function loadTexts() {
  const data = await getJson('/api/texts');
  const root = $('texts-body');
  const readOnly = !can('texts.edit');
  const parts = [];
  const when = data.publishedAt ? ` Dernière publication le ${formatDateTime(data.publishedAt)}.` : '';
  parts.push(el('p', 'release', `Pas de version de test : ce que tu valides arrive direct sur le jeu public (et le test).${when}`));
  if (!data.ready || !data.texts) {
    parts.push(el('p', 'muted', "Le jeu n'a pas encore envoyé ses textes. Ils arrivent tout seuls dès qu'un serveur démarre avec la nouvelle version du jeu (test ou public), puis recharge la page."));
    root.replaceChildren(...parts);
    return;
  }
  parts.push(el('p', 'muted', 'Texte riche Roblox : <b>gras</b>, <i>italique</i>, <u>souligné</u>, <font color="#FF0000">couleur</font>. Les joueurs qui ont la fenêtre ouverte voient le changement direct.'));
  const areas = {};
  for (const [key, label] of Object.entries(data.labels)) {
    const section = el('div', 'texts-section');
    const area = el('textarea', 'texts-editor');
    area.value = data.texts[key] || '';
    area.rows = 16;
    area.maxLength = data.maxLength;
    area.readOnly = readOnly;
    const preview = el('div', 'texts-preview');
    const count = el('span', 'muted perms-hint', '');
    const update = () => {
      preview.innerHTML = richPreview(area.value);
      count.textContent = `${formatNumber(area.value.length)} / ${formatNumber(data.maxLength)}`;
    };
    area.addEventListener('input', update);
    update();
    const columns = el('div', 'texts-columns');
    columns.append(area, preview);
    const head = el('div', 'release-head');
    head.append(el('h3', 'subtitle', label), count);
    section.append(head, columns);
    parts.push(section);
    areas[key] = area;
  }
  if (!readOnly) {
    const publish = confirmButton('Valider et publier sur le jeu', async () => {
      try {
        await post('/api/texts/save', Object.fromEntries(Object.entries(areas).map(([key, area]) => [key, area.value])));
        notify("C'est publié sur le jeu <3");
        await loadTexts();
      } catch (err) {
        notify(err.message, 'error');
      }
    });
    publish.className = 'button primary';
    parts.push(publish);
  }
  root.replaceChildren(...parts);
}
