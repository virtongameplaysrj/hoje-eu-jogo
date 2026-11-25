/* Agenda (no estilo do Rotina Gentil): o app pergunta os horários livres de cada dia da semana
   e escolhe para cada dia até 3 jogos da lista "Estou jogando sozinho", na ordem que você quiser.
   Salvo como { slots: { 1: [{ start: '19:00', end: '21:00' }], ... }, session: 60 }
   (dias como Date.getDay: 0 = domingo; session = tempo mínimo por jogo; 0 = um jogo por dia).
   Os jogos de cada dia ficam guardados em 'agendaDays' ({ 'AAAA-M-D': { sig, games } }) quando o dia
   começa: assim dá para ver depois o que estava marcado e o que foi jogado. */
const Agenda = (() => {
  const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const WEEK = [1, 2, 3, 4, 5, 6, 0];          // a semana começa na segunda
  const DAY = 864e5, HOUR = 36e5;
  const MAX_PER_DAY = 3;                        // no máximo 3 jogos por dia, seja quanto for o tempo livre
  const DAY_SHIFT = 4 * HOUR;                   // o dia da agenda vai até as 4h: jogar à 1h ainda conta para a noite anterior
  const DONE_MIN = 5;                           // 5 min ou mais naquele dia = "joguei"
  const KEEP_DAYS = 35;                         // quanto tempo os dias guardados ficam salvos

  const load = () => store.get('agenda', null);
  const save = (cfg) => store.set('agenda', cfg);
  const hasSlots = (cfg) => !!cfg && WEEK.some((d) => (cfg.slots[d] || []).length);
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const keyOf = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

  /** Data (meia-noite) do dia da agenda em que o instante t cai. */
  const dayOf = (t) => { const d = new Date(t - DAY_SHIFT); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

  /** Os 7 dias (segunda a domingo) da semana de `now`, com início e fim (4h → 4h do dia seguinte). */
  function weekDays(now = Date.now()) {
    const t = dayOf(now);
    const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7));
    return WEEK.map((_, k) => {
      const date = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k);
      const next = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + k + 1);
      return { date, key: keyOf(date), wd: date.getDay(), start: date.getTime() + DAY_SHIFT, end: next.getTime() + DAY_SHIFT };
    });
  }

  /** Minutos livres de um dia da semana (soma dos horários; 22:00–01:00 vale 3 h). */
  function freeMinutes(cfg, wd) {
    return (cfg.slots[wd] || []).reduce((s, r) => {
      const a = toMin(r.start); let b = toMin(r.end);
      if (b <= a) b += 1440;
      return s + b - a;
    }, 0);
  }

  /** Quantos jogos no dia: um a cada `session` minutos livres, de 1 a 3 (session 0 = sempre 1). */
  function gamesFor(cfg, wd) {
    const free = freeMinutes(cfg, wd);
    if (!free) return 0;
    return cfg.session > 0 ? Math.max(1, Math.min(MAX_PER_DAY, Math.floor(free / cfg.session))) : 1;
  }

  const windowText = (cfg, wd) => (cfg.slots[wd] || []).slice().sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((r) => `${r.start}–${r.end}`).join(' · ');

  /** Nº da semana (segunda a domingo) desde 1970: faz o rodízio continuar de uma semana para a outra. */
  function weekIndex(date = new Date()) {
    const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor(Math.round((d - Date.UTC(1970, 0, 5)) / DAY) / 7);   // 05/01/1970 foi segunda
  }

  const snap = (g) => ({ id: g.id, name: g.name, cover: g.cover || null });

  /**
   * A semana inteira: para cada dia, os jogos marcados (até 3), quanto de cada um foi jogado e
   * o que foi jogado fora da agenda. Sessões com a Gi não contam; as das categorias contam.
   *  - Escolha de um dia: os jogos com MENOS minutos jogados sozinho na semana; empate = rodízio
   *    na ordem da lista (girada a cada semana, para nenhum ficar de fora quando há mais jogos que vagas).
   *  - Dias passados e hoje só olham o que foi jogado ANTES do dia começar: o dia não muda enquanto você joga.
   *    Hoje fica guardado; se os horários de hoje mudarem, recalcula mantendo o que já foi jogado.
   *  - Dias seguintes são uma previsão: contam o que já foi jogado mais o que está marcado antes deles.
   */
  function plan(cfg = load(), games = listGames('now'), now = Date.now()) {
    if (!hasSlots(cfg)) return [];
    const days = weekDays(now);
    const todayKey = keyOf(dayOf(now));
    const ti = days.findIndex((d) => d.key === todayKey);
    const sessions = Stats.sessionsSince(days[0].start).filter((e) => e.list !== 'gi');
    const live = Stats.session();
    const n = games.length;
    const inList = new Map(games.map((g) => [g.id, g]));
    const lib = new Map(state.all.map((g) => [g.id, g]));
    const resolve = (g) => inList.get(g.id) || lib.get(g.id) || g;
    const counts = days.map((d) => Math.min(gamesFor(cfg, d.wd), n));
    const off = n ? (weekIndex(days[0].date) * counts.reduce((a, b) => a + b, 0)) % n : 0;
    const order = games.map((_, i) => games[(off + i) % n]);
    const minsBefore = (t) => {
      const m = new Map();
      for (const e of sessions) if (e.start < t) m.set(e.id, (m.get(e.id) || 0) + e.minutes);
      return m;
    };
    let cursor = 0;
    const choose = (want, keep, loadMap) => {
      const chosen = keep.slice(0, want);
      while (chosen.length < want) {
        let best = null, bestLoad = Infinity;
        for (let j = 0; j < n; j++) {
          const g = order[(cursor + j) % n];
          if (chosen.some((c) => c.id === g.id)) continue;
          const l = loadMap.get(g.id) || 0;
          if (l < bestLoad) { bestLoad = l; best = g; }
        }
        if (!best) break;
        chosen.push(best);
      }
      return chosen;
    };

    const frozen = store.get('agendaDays', {});
    let proj = null;                 // previsão dos dias seguintes (minutos já jogados + marcados)
    const out = days.map((d, k) => {
      const want = counts[k];
      const est = want ? Math.round(freeMinutes(cfg, d.wd) / want) : 0;
      const sig = JSON.stringify([cfg.slots[d.wd] || [], cfg.session || 0]);
      const played = new Map();
      for (const e of sessions) if (e.start >= d.start && e.start < d.end) played.set(e.id, (played.get(e.id) || 0) + e.minutes);
      const fz = frozen[d.key];
      let picked;
      if (k < ti) {
        // sem registro (agenda ainda não existia, ou o app não foi aberto): não inventa, mostra só o que foi jogado
        picked = fz ? fz.games.map(resolve) : [];
      } else if (k === ti) {
        // guardado e com os mesmos horários: mantém (sem os que saíram da lista) e completa as vagas;
        // horários mudaram: recalcula, começando pelos que já foram jogados hoje
        const keep = fz && fz.sig === sig
          ? fz.games.filter((g) => inList.has(g.id)).map(resolve)
          : [...played].filter(([id]) => inList.has(id)).sort((a, b) => b[1] - a[1]).map(([id]) => inList.get(id));
        picked = choose(want, keep, minsBefore(d.start));
        const rec = { sig, games: picked.map(snap) };
        if (JSON.stringify(rec) !== JSON.stringify(fz)) {
          frozen[d.key] = rec;
          const limit = d.start - KEEP_DAYS * DAY;
          for (const key of Object.keys(frozen)) {
            const [y, m, dd] = key.split('-').map(Number);
            if (new Date(y, m - 1, dd).getTime() < limit) delete frozen[key];
          }
          store.set('agendaDays', frozen);
        }
        proj = minsBefore(Infinity);
        for (const g of picked) if ((played.get(g.id) || 0) < est) proj.set(g.id, (proj.get(g.id) || 0) + est - (played.get(g.id) || 0));
      } else {
        picked = choose(want, [], proj);
        for (const g of picked) proj.set(g.id, (proj.get(g.id) || 0) + est);
      }
      cursor += want;
      const isLive = (id) => !!live && live.id === id && live.start >= d.start && live.start < d.end;
      const item = (g, minutes) => ({ game: g, minutes, live: isLive(g.id), done: minutes >= DONE_MIN || isLive(g.id) });
      const items = picked.map((g) => item(g, played.get(g.id) || 0));
      const extra = [...played].filter(([id]) => !picked.some((g) => g.id === id))
        .map(([id, m]) => {
          const e = sessions.find((s) => s.id === id);
          return item(resolve({ id, name: e.name, cover: (Stats.get(id) || {}).cover || null }), m);
        })
        .filter((it) => it.done);
      return { ...d, when: k < ti ? 'past' : k === ti ? 'today' : 'future', window: windowText(cfg, d.wd), est, items, extra };
    });
    return out;
  }

  /** Hoje (ou null sem agenda). */
  const today = (p = plan()) => p.find((d) => d.when === 'today') || null;
  /** Ids dos jogos de hoje ainda não jogados (ganham bônus na roleta "sozinho"). */
  const todayPending = () => { const t = today(); return t ? t.items.filter((i) => !i.done).map((i) => i.game.id) : []; };

  return { DAY_NAMES, WEEK, MAX_PER_DAY, load, save, hasSlots, toMin, hhmm, plan, today, todayPending, weekIndex };
})();

