/* Agenda (no estilo do Rotina Gentil): o app pergunta os horários livres de cada dia da semana
   e distribui neles os jogos da lista "Estou jogando sozinho".
   Salvo como { slots: { 1: [{ start: '19:00', end: '21:00' }], ... }, session: 60 }
   (dias como Date.getDay: 0 = domingo; session 0 = um jogo para o horário inteiro). */
const Agenda = (() => {
  const DAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const WEEK = [1, 2, 3, 4, 5, 6, 0];          // a semana começa na segunda
  const DAY = 864e5;

  const load = () => store.get('agenda', null);
  const save = (cfg) => store.set('agenda', cfg);
  const hasSlots = (cfg) => !!cfg && WEEK.some((d) => (cfg.slots[d] || []).length);
  const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /** Horários da semana picados em blocos (um jogo por bloco), em ordem de segunda a domingo. */
  function blocks(cfg) {
    const out = [];
    for (const day of WEEK) {
      const ranges = (cfg.slots[day] || []).map((r) => {
        const s = toMin(r.start); let e = toMin(r.end);
        if (e <= s) e += 1440;                   // 22:00 até 01:00 passa da meia-noite
        return { s, e };
      }).sort((a, b) => a.s - b.s);
      for (const { s, e } of ranges) {
        const len = e - s, size = cfg.session > 0 ? cfg.session : len;
        let n = Math.max(1, Math.floor(len / size));
        if (len - n * size >= size / 2) n++;     // sobra de meia sessão ou mais vira um bloco curto; menos que isso, estica o último
        for (let i = 0; i < n; i++) out.push({ day, start: s + i * size, end: i === n - 1 ? e : s + (i + 1) * size });
      }
    }
    return out;
  }

  /** Nº da semana (segunda a domingo) desde 1970: faz o rodízio continuar de uma semana para a outra. */
  function weekIndex(date = new Date()) {
    const d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.floor(Math.round((d - Date.UTC(1970, 0, 5)) / DAY) / 7);   // 05/01/1970 foi segunda
  }

  /**
   * Distribui os jogos da lista "sozinho" pelos blocos da semana.
   *  - Horários que já passaram: rodízio simples na ordem da lista (só para referência).
   *  - Do horário atual em diante: cada bloco vai para o jogo com MENOS tempo na semana
   *    (minutos jogados sozinho desde segunda + minutos já marcados nos próximos blocos).
   *    Jogou um jogo fora da agenda? Os próximos horários passam para os outros.
   *  - Empate: segue o rodízio a partir da posição do bloco, na ordem da lista girada a cada semana
   *    (a semana seguinte começa de onde esta parou: com mais jogos que horários, nenhum fica de fora).
   *  - Evita o mesmo jogo em dois blocos seguidos do mesmo dia.
   *  - O bloco que está acontecendo só conta o que foi jogado ANTES dele começar (não muda no meio).
   * Determinístico: os mesmos horários, lista e sessões dão sempre a mesma agenda.
   */
  function plan(cfg = load(), games = listGames('now'), date = new Date()) {
    if (!hasSlots(cfg)) return [];
    const bl = blocks(cfg);
    if (!games.length) return bl.map((b) => ({ ...b, game: null }));
    const n = games.length, off = (weekIndex(date) * bl.length) % n;
    const order = games.map((_, i) => games[(off + i) % n]);
    const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7)).getTime();
    const nowMin = (date.getTime() - monday) / 60000;                 // minutos desde segunda 00:00
    const played = Stats.sessionsSince(monday).filter((e) => Stats.inList(e, 'now'));
    const playedBefore = (id, t) => played.reduce((m, e) => m + (e.id === id && e.start < t ? e.minutes : 0), 0);
    const assigned = new Map();
    let prev = null;
    return bl.map((b, i) => {
      const base = WEEK.indexOf(b.day) * 1440, bStart = base + b.start, bEnd = base + b.end;
      let game;
      if (bEnd <= nowMin) game = order[i % n];
      else {
        const t = bStart <= nowMin ? monday + bStart * 60000 : Infinity;
        let best = Infinity;
        // desempate a partir da posição deste bloco: sem jogadas na semana, fica igual ao rodízio simples
        for (let k = 0; k < n; k++) {
          const g = order[(i + k) % n];
          if (n > 1 && prev && prev.day === b.day && prev.game === g) continue;
          const load = playedBefore(g.id, t) + (assigned.get(g.id) || 0);
          if (load < best) { best = load; game = g; }
        }
        assigned.set(game.id, (assigned.get(game.id) || 0) + b.end - b.start);
      }
      const out = { ...b, game };
      prev = out;
      return out;
    });
  }

  /** Bloco acontecendo agora (ou o próximo de hoje). */
  function current(p = plan(), now = new Date()) {
    const d = now.getDay(), min = now.getHours() * 60 + now.getMinutes(), yest = (d + 6) % 7;
    const live = p.find((b) => (b.day === d && b.start <= min && min < b.end) ||
      (b.day === yest && b.end > 1440 && min < b.end - 1440));
    if (live) return { block: live, live: true };
    const next = p.find((b) => b.day === d && b.start > min);
    return next ? { block: next, live: false } : null;
  }

  return { DAY_NAMES, WEEK, load, save, hasSlots, toMin, hhmm, blocks, plan, current, weekIndex };
})();

