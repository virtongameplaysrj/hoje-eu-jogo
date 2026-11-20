/* "Estou jogando agora": até NOW_MAX jogos, confirmados uma vez por dia.
   Salvo no aparelho como { ids: [...], manual: [jogos digitados], confirmed: 'AAAA-M-D' } */
const NOW_MAX = 15;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const loadNow = () => store.get('now', null);
const confirmedToday = (n) => !!(n && n.ids.length && n.confirmed === today());

/** Jogos da lista, na ordem escolhida (os da biblioteca + os adicionados à mão). */
function nowGames(n = loadNow()) {
  if (!n) return [];
  const byId = new Map(state.all.map((g) => [g.id, g]));
  return n.ids.map((id) => byId.get(id) || n.manual.find((m) => m.id === id)).filter(Boolean);
}

function removeFromNow(id) {
  const n = loadNow();
  if (!n) return;
  n.ids = n.ids.filter((x) => x !== id);
  n.manual = n.manual.filter((m) => m.id !== id);
  store.set('now', n);
}

/* ---------------- tela inicial ---------------- */
function renderStart() {
  const n = loadNow();
  const mine = nowGames(n);
  $('#startCount').textContent = `${state.all.length} jogos na biblioteca`;
  $('#nowSub').textContent = !mine.length
    ? `Escolha até ${NOW_MAX} jogos que você está jogando`
    : `${mine.length} ${mine.length === 1 ? 'jogo' : 'jogos'}` + (confirmedToday(n) ? '' : ' · confirmar hoje');
  $('#nowCollage').innerHTML = mine.filter((g) => g.cover).slice(0, 4)
    .map((g) => `<img src="${g.cover}" alt="" loading="lazy">`).join('');
  const cats = CATEGORIES.filter((c) => state.byCat.get(c.key).length).length;
  $('#catsSub').textContent = `${cats} categorias · ${state.all.length} jogos`;
  if (!$('#catsCollage').children.length) {
    $('#catsCollage').innerHTML = shuffle(state.all.filter((g) => g.cover)).slice(0, 4)
      .map((g) => `<img src="${g.cover}" alt="" loading="lazy">`).join('');
  }
}

$('#groupNow').onclick = () => {
  // já confirmou hoje → direto para os jogos; senão → tela de escolher/confirmar
  if (confirmedToday(loadNow())) go('now');
  else location.hash = 'now-pick';
};
$('#groupCats').onclick = () => { location.hash = 'cats'; };
$('#homeBack').onclick = () => history.back();
$('#pickerBack').onclick = () => history.back();

/* ---------------- escolher / confirmar ---------------- */
// unsaved: rascunho que sobrevive a um "voltar" sem querer (até confirmar ou fechar o app)
const picker = { draft: null, original: '', confirming: false, unsaved: null };

function openPicker() {
  const n = loadNow() || { ids: [], manual: [] };
  const src = picker.unsaved || n;
  picker.draft = { ids: src.ids.slice(), manual: src.manual.slice() };
  picker.unsaved = picker.draft;
  picker.original = JSON.stringify(n.ids);
  picker.confirming = n.ids.length > 0;
  $('#pickSearch').value = '';
  $('#manualName').value = '';
  $('#pickResults').innerHTML = '';
  renderPicker();
  showScreen('picker');
}

function draftGames() { return nowGames({ ids: picker.draft.ids, manual: picker.draft.manual }); }

function rowHtml(g, action) {
  const thumb = g.cover ? `<img src="${g.cover}" alt="" loading="lazy">` : `<span class="ph">🎮</span>`;
  const where = g.stores.map((s) => STORE_LABEL[s] || s).join(' · ');
  const btn = action === 'add' ? '＋' : '✕';
  return `<button class="prow ${action}" data-id="${esc(g.id)}">${thumb}
    <span class="nm">${esc(g.name)}<small>${where}</small></span><span class="x">${btn}</span></button>`;
}