/* ---------------- tela ---------------- */
const agendaUi = { draft: null, games: new Map(), view: store.get('agendaView', 'today') };

function openAgenda(edit) {
  const cfg = Agenda.load();
  if (edit || !Agenda.hasSlots(cfg)) openAgendaSetup(cfg);
  else renderAgendaView();
  showScreen('agenda');
}

const shortDate = (d) => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' });

/** Uma linha de jogo: ✓ jogado, jogando agora, ficou para depois (dia passado) ou o tempo sugerido. */
function agendaRow(it, day) {
  const g = it.game;
  agendaUi.games.set(g.id, g);
  const thumb = g.cover ? `<img src="${g.cover}" alt="" loading="lazy">` : `<span class="ph">🎮</span>`;
  let info, cls = '';
  if (it.live) { info = `jogando agora · ${fmtMinutes(it.minutes)}`; cls = ' live'; }
  else if (it.done) { info = `joguei ${fmtMinutes(it.minutes)}`; cls = ' done'; }
  else if (day.when === 'past') { info = 'ficou para depois'; cls = ' later'; }
  else info = day.est ? `uns ${fmtMinutes(day.est)}` : '';
  const mark = it.done ? `<span class="ag-mark on">✓</span>` : `<span class="ag-mark"></span>`;
  return `<button class="prow ag-row${cls}" data-id="${esc(g.id)}">${thumb}
    <span class="nm">${esc(g.name)}<small>${info}</small></span>${mark}</button>`;
}