/* ---------------- tela ---------------- */
const agendaUi = { draft: null };

function openAgenda(edit) {
  const cfg = Agenda.load();
  if (edit || !Agenda.hasSlots(cfg)) openAgendaSetup(cfg);
  else renderAgendaWeek();
  showScreen('agenda');
}

function renderAgendaWeek() {
  $('#agendaSetup').hidden = true;
  $('#agendaWeek').hidden = false;
  $('#agendaTitle').textContent = 'Minha agenda';
  const games = listGames('now');
  const p = Agenda.plan();
  const cur = Agenda.current(p);
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const mins = p.reduce((s, b) => s + b.end - b.start, 0);
  $('#agendaHead').textContent = `Semana de ${monday.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} · ` +
    `${p.length} ${p.length === 1 ? 'horário' : 'horários'} · ${fmtMinutes(mins)} para jogar sozinho`;

  let html = '';
  if (!games.length) {
    html += `<div class="ag-warn"><p>Sua lista "Estou jogando sozinho" está vazia, então não há jogos para distribuir.</p>
      <button class="ghost" id="agendaFill">✏️ Escolher meus jogos</button></div>`;
  } else if (games.length > p.length) {
    html += `<p class="hint ag-note">Você tem ${games.length} jogos e ${p.length} horários: os que não couberem esta semana entram na próxima.</p>`;
  }
  Agenda.WEEK.forEach((day, k) => {
    const items = p.map((b, i) => ({ ...b, i })).filter((b) => b.day === day);
    if (!items.length) return;
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + k);
    const isToday = date.toDateString() === now.toDateString();
    const past = date < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    html += `<div class="ag-day${isToday ? ' today' : ''}${past ? ' past' : ''}">
      <h3>${isToday ? 'Hoje · ' : ''}${Agenda.DAY_NAMES[day]} <small>${date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' })}</small></h3>
      ${items.map((b) => {
        const g = b.game;
        const thumb = g && g.cover ? `<img src="${g.cover}" alt="" loading="lazy">` : `<span class="ph">🎮</span>`;
        const badge = cur && cur.block === p[b.i] ? `<span class="ag-badge${cur.live ? ' live' : ''}">${cur.live ? 'agora' : 'próximo'}</span>` : '';
        return `<button class="prow ag-row" data-i="${b.i}"${g ? '' : ' disabled'}>${thumb}
          <span class="nm">${g ? esc(g.name) : '—'}<small>${Agenda.hhmm(b.start)} – ${Agenda.hhmm(b.end)} · ${fmtMinutes(b.end - b.start)}</small></span>${badge}</button>`;
      }).join('')}
    </div>`;
  });
  html += `<p class="hint ag-note">Toque num jogo para começar a jogar e contar o tempo. Os próximos horários vão para os jogos
    com menos tempo jogado na semana: se jogar um fora da agenda, ela se ajusta sozinha.</p>`;
  $('#agendaWeek').innerHTML = html;
  $('#agendaAction').textContent = '🕒 Mudar meus horários';
  $('#agendaAction').onclick = () => { location.hash = 'agenda-edit'; };
  const fill = $('#agendaFill');
  if (fill) fill.onclick = () => editList('now');
}

$('#agendaWeek').addEventListener('click', (e) => {
  const row = e.target.closest('.ag-row');
  if (!row) return;
  const b = Agenda.plan()[+row.dataset.i];
  if (b && b.game) askToPlay(b.game, 'now');   // conta como jogada "sozinho"
});

/* ---- perguntas: dias e horários livres ---- */
function openAgendaSetup(cfg) {
  agendaUi.draft = cfg ? JSON.parse(JSON.stringify(cfg)) : { slots: {}, session: 60 };
  $('#agendaWeek').hidden = true;
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
  if (location.hash === '#agenda-edit') history.back();   // volta para a semana
  else renderAgendaWeek();
}

$('#agendaBack').onclick = () => history.back();
$('#openAgenda').onclick = () => { location.hash = 'agenda'; };

/** Botão da tela inicial: mostra o jogo de agora (ou o próximo de hoje). */
function renderAgendaButton() {
  const sub = $('#agendaSub');
  if (!Agenda.hasSlots(Agenda.load())) { sub.textContent = 'Diga seus horários livres e eu distribuo os jogos'; return; }
  const c = Agenda.current();
  sub.textContent = !c || !c.block.game ? 'Ver a semana'
    : c.live ? `Agora: ${c.block.game.name}` : `Hoje às ${Agenda.hhmm(c.block.start)}: ${c.block.game.name}`;
}
