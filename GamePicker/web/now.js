/* Listas "Estou jogando": com a Gi e sozinho. Até NOW_MAX jogos cada, confirmados uma vez por semana
   e editáveis a qualquer momento (✏️). Salvo no aparelho como
   { ids: [...], manual: [jogos digitados], confirmed: 'AAAA-M-D' }.
   A lista "sozinho" usa a chave antiga 'now' (era a única "Estou jogando agora"), então nada se perde. */
const NOW_MAX = 15;
const LISTS = {
  gi:  { key: 'gi',  store: 'nowGi', label: 'Estou jogando com a Gi', emoji: '💜' },
  now: { key: 'now', store: 'now',   label: 'Estou jogando sozinho',  emoji: '🎮' },
};
const isListCat = (cat) => cat in LISTS;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const loadNow = (list = 'now') => store.get(LISTS[list].store, null);
const CONFIRM_DAYS = 7;   // pergunta "ainda está jogando estes?" uma vez por semana (dá para editar a qualquer hora)
/** A lista foi confirmada (ou editada) nos últimos CONFIRM_DAYS dias? */
function confirmedToday(n) {
  if (!n || !n.ids.length || !n.confirmed) return false;
  const [y, m, d] = n.confirmed.split('-').map(Number);
  const now = new Date();
  return (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 864e5 < CONFIRM_DAYS;
}

/** Jogos de uma lista salva, na ordem escolhida (os da biblioteca + os adicionados à mão). */
function nowGames(n) {
  if (!n) return [];
  const byId = new Map(state.all.map((g) => [g.id, g]));
  return n.ids.map((id) => byId.get(id) || n.manual.find((m) => m.id === id)).filter(Boolean);
}
const listGames = (list) => nowGames(loadNow(list));

function removeFromNow(list, id) {
  const n = loadNow(list);
  if (!n) return;
  n.ids = n.ids.filter((x) => x !== id);
  n.manual = n.manual.filter((m) => m.id !== id);
  store.set(LISTS[list].store, n);
}

/* ---------------- tela inicial ---------------- */
function renderStart() {
  if (typeof renderPlayingBanner === 'function') renderPlayingBanner();
  if (typeof renderAgendaButton === 'function') renderAgendaButton();
  $('#startCount').textContent = `${state.all.length} jogos na biblioteca`;
  for (const key of Object.keys(LISTS)) {
    const n = loadNow(key);
    const mine = nowGames(n);
    $(`#${key}Sub`).textContent = !mine.length
      ? `Escolha até ${NOW_MAX} jogos`
      : `${mine.length} ${mine.length === 1 ? 'jogo' : 'jogos'}` + (confirmedToday(n) ? '' : ' · confirmar a lista');
    $(`#${key}Collage`).innerHTML = mine.filter((g) => g.cover).slice(0, 4)
      .map((g) => `<img src="${g.cover}" alt="" loading="lazy">`).join('');
  }
  const cats = CATEGORIES.filter((c) => state.byCat.get(c.key).length).length;
  $('#catsSub').textContent = `${cats} categorias · ${state.all.length} jogos`;
  if (!$('#catsCollage').children.length) {
    $('#catsCollage').innerHTML = shuffle(state.all.filter((g) => g.cover)).slice(0, 4)
      .map((g) => `<img src="${g.cover}" alt="" loading="lazy">`).join('');
  }
}

/** Abre o editor de uma lista: a qualquer momento, sem esperar a confirmação do dia. */
const editList = (list) => { location.hash = `pick=${list}&edit=1`; };

for (const key of Object.keys(LISTS)) {
  $(`#group${key === 'gi' ? 'Gi' : 'Now'}`).onclick = (e) => {
    if (e.target.closest('.edit')) return editList(key);
    // já confirmou hoje → direto para os jogos; senão → tela de escolher/confirmar
    if (confirmedToday(loadNow(key))) go(key);
    else location.hash = `pick=${key}`;
  };
}
$('#groupCats').onclick = () => { location.hash = 'cats'; };
$('#homeBack').onclick = () => history.back();
$('#pickerBack').onclick = () => history.back();
$('#editList').onclick = () => { if (isListCat(state.cat)) editList(state.cat); };

/* ---------------- escolher / confirmar / editar ---------------- */
// unsaved: rascunho por lista que sobrevive a um "voltar" sem querer (até salvar ou fechar o app)
const picker = { list: 'now', mode: 'new', draft: null, original: '', unsaved: {} };

/** mode: 'new' (lista vazia) · 'confirm' (pergunta do dia) · 'edit' (✏️ a qualquer momento) */
function openPicker(list, edit) {
  picker.list = list;
  const n = loadNow(list) || { ids: [], manual: [] };
  const src = picker.unsaved[list] || n;
  picker.draft = { ids: src.ids.slice(), manual: src.manual.slice() };
  picker.unsaved[list] = picker.draft;
  picker.original = JSON.stringify(n.ids);
  picker.mode = edit ? 'edit' : (n.ids.length ? 'confirm' : 'new');
  $('#pickSearch').value = '';
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
  const L = LISTS[picker.list];
  const who = picker.list === 'gi' ? 'com a Gi' : 'sozinho';
  $('#pickerTitle').textContent = picker.mode === 'edit' ? `✏️ ${L.label}`
    : picker.mode === 'confirm' ? `Ainda está jogando estes ${who}?` : `O que você está jogando ${who}?`;
  $('#pickerSub').textContent = picker.mode === 'new'
    ? `${games.length} de ${NOW_MAX} · busque na biblioteca ou digite o nome`
    : `${games.length} de ${NOW_MAX} · toque em ✕ para tirar um, busque abaixo para trocar`;
  $('#picked').innerHTML = games.length
    ? games.map((g) => rowHtml(g, 'remove')).join('')
    : `<p class="empty-pick">Nenhum jogo ainda.</p>`;
  const full = games.length >= NOW_MAX;
  $('#pickSearch').disabled = full;
  $('#pickSearch').placeholder = full ? `Lista cheia (${NOW_MAX}). Tire um para trocar.` : '🔍 Buscar ou digitar o nome do jogo…';
  const btn = $('#pickConfirm');
  btn.disabled = picker.mode !== 'edit' && !games.length;   // editando, pode até esvaziar a lista
  btn.textContent = picker.mode === 'edit' ? (changed ? '✓ Salvar lista' : '✓ Pronto')
    : picker.mode === 'confirm' && !changed ? '✓ Sim, continuo jogando estes'
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
  if (q.length < 2) { box.innerHTML = ''; picker.hits = 0; return; }
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
  picker.hits = hits.length;
  // sem resultado (ou nenhum é o certo): adiciona o que foi digitado com um toque, sem redigitar
  const typed = $('#pickSearch').value.trim();
  const manualRow = `<button class="prow add manual-add">
    <span class="ph">✍️</span><span class="nm">${hits.length ? 'Não é nenhum desses? ' : ''}Adicionar “${esc(typed)}”<small>fora da biblioteca · à mão</small></span><span class="x">＋</span></button>`;
  box.innerHTML = hits.length
    ? hits.map((g) => rowHtml(g, 'add')).join('') + manualRow
    : `<p class="empty-pick">Não achei na sua biblioteca.</p>` + manualRow;
}
$('#pickSearch').addEventListener('input', searchLibrary);
$('#pickSearch').addEventListener('keydown', (e) => {
  // Enter sem nenhum resultado = adicionar à mão
  if (e.key === 'Enter' && !picker.hits && fold($('#pickSearch').value).length >= 2) addManual();
});

$('#pickResults').addEventListener('click', (e) => {
  const row = e.target.closest('.prow');
  if (!row) return;
  if (picker.draft.ids.length >= NOW_MAX) { toast(`Máximo de ${NOW_MAX} jogos`); return; }
  if (row.classList.contains('manual-add')) { addManual(); return; }
  picker.draft.ids.push(row.dataset.id);
  $('#pickSearch').value = '';
  $('#pickResults').innerHTML = '';
  renderPicker();
  // cursor de volta na busca (o teclado não fecha) para já procurar o próximo
  if (picker.draft.ids.length < NOW_MAX) $('#pickSearch').focus();
});

/** Adiciona à lista o nome digitado na busca, como jogo "à mão". */
function addManual() {
  const name = $('#pickSearch').value.trim();
  if (!name) return;
  if (picker.draft.ids.length >= NOW_MAX) { toast(`Máximo de ${NOW_MAX} jogos`); return; }
  const g = { id: 'manual:' + Date.now(), name, stores: ['manual'], tags: [], minutes: 0,
    cover: null, hero: null, trailer: null, youtube: null, desc: 'Adicionado à mão.' };
  picker.draft.manual.push(g);
  picker.draft.ids.push(g.id);
  $('#pickSearch').value = '';
  $('#pickResults').innerHTML = '';
  picker.hits = 0;
  renderPicker();
  if (picker.draft.ids.length < NOW_MAX) $('#pickSearch').focus();
}

$('#pickConfirm').onclick = () => {
  const ids = picker.draft.ids, list = picker.list;
  if (!ids.length && picker.mode !== 'edit') return;
  store.set(LISTS[list].store, { ids, manual: picker.draft.manual.filter((m) => ids.includes(m.id)), confirmed: today() });
  delete picker.unsaved[list];         // salvo: não há mais rascunho pendente
  state.byCat.set(list, listGames(list));
  renderStart();
  if (picker.mode === 'edit') { toast('Lista salva'); history.back(); }   // volta para onde estava
  else location.replace(`#c=${list}`);  // replace: o "voltar" da prateleira leva ao início
};

/* ---------------- inicialização ---------------- */
loadLibrary().then(() => {
  renderHome();
  // sessão em andamento (app foi fechado jogando): volta direto para o timer
  // (empilha o início antes, para o "voltar" do Android levar à tela inicial e não fechar o app)
  if (Stats.session() && !location.hash) { route(); location.hash = 'playing'; return; }
  route();
});