function renderAgendaView() {
  $('#agendaSetup').hidden = true;
  $('#agendaWeek').hidden = false;
  $('#agendaTabs').hidden = false;
  $('#agendaTitle').textContent = 'Minha agenda';
  for (const b of document.querySelectorAll('#agendaTabs .chip')) b.classList.toggle('on', b.dataset.v === agendaUi.view);
  agendaUi.games = new Map();
  const games = listGames('now');
  const p = Agenda.plan();
  let html = '';
  if (!games.length) {
    html += `<div class="ag-warn"><p>Sua lista "Estou jogando sozinho" está vazia, então não há jogos para distribuir.</p>
      <button class="ghost" id="agendaFill">✏️ Escolher meus jogos</button></div>`;
  }
  html += agendaUi.view === 'week' ? agendaWeekHtml(p, games) : agendaTodayHtml(p);
  $('#agendaWeek').innerHTML = html;
  $('#agendaAction').textContent = '🕒 Mudar meus horários';
  $('#agendaAction').onclick = () => { location.hash = 'agenda-edit'; };
  const fill = $('#agendaFill');
  if (fill) fill.onclick = () => editList('now');
}

/** Visão de túnel: só hoje, sem os outros dias. */
function agendaTodayHtml(p) {
  const t = p.find((d) => d.when === 'today');
  $('#agendaHead').textContent = `Hoje · ${Agenda.DAY_NAMES[t.wd]}, ${shortDate(t.date)}` + (t.window ? ` · ${t.window}` : '');
  let html = '';
  if (!t.items.length) {
    html += `<div class="ag-free"><b>Hoje não tem horário marcado</b>
      <p class="hint">Dia livre. Se der vontade de jogar, a lista "sozinho" continua lá.</p></div>`;
  } else {
    html += `<div class="ag-today">${t.items.map((it) => agendaRow(it, t)).join('')}</div>`;
    if (t.items.every((it) => it.done && !it.live)) html += `<p class="ag-yay">Você jogou todos os de hoje 💜</p>`;
  }
  if (t.extra.length) html += `<h4 class="ag-sub">Também joguei hoje</h4><div class="ag-today">${t.extra.map((it) => agendaRow(it, t)).join('')}</div>`;
  if (t.items.length) html += `<p class="hint ag-note">Jogue na ordem que quiser. Toque num jogo para começar a contar o tempo.
    O que não der hoje volta nos próximos dias.</p>`;
  return html;
}

