/* Histórico do app: quantas vezes jogou, tempo, recusas e a sessão em andamento.
   Fica só no aparelho (separado das horas da Steam/Epic/GOG). */
const Stats = (() => {
  const DAY = 864e5;
  const KEY = 'stats', SESSION = 'session';
  const blank = () => ({ plays: 0, minutes: 0, last: 0, rejects: 0, lastReject: 0, name: '', cover: null });

  const all = () => store.get(KEY, {});
  const get = (id) => all()[id] || null;

  function update(g, fn) {
    const s = all();
    const r = Object.assign(blank(), s[g.id]);
    r.name = g.name; r.cover = g.cover || r.cover || null;
    fn(r);
    s[g.id] = r;
    store.set(KEY, s);
  }

  /** "Não vou jogar": derruba a chance por alguns dias. */
  function reject(g) { update(g, (r) => { r.rejects++; r.lastReject = Date.now(); }); }

  /** "Vou jogar": conta a jogada e abre a sessão (guarda a HORA de início, não um contador). */
  function start(g) {
    update(g, (r) => { r.plays++; r.last = Date.now(); });
    store.set(SESSION, { id: g.id, name: g.name, cover: g.cover || null, hero: g.hero || null, start: Date.now() });
  }

  const session = () => store.get(SESSION, null);
  const elapsedMin = (s = session()) => (s ? Math.max(0, Math.round((Date.now() - s.start) / 60000)) : 0);

  /** Encerra a sessão somando os minutos (ou os minutos corrigidos pelo usuário). */
  function stop(minutes = elapsedMin()) {
    const s = session();
    if (!s) return null;
    update({ id: s.id, name: s.name, cover: s.cover }, (r) => { r.minutes += minutes; r.last = Date.now(); });
    store.set(SESSION, null);
    return { name: s.name, minutes };
  }

  /**
   * Peso de um jogo no sorteio (quanto maior, mais chance).
   *  - nunca jogado nas lojas: 3× (como antes)
   *  - mode 'all' (categorias): jogado há pouco pelo app → cai para ~15% e volta aos poucos em ~2 semanas;
   *    muito tempo jogado pelo app → cai mais um pouco (10 h = metade)
   *  - mode 'now' ("Estou jogando"): rodízio — o último jogado cai para 25% e volta ao normal em ~2 dias
   *  - recusado ("não vou jogar"): metade da chance, voltando ao normal em ~1 semana
   *  - nunca abaixo de 5%: nenhum jogo some de vez
   */
  function weight(g, mode = 'all') {
    let w = g.minutes ? 1 : 3;
    const r = get(g.id);
    if (!r) return w;
    const now = Date.now();
    if (r.last) {
      const days = (now - r.last) / DAY;
      if (mode === 'now') w *= Math.min(1, 0.25 + days / 2.5);
      else {
        w *= 1 - 0.85 * Math.exp(-days / 7);
        w *= 1 / (1 + r.minutes / 600);
      }
    }
    if (r.lastReject) w *= 1 - 0.5 * Math.exp(-(now - r.lastReject) / DAY / 3);
    return Math.max(w, 0.05 * (g.minutes ? 1 : 3));
  }

  /* ---------- backup (texto para copiar/colar) ---------- */
  const BACKUP_KEYS = ['stats', 'now', 'ps2', 'hidden', 'session', 'recent'];
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

  return { all, get, reject, start, stop, session, elapsedMin, weight, exportText, importText };
})();

/** "1h 05min", "42min", "0min" */
function fmtMinutes(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  return h ? `${h}h ${String(mm).padStart(2, '0')}min` : `${mm}min`;
}