function renderPicker() {
  const games = draftGames();
  const changed = JSON.stringify(picker.draft.ids) !== picker.original;
  $('#pickerTitle').textContent = picker.confirming ? 'Ainda está jogando estes?' : 'O que você está jogando agora?';
  $('#pickerSub').textContent = picker.confirming
    ? `${games.length} de ${NOW_MAX} · toque em ✕ para tirar um, busque abaixo para trocar`
    : `${games.length} de ${NOW_MAX} · busque na biblioteca ou digite o nome`;
  $('#picked').innerHTML = games.length
    ? games.map((g) => rowHtml(g, 'remove')).join('')
    : `<p class="empty-pick">Nenhum jogo ainda.</p>`;
  const full = games.length >= NOW_MAX;
  $('#pickSearch').disabled = full;
  $('#pickSearch').placeholder = full ? `Lista cheia (${NOW_MAX}). Tire um para trocar.` : '🔍 Buscar na sua biblioteca…';
  $('#manualName').disabled = full;
  $('#manualAdd').disabled = full;
  const btn = $('#pickConfirm');
  btn.disabled = !games.length;
  btn.textContent = picker.confirming && !changed
    ? '✓ Sim, continuo jogando estes'
    : (games.length === 1 ? 'Pronto, ver meu jogo' : `Pronto, ver meus ${games.length} jogos`);
  if (full) $('#pickResults').innerHTML = '';
}

$('#picked').addEventListener('click', (e) => {
  const row = e.target.closest('.prow');
  if (!row) return;
  const id = row.dataset.id;
  picker.draft.ids = picker.draft.ids.filter((x) => x !== id);
  picker.draft.manual = picker.draft.manual.filter((m) => m.id !== id);
  renderPicker();
  searchLibrary();
});

/** Busca sem acento e sem pontuação; todas as palavras digitadas precisam aparecer. */
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function searchLibrary() {
  const q = fold($('#pickSearch').value);
  const box = $('#pickResults');
  if (q.length < 2) { box.innerHTML = ''; return; }
  const words = q.split(' ');
  const taken = new Set(picker.draft.ids);
  // relevância: nome exato < começa com < palavras começam com < só contém
  const rank = (name) => {
    if (name === q) return 0;
    if (name.startsWith(q)) return 1;
    const parts = name.split(' ');
    return words.every((w) => parts.some((p) => p.startsWith(w))) ? 2 : 3;
  };
  const hits = [];
  for (const g of state.all) {
    if (taken.has(g.id)) continue;
    const name = g._fold || (g._fold = fold(g.name));
    if (words.every((w) => name.includes(w))) hits.push([rank(name), name.length, g]);
  }
  hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  hits.splice(15);
  for (let i = 0; i < hits.length; i++) hits[i] = hits[i][2];
  box.innerHTML = hits.length
    ? hits.map((g) => rowHtml(g, 'add')).join('')
    : `<p class="empty-pick">Nada encontrado. Você pode adicionar o nome à mão aqui embaixo.</p>`;
}
$('#pickSearch').addEventListener('input', searchLibrary);

$('#pickResults').addEventListener('click', (e) => {
  const row = e.target.closest('.prow');
  if (!row) return;
  if (picker.draft.ids.length >= NOW_MAX) { toast(`Máximo de ${NOW_MAX} jogos`); return; }
  picker.draft.ids.push(row.dataset.id);
  $('#pickSearch').value = '';
  $('#pickResults').innerHTML = '';
  renderPicker();
  // cursor de volta na busca (o teclado não fecha) para já procurar o próximo
  if (picker.draft.ids.length < NOW_MAX) $('#pickSearch').focus();
});

function addManual() {
  const name = $('#manualName').value.trim();
  if (!name) return;
  if (picker.draft.ids.length >= NOW_MAX) { toast(`Máximo de ${NOW_MAX} jogos`); return; }
  const g = { id: 'manual:' + Date.now(), name, stores: ['manual'], tags: [], minutes: 0,
    cover: null, hero: null, trailer: null, youtube: null, desc: 'Adicionado à mão.' };
  picker.draft.manual.push(g);
  picker.draft.ids.push(g.id);
  $('#manualName').value = '';
  renderPicker();
  if (picker.draft.ids.length < NOW_MAX) $('#manualName').focus();
}
$('#manualAdd').onclick = addManual;
$('#manualName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addManual(); });

$('#pickConfirm').onclick = () => {
  const ids = picker.draft.ids;
  if (!ids.length) return;
  store.set('now', { ids, manual: picker.draft.manual.filter((m) => ids.includes(m.id)), confirmed: today() });
  picker.unsaved = null;               // confirmado: não há mais rascunho pendente
  state.byCat.set('now', nowGames());
  renderStart();
  location.replace('#c=now');          // replace: o "voltar" da prateleira leva ao início
};

/* ---------------- inicialização ---------------- */
loadLibrary().then(() => { renderHome(); route(); });