/** Visão global: a semana inteira, com o que foi jogado e o que ficou para depois. */
function agendaWeekHtml(p, games) {
  const marked = p.reduce((s, d) => s + d.items.length, 0);
  const done = p.reduce((s, d) => s + d.items.filter((it) => it.done).length, 0);
  $('#agendaHead').textContent = `Semana de ${p[0].date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} · ` +
    `${marked} ${marked === 1 ? 'jogo marcado' : 'jogos marcados'} · ${done} ✓`;
  let html = '';
  if (games.length > marked && marked) {
    html += `<p class="hint ag-note">Você tem ${games.length} jogos e ${marked} vagas na semana: os que não couberem entram na próxima.</p>`;
  }
  for (const d of p) {
    if (!d.items.length && !d.extra.length) continue;
    html += `<div class="ag-day ${d.when}">
      <h3>${d.when === 'today' ? 'Hoje · ' : ''}${Agenda.DAY_NAMES[d.wd]} <small>${shortDate(d.date)}${d.window ? ' · ' + d.window : ''}</small></h3>
      ${d.items.map((it) => agendaRow(it, d)).join('')}
      ${d.extra.length ? `<p class="ag-also">Também: ${d.extra.map((it) => `${esc(it.game.name)} (${fmtMinutes(it.minutes)})`).join(' · ')}</p>` : ''}
    </div>`;
  }
  html += `<p class="hint ag-note">Os próximos dias são uma previsão: vão para os jogos com menos tempo jogado na semana,
    então se ajustam sozinhos conforme você joga.</p>`;
  return html;
}

$('#agendaTabs').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b || b.dataset.v === agendaUi.view) return;
  agendaUi.view = b.dataset.v;
  store.set('agendaView', agendaUi.view);
  renderAgendaView();
});

$('#agendaWeek').addEventListener('click', (e) => {
  const row = e.target.closest('.ag-row');
  if (!row) return;
  const g = agendaUi.games.get(row.dataset.id);
  if (g) askToPlay(g, 'now');   // conta como jogada "sozinho"
});

/* ---- perguntas: dias e horários livres ---- */
function openAgendaSetup(cfg) {
  agendaUi.draft = cfg ? JSON.parse(JSON.stringify(cfg)) : { slots: {}, session: 60 };
  $('#agendaWeek').hidden = true;
  $('#agendaTabs').hidden = true;
  $('#agendaSetup').hidden = false;
  $('#agendaTitle').textContent = cfg && Agenda.hasSlots(cfg) ? 'Meus horários' : 'Montar minha agenda';
  $('#agendaHead').textContent = 'Marque os dias e os horários livres';
  $('#agendaSession').value = String(agendaUi.draft.session ?? 60);
  renderAgendaDays();
  $('#agendaAction').textContent = '✓ Salvar e montar a agenda';
  $('#agendaAction').onclick = saveAgendaSetup;
}

