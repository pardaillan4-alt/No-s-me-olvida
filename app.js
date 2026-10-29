/* No Se Me Olvida — lógica de la app. Todo se guarda en este dispositivo (localStorage). */
(function () {
  'use strict';

  const { parse, nextOccurrence } = window.NSOParser;
  const STORE_KEY = 'nso.v1';
  const TAB_KEY = 'nso.tab';
  const NEAR_METERS = 150;
  const PLACE_COOLDOWN_MS = 30 * 60000;

  const CATS = {
    compras: { name: 'Compras', icon: '🛒' },
    escuela: { name: 'Escuela', icon: '🎒' },
    trabajo: { name: 'Trabajo', icon: '💼' },
    personal: { name: 'Personal', icon: '🏠' },
  };
  const TABS = [
    { id: 'hoy', name: 'Hoy', icon: '⭐' },
    ...Object.entries(CATS).map(([id, c]) => ({ id, name: c.name, icon: c.icon })),
    { id: 'todo', name: 'Todo', icon: '📋' },
  ];
  const REPEAT_LABEL = { daily: 'diario', weekdays: 'lun-vie', weekly: 'semanal', biweekly: 'cada 15 días', monthly: 'mensual', yearly: 'anual' };

  // ---------- Estado ----------
  const CONFIG = window.NSO_CONFIG || {};
  const defaults = () => ({ tasks: [], places: [], freq: {}, settings: { defaultTime: '08:00', sound: true, kids: (CONFIG.kids || []).slice() } });
  let state = load();
  let tab = safeGet(TAB_KEY) || 'hoy';
  if (!TABS.some((t) => t.id === tab)) tab = 'hoy';
  let personFilter = null;
  let quickPerson = null; // hijo(s) elegidos con los botones bajo la caja de texto
  let search = '';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const d = defaults();
        return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
      }
    } catch (e) { /* datos dañados o almacenamiento bloqueado */ }
    return defaults();
  }
  function save() {
    if (!safeSet(STORE_KEY, JSON.stringify(state))) toast('⚠️ No se pudo guardar en este navegador');
  }

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const byId = (id) => state.tasks.find((t) => t.id === id);

  // ---------- Fechas ----------
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayDiff = (d) => Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
  const fmtTime = (d) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (d) => d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

  function alertTime(t) {
    if (!t.due) return null;
    const d = new Date(t.due);
    if (!t.hasTime) {
      const [h, m] = (state.settings.defaultTime || '08:00').split(':').map(Number);
      d.setHours(h, m, 0, 0);
    }
    return new Date(d.getTime() - (t.lead || 0) * 60000);
  }

  function isOverdue(t) {
    if (t.done || !t.due) return false;
    const d = new Date(t.due);
    return t.hasTime ? d < new Date() : dayDiff(d) < 0;
  }

  function dayWord(d) {
    const diff = dayDiff(d);
    let day;
    if (diff === 0) day = 'Hoy';
    else if (diff === 1) day = 'Mañana';
    else if (diff === -1) day = 'Ayer';
    else if (diff > 1 && diff < 7) day = d.toLocaleDateString('es-MX', { weekday: 'long' });
    else day = fmtDay(d);
    return day.charAt(0).toUpperCase() + day.slice(1);
  }

  // "Dom 1 nov 8:00 a.m." del aviso extra, o null si no hay o ya pasó
  function remindLabel(t) {
    if (!t.remindAt || t.done) return null;
    const r = new Date(t.remindAt);
    if (t.notifiedExtra === t.remindAt && r < new Date()) return null;
    return `🔔 ${dayWord(r)} ${fmtTime(r)}`;
  }

  function dueLabel(t) {
    if (!t.due) return null;
    const d = new Date(t.due);
    const diff = dayDiff(d);
    const day = dayWord(d);
    const txt = t.hasTime ? `${day} ${fmtTime(d)}` : day;
    const cls = isOverdue(t) ? 'overdue' : diff === 0 ? 'today' : '';
    return { txt: (cls === 'overdue' ? '⚠️ ' : '🕒 ') + txt, cls };
  }

  function bucket(t) {
    if (!t.due) return 'nodate';
    if (isOverdue(t)) return 'overdue';
    const diff = dayDiff(t.due);
    if (diff <= 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff < 7) return 'week';
    return 'later';
  }
  const BUCKETS = [['overdue', 'Vencidos'], ['today', 'Hoy'], ['tomorrow', 'Mañana'], ['week', 'Esta semana'], ['later', 'Más adelante'], ['nodate', 'Sin fecha']];

  const sortTasks = (a, b) => {
    if (a.due && b.due) return new Date(a.due) - new Date(b.due) || (a.hasTime ? 1 : -1);
    if (a.due) return -1;
    if (b.due) return 1;
    return a.createdAt - b.createdAt;
  };

  // ---------- Acciones ----------
  let undoSnapshot = null;
  function snapshot() { undoSnapshot = JSON.stringify(state.tasks); }
  function undo() {
    if (!undoSnapshot) return;
    state.tasks = JSON.parse(undoSnapshot);
    undoSnapshot = null;
    save(); render();
  }

  const kids = () => state.settings.kids || [];
  // "Jesús y Julián" -> ['Jesús', 'Julián']
  const personsOf = (t) => (t.person ? t.person.split(/\s*,\s*|\s+y\s+/).filter(Boolean) : []);
  const parseText = (text) => parse(text, { defaultCat: CATS[tab] ? tab : null, kids: kids(), person: quickPerson,
    defaultTime: state.settings.defaultTime });

  function addFromText(text) {
    const items = parseText(text);
    snapshot();
    const now = Date.now();
    const added = items.map((it, i) => {
      // Compras: no duplicar lo que ya está en la lista; si ya se había comprado, se vuelve a poner
      if (it.cat === 'compras') {
        const same = state.tasks.filter((t) => t.cat === 'compras' && t.title.toLowerCase() === it.title.toLowerCase());
        if (same.some((t) => !t.done)) return null;
        if (same.length) {
          Object.assign(same[0], { done: false, doneAt: null, createdAt: now + i });
          return same[0];
        }
      }
      const t = { id: uid(), title: it.title, cat: it.cat, person: it.person || '', notes: '', due: it.due, hasTime: it.hasTime,
        repeat: it.repeat || '', lead: 0, remindAt: it.remindAt || null, done: false, createdAt: now + i };
      state.tasks.push(t);
      return t;
    }).filter(Boolean);
    save();
    quickPerson = null;
    if (!added.length) { render(); toast('Ya estaba en tu lista 👍'); return; }
    const cat = added[0].cat;
    render();
    const what = added.length > 1 ? `${added.length} artículos` : `“${added[0].title}”`;
    const when = dueLabel(added[0]);
    const rem = remindLabel(added[0]);
    toast(`${CATS[cat].icon} ${what} agregado${added.length > 1 ? 's' : ''}${when ? ' · ' + when.txt.slice(2) : ''}${rem ? ' · aviso ' + rem.slice(2) : ''}`, true);
    maybeAskNotifications(added[0]);
  }

  function toggleDone(id) {
    const t = byId(id);
    if (!t) return;
    snapshot();
    if (!t.done && t.repeat && t.due) {
      const prev = new Date(t.due).getTime();
      t.due = nextOccurrence(t.due, t.repeat, t.hasTime ? new Date() : startOfDay(new Date()));
      // El aviso extra se mueve igual que el pendiente (p. ej. siempre el domingo antes)
      if (t.remindAt) { t.remindAt = new Date(new Date(t.remindAt).getTime() + new Date(t.due).getTime() - prev).toISOString(); t.notifiedExtra = null; }
      t.notifiedFor = null;
      save(); render();
      toast(`🔁 Listo. Próxima vez: ${dueLabel(t).txt.slice(2)}`, true);
      return;
    }
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    if (t.done && t.cat === 'compras') {
      const k = t.title.toLowerCase();
      state.freq[k] = { title: t.title, n: ((state.freq[k] && state.freq[k].n) || 0) + 1, last: Date.now() };
    }
    save(); render();
    if (t.done) toast(t.cat === 'compras' ? `🛒 ${t.title} en el carrito` : `✅ ${t.title}`, true);
  }

  function snooze(id, minutes) {
    const t = byId(id);
    if (!t) return;
    // Se pospone solo el aviso; la fecha del pendiente no cambia
    t.remindAt = new Date(Date.now() + minutes * 60000).toISOString();
    t.notifiedExtra = null;
    save(); render();
    toast(`⏰ Te vuelvo a avisar en ${minutes} min`);
  }

  function removeTask(id) {
    snapshot();
    state.tasks = state.tasks.filter((t) => t.id !== id);
    save(); render();
    toast('🗑️ Eliminado', true);
  }

  function clearDone(cat) {
    const n = state.tasks.filter((t) => t.done && (!cat || t.cat === cat)).length;
    if (!n) return;
    snapshot();
    state.tasks = state.tasks.filter((t) => !(t.done && (!cat || t.cat === cat)));
    save(); render();
    toast(`🧹 ${n} quitado${n > 1 ? 's' : ''}`, true);
  }

  function setTab(id) {
    tab = id;
    personFilter = null;
    quickPerson = null;
    safeSet(TAB_KEY, id);
    render();
    window.scrollTo({ top: 0 });
  }

  // ---------- Pintar ----------
  function itemHTML(t, opts) {
    opts = opts || {};
    const due = dueLabel(t);
    const meta = [];
    if (opts.showCat) meta.push(`<span>${CATS[t.cat] ? CATS[t.cat].icon + ' ' + CATS[t.cat].name : esc(t.cat)}</span>`);
    if (due && !t.done) meta.push(`<span class="${due.cls}">${esc(due.txt)}</span>`);
    if (t.person) meta.push(`<span>👤 ${esc(t.person)}</span>`);
    if (t.repeat) meta.push(`<span>🔁 ${REPEAT_LABEL[t.repeat] || ''}</span>`);
    const rem = remindLabel(t);
    if (rem) meta.push(`<span>${esc(rem)}</span>`);
    if (t.notes) meta.push(`<span>📝 ${esc(t.notes.length > 40 ? t.notes.slice(0, 40) + '…' : t.notes)}</span>`);
    return `<li class="item${t.done ? ' done' : ''}" style="--cat: var(--c-${esc(t.cat)})" data-id="${t.id}">
      <button class="check" data-act="toggle" aria-label="${t.done ? 'Marcar como pendiente' : 'Marcar como hecho'}">${t.done ? '✓' : ''}</button>
      <div class="body" data-act="edit">
        <div class="title">${esc(t.title)}</div>
        ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
      </div>
    </li>`;
  }

  function groupsHTML(tasks, opts) {
    const by = {};
    tasks.slice().sort(sortTasks).forEach((t) => { (by[bucket(t)] = by[bucket(t)] || []).push(t); });
    return BUCKETS.filter(([k]) => by[k]).map(([k, label]) => `
      <section class="group">
        <h2 class="${k === 'overdue' ? 'overdue' : ''}"><span>${label}</span><span>${by[k].length}</span></h2>
        <ul class="list">${by[k].map((t) => itemHTML(t, opts)).join('')}</ul>
      </section>`).join('');
  }

  function doneBoxHTML(done, cat) {
    if (!done.length) return '';
    done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    return `<details class="done-box">
      <summary>Hechos (${done.length})</summary>
      <div class="toolbar"><button data-act="clear-done" data-cat="${cat || ''}">🧹 Quitar hechos</button></div>
      <ul class="list">${done.slice(0, 50).map((t) => itemHTML(t, { showCat: !cat })).join('')}</ul>
    </details>`;
  }

  function emptyHTML(icon, text) {
    return `<div class="empty"><span class="big">${icon}</span>${text}</div>`;
  }

  function viewHoy() {
    const pending = state.tasks.filter((t) => !t.done);
    const urgent = pending.filter((t) => ['overdue', 'today'].includes(bucket(t)));
    const counts = Object.keys(CATS).map((c) => [c, pending.filter((t) => t.cat === c).length]);
    let html = `<div class="summary">${counts.map(([c, n]) => `
      <button class="sum-card" style="--cat: var(--c-${c})" data-act="tab" data-tab="${c}">
        <b>${n}</b>${CATS[c].icon} ${CATS[c].name}
      </button>`).join('')}</div>`;
    html += urgent.length ? groupsHTML(urgent, { showCat: true })
      : emptyHTML('🎉', 'Nada vencido ni para hoy.<br>Escribe arriba lo que no quieres olvidar.');
    const remindToday = pending.filter((t) => t.remindAt && dayDiff(t.remindAt) === 0 && !urgent.includes(t));
    if (remindToday.length) {
      html += `<section class="group"><h2><span>🔔 Avisos de hoy</span><span>${remindToday.length}</span></h2>
        <ul class="list">${remindToday.sort((a, b) => new Date(a.remindAt) - new Date(b.remindAt)).map((t) => itemHTML(t, { showCat: true })).join('')}</ul></section>`;
    }
    const tomorrow = pending.filter((t) => bucket(t) === 'tomorrow' && !remindToday.includes(t));
    if (tomorrow.length) html += groupsHTML(tomorrow, { showCat: true });
    if ('Notification' in window && Notification.permission === 'default') {
      html += `<div class="banner" style="margin-top:16px">🔔 Activa los avisos para que te recuerde a la hora.
        <button class="primary" data-act="ask-notif">Activar</button></div>`;
    }
    return html;
  }

  function viewCompras() {
    const items = state.tasks.filter((t) => t.cat === 'compras');
    const pending = items.filter((t) => !t.done).sort(sortTasks);
    const done = items.filter((t) => t.done);
    let html = `<div class="toolbar">
      <button data-act="share-list" ${pending.length ? '' : 'disabled'}>📤 Compartir lista</button>
      ${done.length ? `<button data-act="clear-done" data-cat="compras">🧹 Quitar comprados (${done.length})</button>` : ''}
    </div>`;
    html += pending.length
      ? `<ul class="list shop">${pending.map((t) => itemHTML(t)).join('')}</ul>`
      : emptyHTML('🛒', 'Tu lista está vacía.<br>Escribe por ejemplo: <b>leche, pan y huevos</b>');
    const pendingNames = new Set(pending.map((t) => t.title.toLowerCase()));
    const sugg = Object.values(state.freq).filter((f) => !pendingNames.has(f.title.toLowerCase()))
      .sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 16);
    if (sugg.length) {
      html += `<div class="suggest"><h2>Lo que sueles comprar</h2><div class="chips">${sugg.map((f) =>
        `<button data-act="readd" data-title="${esc(f.title)}">＋ ${esc(f.title)}</button>`).join('')}</div></div>`;
    }
    if (done.length) {
      html += `<section class="group"><h2><span>En el carrito</span><span>${done.length}</span></h2>
        <ul class="list shop">${done.sort((a, b) => b.doneAt - a.doneAt).map((t) => itemHTML(t)).join('')}</ul></section>`;
    }
    return html;
  }

  function viewCategory(cat) {
    const items = state.tasks.filter((t) => t.cat === cat);
    const others = [...new Set(items.filter((t) => !t.done).flatMap(personsOf))].filter((p) => !kids().includes(p)).sort();
    const people = (cat === 'escuela' ? kids() : kids().filter((k) => items.some((t) => !t.done && personsOf(t).includes(k)))).concat(others);
    if (personFilter && !people.includes(personFilter)) personFilter = null;
    const pending = items.filter((t) => !t.done && (!personFilter || personsOf(t).includes(personFilter)));
    let html = '';
    if (people.length) {
      html += `<div class="chips">
        <button class="chip-person" data-act="person" data-p="" aria-pressed="${!personFilter}">Todos</button>
        ${people.map((p) => `<button class="chip-person" data-act="person" data-p="${esc(p)}" aria-pressed="${personFilter === p}">👤 ${esc(p)}</button>`).join('')}
      </div>`;
    }
    const tips = {
      escuela: 'Ej.: <b>llevar disfraz de @Mateo el viernes</b> o <b>firmar boleta mañana 7am</b>',
      trabajo: 'Ej.: <b>enviar reporte el lunes a las 10</b> o <b>llamar al cliente en 2 horas</b>',
      personal: 'Ej.: <b>pagar la luz el 5 de noviembre</b> o <b>sacar la basura cada martes en la noche</b>',
    };
    html += pending.length ? groupsHTML(pending) : emptyHTML(CATS[cat].icon, `Sin pendientes de ${CATS[cat].name.toLowerCase()}.<br>${tips[cat] || ''}`);
    html += doneBoxHTML(items.filter((t) => t.done), cat);
    return html;
  }

  function viewTodo() {
    const q = search.trim().toLowerCase();
    const match = (t) => !q || (t.title + ' ' + (t.person || '') + ' ' + (t.notes || '')).toLowerCase().includes(q);
    const pending = state.tasks.filter((t) => !t.done && match(t));
    let html = `<input id="search" type="search" placeholder="🔎 Buscar…" value="${esc(search)}"
      style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card)">`;
    html += pending.length ? groupsHTML(pending, { showCat: true }) : emptyHTML('📋', q ? 'No encontré nada.' : 'No hay pendientes.');
    html += doneBoxHTML(state.tasks.filter((t) => t.done && match(t)), null);
    return html;
  }

  function render() {
    const pending = state.tasks.filter((t) => !t.done);
    const overdue = pending.filter(isOverdue).length;
    $('#tabs').innerHTML = TABS.map((t) => {
      let n = t.id === 'hoy' ? pending.filter((x) => ['overdue', 'today'].includes(bucket(x))).length
        : t.id === 'todo' ? 0 : pending.filter((x) => x.cat === t.id).length;
      const alert = t.id === 'hoy' ? overdue > 0 : CATS[t.id] && pending.some((x) => x.cat === t.id && isOverdue(x));
      return `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.icon} ${t.name}${n ? ` <span class="badge${alert ? ' alert' : ''}">${n}</span>` : ''}</button>`;
    }).join('');

    const v = $('#view');
    if (tab === 'hoy') v.innerHTML = viewHoy();
    else if (tab === 'compras') v.innerHTML = viewCompras();
    else if (tab === 'todo') v.innerHTML = viewTodo();
    else v.innerHTML = viewCategory(tab);

    const s = $('#search');
    if (s) s.addEventListener('input', () => { search = s.value; const pos = s.selectionStart; render(); const n = $('#search'); n.focus(); n.setSelectionRange(pos, pos); });

    const b = $('#banner');
    if (overdue && tab !== 'hoy') {
      b.innerHTML = `⚠️ Tienes ${overdue} pendiente${overdue > 1 ? 's' : ''} vencido${overdue > 1 ? 's' : ''}. <button data-act="tab" data-tab="hoy">Ver</button>`;
      b.hidden = false;
    } else b.hidden = true;

    $('#today-label').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    $('#people-list').innerHTML = [...new Set(kids().concat(kids().length > 1 ? [kids().join(' y ')] : [], state.tasks.map((t) => t.person).filter(Boolean)))]
      .map((p) => `<option value="${esc(p)}">`).join('');
    renderQuickPeople();
    $('#street-btn').classList.toggle('on', streetWatch != null);
  }

  // ---------- Botones rápidos "para quién" ----------
  function renderQuickPeople() {
    const box = $('#quick-people');
    const list = kids();
    if (!list.length || !['hoy', 'escuela'].includes(tab)) { box.hidden = true; quickPerson = null; return; }
    const opts = list.map((k) => [k, '👦 ' + k]);
    if (list.length > 1) opts.push([list.join(' y '), list.length === 2 ? '👦👦 Los dos' : '👦👦 Todos']);
    box.innerHTML = '<span class="muted small" style="align-self:center">Para:</span>' + opts.map(([v, label]) =>
      `<button type="button" data-act="quick-person" data-p="${esc(v)}" aria-pressed="${quickPerson === v}">${esc(label)}</button>`).join('');
    box.hidden = false;
  }

  // ---------- Vista previa mientras se escribe ----------
  function renderPreview() {
    const text = $('#quick-input').value.trim();
    const p = $('#preview');
    if (text.length < 2) { p.innerHTML = ''; return; }
    const items = parseText(text);
    const it = items[0];
    const pills = [`<span class="pill">${CATS[it.cat].icon} ${CATS[it.cat].name}</span>`];
    if (items.length > 1) pills.push(`<span class="pill">${items.length} artículos: ${esc(items.map((x) => x.title).join(', '))}</span>`);
    else pills.push(`<span class="pill">“${esc(it.title)}”</span>`);
    const due = dueLabel(it);
    if (due) pills.push(`<span class="pill">${esc(due.txt)}</span>`);
    if (it.person) pills.push(`<span class="pill">👤 ${esc(it.person)}</span>`);
    if (it.remindAt) pills.push(`<span class="pill">${esc(remindLabel(it).replace('🔔 ', '🔔 Aviso: '))}</span>`);
    if (it.repeat) pills.push(`<span class="pill">🔁 ${REPEAT_LABEL[it.repeat]}</span>`);
    p.innerHTML = pills.join('');
  }

  // ---------- Diálogo de edición ----------
  const dlg = $('#edit-dlg');
  const form = $('#edit-form');
  let editingId = null;
  form.elements.cat.innerHTML = Object.entries(CATS).map(([id, c]) => `<option value="${id}">${c.icon} ${c.name}</option>`).join('');
  $('#place-cat').innerHTML = form.elements.cat.innerHTML;

  const pad = (n) => String(n).padStart(2, '0');
  const toDateInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  function openEdit(id) {
    const t = id ? byId(id) : { title: '', cat: CATS[tab] ? tab : 'personal', person: '', notes: '', due: null, hasTime: false, repeat: '', lead: 0 };
    if (!t) return;
    editingId = id || null;
    const f = form.elements;
    f.title.value = t.title;
    f.cat.value = t.cat;
    f.person.value = t.person || '';
    f.notes.value = t.notes || '';
    f.repeat.value = t.repeat || '';
    f.lead.value = String(t.lead || 0);
    if (t.due) {
      const d = new Date(t.due);
      f.date.value = toDateInput(d);
      f.time.value = t.hasTime ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
    } else { f.date.value = ''; f.time.value = ''; }
    if (t.remindAt) {
      const r = new Date(t.remindAt);
      f.rdate.value = toDateInput(r);
      f.rtime.value = `${pad(r.getHours())}:${pad(r.getMinutes())}`;
    } else { f.rdate.value = ''; f.rtime.value = ''; }
    renderRemindDays();
    $('#delete-btn').hidden = !id;
    $('#ics-btn').hidden = !id;
    $('#share-one-btn').hidden = !id;
    dlg.showModal();
    if (!id) setTimeout(() => f.title.focus(), 50);
  }

  function readForm() {
    const f = form.elements;
    let due = null, hasTime = false;
    if (f.date.value || f.time.value) {
      const [y, m, d] = (f.date.value || toDateInput(new Date())).split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      if (f.time.value) { const [h, mi] = f.time.value.split(':').map(Number); dt.setHours(h, mi, 0, 0); hasTime = true; }
      due = dt.toISOString();
    }
    let remindAt = null;
    if (f.rdate.value) {
      const [y, m, d] = f.rdate.value.split('-').map(Number);
      const [h, mi] = (f.rtime.value || state.settings.defaultTime || '08:00').split(':').map(Number);
      remindAt = new Date(y, m - 1, d, h, mi).toISOString();
    }
    return { title: f.title.value.trim(), cat: f.cat.value, person: f.person.value.trim(), notes: f.notes.value.trim(),
      due, hasTime, repeat: f.repeat.value, lead: parseInt(f.lead.value, 10) || 0, remindAt };
  }

  // Botones de día para el aviso extra: los próximos 7 días por su nombre
  const WD_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  function renderRemindDays() {
    const f = form.elements;
    const today = startOfDay(new Date());
    const btns = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const v = toDateInput(d);
      const label = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : `${WD_SHORT[d.getDay()]} ${d.getDate()}`;
      btns.push(`<button type="button" data-rd="${v}" aria-pressed="${f.rdate.value === v}">${label}</button>`);
    }
    if (f.date.value) btns.push(`<button type="button" data-rd="before">1 día antes</button>`);
    if (f.rdate.value) btns.push(`<button type="button" data-rd="clear">Quitar aviso</button>`);
    $('#remind-days').innerHTML = btns.join('');
    let hint = 'Opcional. Además del aviso normal, te aviso el día que elijas.';
    if (f.rdate.value) {
      const [y, m, d] = f.rdate.value.split('-').map(Number);
      const [h, mi] = (f.rtime.value || state.settings.defaultTime || '08:00').split(':').map(Number);
      const r = new Date(y, m - 1, d, h, mi);
      const day = r.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      hint = r < new Date() ? '⚠️ Esa fecha y hora ya pasaron.' : `Te aviso el ${day} a las ${fmtTime(r)}`.replace(/\.?$/, '.');
    }
    $('#remind-hint').textContent = hint;
  }
  $('#remind-days').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const f = form.elements;
    const v = b.dataset.rd;
    if (v === 'clear') { f.rdate.value = ''; f.rtime.value = ''; }
    else if (v === 'before') {
      const [y, m, d] = f.date.value.split('-').map(Number);
      f.rdate.value = toDateInput(new Date(y, m - 1, d - 1));
      if (!f.rtime.value) f.rtime.value = f.time.value || state.settings.defaultTime;
    } else {
      f.rdate.value = v;
      if (!f.rtime.value) f.rtime.value = state.settings.defaultTime || '08:00';
    }
    renderRemindDays();
  });
  ['rdate', 'rtime', 'date'].forEach((n) => form.elements[n].addEventListener('change', renderRemindDays));

  dlg.addEventListener('close', () => {
    if (dlg.returnValue !== 'save') return;
    const data = readForm();
    if (!data.title) return;
    snapshot();
    if (editingId) {
      const t = byId(editingId);
      if (t.due !== data.due || t.lead !== data.lead || t.hasTime !== data.hasTime) t.notifiedFor = null;
      if (t.remindAt !== data.remindAt) t.notifiedExtra = null;
      Object.assign(t, data);
    } else {
      state.tasks.push({ id: uid(), ...data, done: false, createdAt: Date.now() });
    }
    save(); render();
    toast('💾 Guardado');
    maybeAskNotifications(data);
  });

  $('#date-shortcuts').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const f = form.elements;
    const v = b.dataset.d;
    if (v === 'clear') { f.date.value = ''; f.time.value = ''; return; }
    const d = new Date();
    if (v === 'weekend') d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    else d.setDate(d.getDate() + Number(v));
    f.date.value = toDateInput(d);
  });

  $('#delete-btn').addEventListener('click', () => { const id = editingId; dlg.close('delete'); removeTask(id); });
  $('#ics-btn').addEventListener('click', () => {
    const data = { ...byId(editingId), ...readForm() };
    if (!data.due && data.remindAt) Object.assign(data, { due: data.remindAt, hasTime: true, remindAt: null });
    if (!data.due) { toast('Primero ponle un día 📅'); return; }
    downloadICS(data);
  });
  $('#share-one-btn').addEventListener('click', () => {
    const t = { ...byId(editingId), ...readForm() };
    const due = dueLabel(t);
    shareText(`${CATS[t.cat].icon} ${t.title}${due ? ' — ' + due.txt.slice(2) : ''}${t.notes ? '\n' + t.notes : ''}`);
  });

  // ---------- Calendario (.ics) ----------
  function downloadICS(t) {
    const d = new Date(t.due);
    const stamp = (x) => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
    const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NoSeMeOlvida//ES', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${t.id || uid()}@nosemeolvida`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`];
    if (t.hasTime) {
      const end = new Date(d.getTime() + 30 * 60000);
      const dt = (x) => `${stamp(x)}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
      lines.push(`DTSTART:${dt(d)}`, `DTEND:${dt(end)}`);
    } else {
      const next = new Date(d); next.setDate(next.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${stamp(d)}`, `DTEND;VALUE=DATE:${stamp(next)}`);
    }
    const rr = { daily: 'FREQ=DAILY', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', biweekly: 'FREQ=WEEKLY;INTERVAL=2', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' }[t.repeat];
    if (rr) lines.push(`RRULE:${rr}`);
    lines.push(`SUMMARY:${icsEsc((CATS[t.cat] ? CATS[t.cat].icon + ' ' : '') + t.title + (t.person ? ' (' + t.person + ')' : ''))}`);
    if (t.notes) lines.push(`DESCRIPTION:${icsEsc(t.notes)}`);
    // Para tareas sin hora, el aviso llega a la hora configurada ese mismo día
    let trigger = `-PT${t.lead || 0}M`;
    if (!t.hasTime) {
      const [h, m] = (state.settings.defaultTime || '08:00').split(':').map(Number);
      trigger = `PT${h * 60 + m - (t.lead || 0)}M`.replace('PT-', '-PT');
    }
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(t.title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
    if (t.remindAt) {
      const utc = new Date(t.remindAt).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(t.title)}`, `TRIGGER;VALUE=DATE-TIME:${utc}`, 'END:VALARM');
    }
    lines.push('END:VEVENT', 'END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (t.title.replace(/[^\p{L}\d]+/gu, '-').slice(0, 40) || 'recordatorio') + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('📅 Abre el archivo para agregarlo a tu calendario');
  }

  // ---------- Compartir ----------
  async function shareText(text) {
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); toast('📋 Copiado. Pégalo en WhatsApp o donde quieras'); }
    catch (e) { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
  }

  function shareList() {
    const items = state.tasks.filter((t) => t.cat === 'compras' && !t.done).sort(sortTasks);
    shareText('🛒 Lista de compras:\n' + items.map((t) => `• ${t.title}${t.notes ? ' (' + t.notes + ')' : ''}`).join('\n'));
  }

  // ---------- Avisos ----------
  let swReg = null;
  let audioCtx = null;

  function beep() {
    if (!state.settings.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((delay) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime + delay;
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.start(t0); o.stop(t0 + 0.22);
      });
    } catch (e) { /* sin audio */ }
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (navigator.vibrate && active) navigator.vibrate([200, 100, 200]);
  }

  async function notify(title, body, tag, withActions) {
    beep();
    if ('Notification' in window && Notification.permission === 'granted') {
      const opts = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', renotify: true, requireInteraction: true, data: { id: tag } };
      if (withActions) opts.actions = [{ action: 'done', title: '✅ Hecho' }, { action: 'snooze', title: '⏰ En 10 min' }];
      try {
        const reg = swReg || ('serviceWorker' in navigator ? await Promise.race([
          navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))]) : null);
        if (reg) { await reg.showNotification(title, opts); return; }
        delete opts.actions; // solo las notificaciones del service worker aceptan botones
        new Notification(title, opts);
        return;
      } catch (e) { /* cae al aviso dentro de la app */ }
    }
    toast(`🔔 ${title}${body ? ' — ' + body : ''}`, false, 8000);
  }

  function checkReminders() {
    const now = new Date();
    let changed = false;
    const fire = (t) => {
      const due = dueLabel(t);
      const body = [due && due.txt.slice(2).trim(), t.person && '👤 ' + t.person, t.notes].filter(Boolean).join(' · ');
      notify(`${CATS[t.cat] ? CATS[t.cat].icon : '🔔'} ${t.title}`, body, t.id, true);
    };
    for (const t of state.tasks) {
      if (t.done) continue;
      // Avisos de hace más de 12 h no se disparan uno por uno: se ven en "Vencidos"
      if (t.remindAt && t.notifiedExtra !== t.remindAt && new Date(t.remindAt) <= now) {
        t.notifiedExtra = t.remindAt;
        changed = true;
        if (now - new Date(t.remindAt) <= 12 * 3600000) fire(t);
      }
      if (!t.due || t.notifiedFor === t.due) continue;
      const at = alertTime(t);
      if (at > now) continue;
      t.notifiedFor = t.due;
      changed = true;
      if (now - at <= 12 * 3600000) fire(t);
    }
    if (changed) { save(); render(); }
  }

  async function askNotifications() {
    if (!('Notification' in window)) { toast('Este navegador no permite notificaciones'); return; }
    const r = await Notification.requestPermission();
    updateNotifStatus(); render();
    if (r === 'granted') notify('¡Listo! 🔔', 'Así te avisaré de tus pendientes.', 'test');
  }

  let askedOnce = false;
  function maybeAskNotifications(t) {
    if (askedOnce || !(t.due || t.remindAt) || !('Notification' in window) || Notification.permission !== 'default') return;
    askedOnce = true;
    setTimeout(() => toastAction('🔔 ¿Quieres que te avise a la hora?', 'Sí, avísame', askNotifications), 2600);
  }

  function updateNotifStatus() {
    const el = $('#notif-status');
    if (!('Notification' in window)) { el.textContent = 'Este navegador no permite notificaciones. Usa “Agregar a mi calendario”.'; $('#notif-btn').hidden = true; return; }
    const p = Notification.permission;
    el.textContent = p === 'granted' ? '✅ Notificaciones activadas. Funcionan mientras la app esté abierta o en segundo plano.'
      : p === 'denied' ? '🚫 Bloqueaste las notificaciones. Actívalas en los ajustes del navegador para este sitio.'
        : 'Aún no activas las notificaciones.';
    $('#notif-btn').hidden = p !== 'default';
  }

  // Acciones que llegan desde una notificación (vía service worker o la URL)
  function handleAction(action, id) {
    if (!id || !byId(id)) return;
    if (action === 'done') { if (!byId(id).done) toggleDone(id); }
    else if (action === 'snooze') snooze(id, 10);
    else openEdit(id);
  }

  // ---------- Modo calle (lugares) ----------
  let streetWatch = null;
  const lastPlaceAlert = {};

  function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function onPosition(pos) {
    const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    for (const p of state.places) {
      if (distanceM(here, p) > NEAR_METERS) continue;
      if (Date.now() - (lastPlaceAlert[p.id] || 0) < PLACE_COOLDOWN_MS) continue;
      lastPlaceAlert[p.id] = Date.now();
      const pending = state.tasks.filter((t) => !t.done && t.cat === p.cat);
      if (!pending.length) continue;
      notify(`📍 Estás en ${p.name}`, `${pending.length} pendiente${pending.length > 1 ? 's' : ''}: ${pending.slice(0, 4).map((t) => t.title).join(', ')}${pending.length > 4 ? '…' : ''}`, 'place-' + p.id);
      setTab(p.cat);
    }
  }

  function toggleStreet() {
    if (streetWatch != null) {
      navigator.geolocation.clearWatch(streetWatch);
      streetWatch = null;
      toast('📍 Modo calle apagado');
      render();
      return;
    }
    if (!state.places.length) { toast('Primero guarda un lugar en ⚙️ Ajustes → Lugares'); openSettings(); return; }
    if (!navigator.geolocation) { toast('Tu teléfono no permite ubicación aquí'); return; }
    streetWatch = navigator.geolocation.watchPosition(onPosition, (err) => {
      toast('No pude leer tu ubicación: ' + (err.code === 1 ? 'permiso denegado' : 'sin señal'));
      if (err.code === 1 && streetWatch != null) { navigator.geolocation.clearWatch(streetWatch); streetWatch = null; render(); }
    }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 30000 });
    toast('📍 Modo calle encendido. Deja la app abierta y te aviso al llegar.');
    render();
  }

  function renderPlaces() {
    $('#places-list').innerHTML = state.places.length ? state.places.map((p) => `
      <li><span>📍 ${esc(p.name)} <span class="muted small">→ ${CATS[p.cat].icon} ${CATS[p.cat].name}</span></span>
      <button type="button" data-del-place="${p.id}" aria-label="Quitar">✕</button></li>`).join('')
      : '<li class="muted small">Aún no tienes lugares guardados.</li>';
  }

  $('#add-place-btn').addEventListener('click', () => {
    const name = $('#place-name').value.trim() || CATS[$('#place-cat').value].name;
    if (!navigator.geolocation) { toast('Ubicación no disponible'); return; }
    const btn = $('#add-place-btn');
    btn.disabled = true; btn.textContent = 'Buscando tu ubicación…';
    navigator.geolocation.getCurrentPosition((pos) => {
      state.places.push({ id: uid(), name, cat: $('#place-cat').value, lat: pos.coords.latitude, lng: pos.coords.longitude });
      save(); renderPlaces();
      $('#place-name').value = '';
      btn.disabled = false; btn.textContent = 'Guardar mi ubicación actual';
      toast(`📍 ${name} guardado`);
    }, () => {
      btn.disabled = false; btn.textContent = 'Guardar mi ubicación actual';
      toast('No pude obtener tu ubicación');
    }, { enableHighAccuracy: true, timeout: 20000 });
  });
  $('#places-list').addEventListener('click', (e) => {
    const id = e.target.dataset.delPlace;
    if (!id) return;
    state.places = state.places.filter((p) => p.id !== id);
    save(); renderPlaces();
  });

  // ---------- Mis hijos ----------
  function renderKids() {
    $('#kids-list').innerHTML = kids().length ? kids().map((k, i) => `
      <li><span>👦 ${esc(k)}</span><button type="button" data-del-kid="${i}" aria-label="Quitar">✕</button></li>`).join('')
      : '<li class="muted small">Sin nombres guardados.</li>';
  }
  $('#add-kid-btn').addEventListener('click', () => {
    const raw = $('#kid-name').value.trim().replace(/^@/, '');
    if (!raw) return;
    // Solo el primer nombre: es el que se escribe en los recordatorios
    const name = raw.split(/\s+/)[0];
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    if (!kids().some((k) => k.toLowerCase() === pretty.toLowerCase())) state.settings.kids = kids().concat(pretty);
    $('#kid-name').value = '';
    save(); renderKids(); render();
  });
  $('#kids-list').addEventListener('click', (e) => {
    const i = e.target.dataset.delKid;
    if (i == null) return;
    state.settings.kids = kids().filter((_, j) => j !== Number(i));
    save(); renderKids(); render();
  });

  // ---------- Ajustes ----------
  function openSettings() {
    updateNotifStatus();
    renderKids();
    renderPlaces();
    $('#default-time').value = state.settings.defaultTime;
    $('#sound-chk').checked = state.settings.sound;
    $('#settings-dlg').showModal();
  }
  $('#settings-btn').addEventListener('click', openSettings);
  $('#notif-btn').addEventListener('click', askNotifications);
  $('#test-notif-btn').addEventListener('click', () => notify('🔔 Aviso de prueba', 'Así se verán tus recordatorios.', 'test'));
  $('#default-time').addEventListener('change', (e) => { state.settings.defaultTime = e.target.value || '08:00'; save(); });
  $('#sound-chk').addEventListener('change', (e) => { state.settings.sound = e.target.checked; save(); });
  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `no-se-me-olvida-${toDateInput(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  });
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.tasks)) throw new Error('formato');
      if (!confirm(`¿Reemplazar tus datos con la copia (${data.tasks.length} recordatorios)?`)) return;
      state = { ...defaults(), ...data, settings: { ...defaults().settings, ...(data.settings || {}) } };
      save(); render(); toast('✅ Copia restaurada');
    } catch (err) { toast('Ese archivo no es una copia válida'); }
    e.target.value = '';
  });

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(msg, withUndo, ms) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span>${withUndo ? '<button data-act="undo">Deshacer</button>' : ''}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms || (withUndo ? 5000 : 3000));
  }
  function toastAction(msg, label, fn) {
    const el = $('#toast');
    el.innerHTML = `<span>${esc(msg)}</span><button>${esc(label)}</button>`;
    el.hidden = false;
    $('button', el).onclick = () => { el.hidden = true; fn(); };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 9000);
  }
  $('#toast').addEventListener('click', (e) => { if (e.target.dataset.act === 'undo') { undo(); $('#toast').hidden = true; } });

  // ---------- Eventos generales ----------
  $('#quick').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#quick-input');
    const text = input.value.trim();
    if (!text) { openEdit(null); return; }
    addFromText(text);
    input.value = '';
    renderPreview();
  });
  $('#quick-input').addEventListener('input', renderPreview);

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act], .tab');
    if (!el || el.closest('#toast')) return;
    if (el.classList.contains('tab')) { setTab(el.dataset.tab); return; }
    const item = el.closest('.item');
    const id = item && item.dataset.id;
    switch (el.dataset.act) {
      case 'toggle': toggleDone(id); break;
      case 'edit': openEdit(id); break;
      case 'tab': setTab(el.dataset.tab); break;
      case 'clear-done': clearDone(el.dataset.cat || null); break;
      case 'share-list': shareList(); break;
      case 'readd': addFromText(el.dataset.title + ' #compras'); break;
      case 'person': personFilter = el.dataset.p || null; render(); break;
      case 'quick-person':
        quickPerson = quickPerson === el.dataset.p ? null : el.dataset.p;
        renderQuickPeople(); renderPreview(); $('#quick-input').focus();
        break;
      case 'ask-notif': askNotifications(); break;
    }
  });

  $('#street-btn').addEventListener('click', toggleStreet);

  // ---------- Voz ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $('#mic-btn');
  if (!SR) mic.hidden = true;
  else {
    let rec = null;
    mic.addEventListener('click', () => {
      if (rec) { rec.stop(); return; }
      rec = new SR();
      rec.lang = 'es-MX';
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      const input = $('#quick-input');
      let finalText = '';
      rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          if (ev.results[i].isFinal) finalText += ev.results[i][0].transcript;
          else interim += ev.results[i][0].transcript;
        }
        input.value = (finalText + interim).trim();
        renderPreview();
      };
      rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Permite el micrófono para dictar'); };
      rec.onend = () => {
        mic.classList.remove('listening');
        rec = null;
        if (finalText.trim()) $('#quick').requestSubmit();
      };
      mic.classList.add('listening');
      rec.start();
    });
  }

  // ---------- Arranque ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; }).catch(() => {});
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notification-action') handleAction(e.data.action, e.data.id);
    });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const params = new URLSearchParams(location.search);
  if (TABS.some((t) => t.id === params.get('tab'))) { tab = params.get('tab'); history.replaceState(null, '', location.pathname); }
  render();
  if (params.get('id')) {
    handleAction(params.get('action'), params.get('id'));
    history.replaceState(null, '', location.pathname);
  }
  checkReminders();
  setInterval(checkReminders, 15000);
  setInterval(render, 60000); // refresca "Hoy/Mañana" y vencidos
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); render(); } });
})();
