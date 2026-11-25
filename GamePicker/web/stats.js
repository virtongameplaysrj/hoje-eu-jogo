/* Histórico do app: quantas vezes jogou, tempo, recusas, a sessão em andamento
   e o registro de cada sessão (data, minutos e em qual lista: 'gi', 'now' = sozinho, ou null).
   Fica só no aparelho (separado das horas da Steam/Epic/GOG). */
const Stats = (() => {
  const DAY = 864e5;
  const KEY = 'stats', SESSION = 'session', LOG = 'log', LOG_MAX = 3000;
  const blank = () => ({ plays: 0, minutes: 0, last: 0, rejects: 0, lastReject: 0, rejectTimes: [], name: '', cover: null });

  const all = () => store.get(KEY, {});
  const get = (id) => all()[id] || null;
  const log = () => store.get(LOG, []);

  function update(g, fn) {
    const s = all();
    const r = Object.assign(blank(), s[g.id]);
    r.name = g.name; r.cover = g.cover || r.cover || null;
    fn(r);
    s[g.id] = r;
    store.set(KEY, s);
  }

  /** "Não vou jogar" (na roleta): derruba a chance por alguns dias; recusas seguidas se somam. */
  function reject(g) {
    update(g, (r) => {
      const now = Date.now();
      r.rejects++; r.lastReject = now;
      r.rejectTimes = (r.rejectTimes || []).concat(now).slice(-10);
    });
  }
  const rejectsThisWeek = (id) => ((get(id) || {}).rejectTimes || []).filter((t) => Date.now() - t < 7 * DAY).length;

  /** "Vou jogar": conta a jogada e abre a sessão (guarda a HORA de início e a lista de onde veio). */
  function start(g, list = null) {
    update(g, (r) => { r.plays++; r.last = Date.now(); });
    store.set(SESSION, { id: g.id, name: g.name, cover: g.cover || null, hero: g.hero || null, start: Date.now(), list });
  }

  const session = () => store.get(SESSION, null);
  const elapsedMin = (s = session()) => (s ? Math.max(0, Math.round((Date.now() - s.start) / 60000)) : 0);

  /** Encerra a sessão somando os minutos (ou os minutos corrigidos pelo usuário) e registra no log. */
  function stop(minutes = elapsedMin()) {
    const s = session();
    if (!s) return null;
    update({ id: s.id, name: s.name, cover: s.cover }, (r) => { r.minutes += minutes; r.last = Date.now(); });
    store.set(LOG, log().concat({ id: s.id, name: s.name, list: s.list || null, start: s.start, minutes }).slice(-LOG_MAX));
    store.set(SESSION, null);
    return { name: s.name, minutes };
  }

  /** Sessões a partir de uma data (inclui a que está em andamento, com os minutos até agora). */
  function sessionsSince(t) {
    const out = log().filter((e) => e.start >= t);
    const s = session();
    if (s && s.start >= t) out.push({ id: s.id, name: s.name, list: s.list || null, start: s.start, minutes: elapsedMin(s) });
    return out;
  }

  /** Sessões antigas (de antes do registro por lista) contam para "sozinho", nunca para a Gi. */
  const inList = (e, list) => e.list === list || (!e.list && list === 'now');

  /** Quando este jogo foi jogado pela última vez NESTA lista (ms), ou 0. */
  function lastPlayedIn(id, list) {
    const l = log();
    for (let i = l.length - 1; i >= 0; i--) if (l[i].id === id && inList(l[i], list)) return l[i].start;
    if (list === 'now' && !l.some((e) => e.id === id)) return (get(id) || {}).last || 0;   // jogadas de antes do registro
    return 0;
  }

  /** Cada recusa recente divide a chance (metade na hora, voltando ao normal em ~1 semana); elas se acumulam. */
  function rejectFactor(r, now) {
    const times = r.rejectTimes && r.rejectTimes.length ? r.rejectTimes : (r.lastReject ? [r.lastReject] : []);
    return times.reduce((f, t) => f * (1 - 0.5 * Math.exp(-(now - t) / DAY / 3)), 1);
  }

  /**
   * Peso de um jogo no sorteio (quanto maior, mais chance).
   *  - mode 'now' (listas "Estou jogando", list = 'gi' ou 'now'): rodízio por saudade. Todos começam iguais;
   *    jogado hoje nesta lista → 0,2, e a chance continua subindo com os dias parado (1 dia 0,7 · 2 dias 1,2 ·
   *    1 semana ou mais 4). Nunca jogado nesta lista → 3. O "nunca jogado na loja" não conta aqui.
   *  - mode 'all' (categorias): nunca jogado nas lojas 3×; jogado há pouco pelo app cai para ~15% e volta
   *    em ~2 semanas; muito tempo jogado (10 h) = metade.
   *  - recusas recentes se acumulam (ver rejectFactor). Nunca abaixo de 5%: nenhum jogo some de vez.
   */
  function weight(g, mode = 'all', list = 'now') {
    const now = Date.now(), r = get(g.id);
    if (mode === 'now') {
      const last = lastPlayedIn(g.id, list);
      let w = last ? Math.min(4, 0.2 + (now - last) / DAY / 2) : 3;
      if (r) w *= rejectFactor(r, now);
      return Math.max(w, 0.05);
    }
    let w = g.minutes ? 1 : 3;
    if (!r) return w;
    if (r.last) {
      const days = (now - r.last) / DAY;
      w *= 1 - 0.85 * Math.exp(-days / 7);
      w *= 1 / (1 + r.minutes / 600);
    }
    w *= rejectFactor(r, now);
    return Math.max(w, 0.05 * (g.minutes ? 1 : 3));
  }

  /* ---------- backup (texto para copiar/colar) ---------- */
  const BACKUP_KEYS = ['stats', 'log', 'now', 'nowGi', 'agenda', 'agendaDays', 'ps2', 'hidden', 'session', 'recent'];
  function exportText() {
    const data = { app: 'hoje-eu-jogo', v: 1, at: new Date().toISOString() };
    for (const k of BACKUP_KEYS) data[k] = store.get(k, null);
    return JSON.stringify(data);
  }
  function importText(text) {
    const data = JSON.parse(text);
    if (!data || data.app !== 'hoje-eu-jogo') throw new Error('não é um backup deste app');
    for (const k of BACKUP_KEYS) if (k in data && data[k] !== null) store.set(k, data[k]);
  }

  return { all, get, log, reject, rejectsThisWeek, start, stop, session, elapsedMin, sessionsSince, inList,
    lastPlayedIn, weight, exportText, importText };
})();

/** "1h 05min", "42min", "0min" */
function fmtMinutes(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? `${h}h ${String(mm).padStart(2, '0')}min` : `${mm}min`;
}