function renderAgendaDays() {
  const slots = agendaUi.draft.slots;
  $('#agendaDays').innerHTML = Agenda.WEEK.map((day) => {
    const ranges = slots[day] || [];
    return `<div class="ag-edit${ranges.length ? ' on' : ''}" data-day="${day}">
      <div class="ag-edit-head"><b>${Agenda.DAY_NAMES[day]}</b>
        <button class="chip ag-add">${ranges.length ? '＋ outro horário' : '＋ tenho tempo'}</button></div>
      ${ranges.map((r, j) => `<div class="ag-range" data-j="${j}">
        <input type="time" class="ag-s" value="${r.start}"><span>até</span><input type="time" class="ag-e" value="${r.end}">
        <button class="ag-del" aria-label="Tirar horário">✕</button></div>`).join('')}
    </div>`;
  }).join('');
}

/** Lê o que está digitado nos campos para o rascunho (antes de redesenhar ou salvar). */
function readAgendaInputs() {
  for (const box of document.querySelectorAll('#agendaDays .ag-edit')) {
    const day = box.dataset.day;
    const ranges = [...box.querySelectorAll('.ag-range')].map((r) => ({ start: r.querySelector('.ag-s').value, end: r.querySelector('.ag-e').value }));
    if (ranges.length) agendaUi.draft.slots[day] = ranges; else delete agendaUi.draft.slots[day];
  }
  agendaUi.draft.session = +$('#agendaSession').value;
}

$('#agendaDays').addEventListener('click', (e) => {
  const box = e.target.closest('.ag-edit');
  if (!box) return;
  readAgendaInputs();
  const day = box.dataset.day, list = agendaUi.draft.slots[day] || [];
  if (e.target.closest('.ag-add')) {
    // sugestão: depois do último horário do dia, ou à noite
    const last = list[list.length - 1];
    const s = last ? Math.min(Agenda.toMin(last.end) + 60, 23 * 60) : 19 * 60;
    list.push({ start: Agenda.hhmm(s), end: Agenda.hhmm(Math.min(s + 120, 23 * 60 + 59)) });
    agendaUi.draft.slots[day] = list;
  } else if (e.target.closest('.ag-del')) {
    list.splice(+e.target.closest('.ag-range').dataset.j, 1);
    if (list.length) agendaUi.draft.slots[day] = list; else delete agendaUi.draft.slots[day];
  } else return;
  renderAgendaDays();
});

$('#agendaCopy').onclick = () => {
  readAgendaInputs();
  const mon = agendaUi.draft.slots[1];
  if (!mon || !mon.length) { toast('Coloque primeiro os horários de segunda'); return; }
  for (const d of [2, 3, 4, 5]) agendaUi.draft.slots[d] = mon.map((r) => ({ ...r }));
  renderAgendaDays();
  toast('Horários de segunda copiados até sexta');
};

function saveAgendaSetup() {
  readAgendaInputs();
  const d = agendaUi.draft;
  for (const day of Object.keys(d.slots)) {
    d.slots[day] = d.slots[day].filter((r) => r.start && r.end && r.start !== r.end);
    if (!d.slots[day].length) delete d.slots[day];
  }
  if (!Agenda.hasSlots(d)) { toast('Marque pelo menos um horário livre'); return; }
  Agenda.save(d);
  toast('Agenda montada');
  if (location.hash === '#agenda-edit') history.back();   // volta para a agenda
  else renderAgendaView();
}

$('#agendaBack').onclick = () => history.back();
$('#openAgenda').onclick = () => { location.hash = 'agenda'; };

/** Botão da tela inicial: os jogos de hoje que faltam (sem mostrar os outros dias). */
function renderAgendaButton() {
  const sub = $('#agendaSub');
  if (!Agenda.hasSlots(Agenda.load())) { sub.textContent = 'Diga seus horários livres e eu escolho os jogos de cada dia'; return; }
  const t = Agenda.today();
  if (!t || !t.items.length) { sub.textContent = 'Hoje é dia livre · ver a semana'; return; }
  const left = t.items.filter((it) => !it.done), done = t.items.length - left.length;
  sub.textContent = !left.length ? 'Hoje: tudo jogado ✓'
    : `Hoje: ${left.map((it) => it.game.name).join(' · ')}` + (done ? ` (${done} ✓)` : '');
}
