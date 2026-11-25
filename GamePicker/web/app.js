/* Hoje eu jogo — escolhedor de jogos */
const $ = (s) => document.querySelector(s);
const SLOT = 120;              // px per carousel slot (must match .slot width in CSS)
const TRAILER_DELAY = 900;     // ms parado num jogo antes do trailer começar

const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } },
};

const state = {
  all: [], byCat: new Map(), cat: null, list: [], idx: -1,
  filter: 'all', muted: true, trailerTimer: 0, raf: 0,
};

/* ---------------- dados ---------------- */
async function loadLibrary() {
  const base = await fetch('games.json').then((r) => r.json());
  const ps2 = store.get('ps2', []);
  const hidden = new Set(store.get('hidden', []));
  const validKeys = new Set(CATEGORIES.map((c) => c.key));

  state.all = base.concat(ps2).filter((g) => !hidden.has(g.id));
  state.byCat = new Map(CATEGORIES.map((c) => [c.key, []]));
  for (const g of state.all) {
    let cats = g.category ? [g.category] : [].concat(pickCategory(g.tags || [], g) || 'other');
    cats = cats.filter((k) => validKeys.has(k));
    if (!cats.length) cats = ['other'];
    g.cats = cats;
    for (const k of cats) state.byCat.get(k).push(g);
  }
  for (const k of Object.keys(LISTS)) state.byCat.set(k, listGames(k));   // "Estou jogando" com a Gi e sozinho (now.js)
  $('#libCount').textContent =
    `${state.all.length} jogos · ${state.all.filter((g) => !g.minutes).length} nunca jogados` +
    (hidden.size ? ` · ${hidden.size} ocultos` : '');
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

const RECENT_ROUNDS = 3;      // um jogo sorteado fica fora das próximas N rodadas (no máximo metade da lista)
const AGENDA_BOOST = 2;       // na lista "sozinho", os jogos da agenda de hoje ainda não jogados têm 2× mais chance

/** Contexto do sorteio: 'gi', 'now' (sozinho) ou 'all' (categorias e "Me surpreenda"). */
const pickContext = () => (isListCat(state.cat) ? state.cat : 'all');

/**
 * Sorteio com peso (pesos em Stats.weight). Os últimos sorteados de CADA contexto ficam de fora,
 * e numa lista pequena só até metade dela (2 jogos → alternam, em vez de todos ficarem "recentes").
 */
function weightedPick(list, ctx = pickContext()) {
  let saved = store.get('recent', {});
  if (Array.isArray(saved)) saved = {};          // formato antigo: uma lista só para o app inteiro
  const recent = (saved[ctx] || []).slice(0, Math.min(RECENT_ROUNDS, Math.floor(list.length / 2)));
  const fresh = list.filter((g) => !recent.includes(g.id));
  if (fresh.length) list = fresh;
  const agendaIds = new Set(ctx === 'now' ? Agenda.todayPending() : []);
  const w = list.map((g) => Stats.weight(g, ctx === 'all' ? 'all' : 'now', ctx) * (agendaIds.has(g.id) ? AGENDA_BOOST : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let pick = list[list.length - 1];
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) { pick = list[i]; break; } }
  saved[ctx] = [pick.id, ...(saved[ctx] || []).filter((id) => id !== pick.id)].slice(0, RECENT_ROUNDS);
  store.set('recent', saved);
  return pick;
}

/** "Me surpreenda": sorteia primeiro a categoria (todas com a mesma chance), depois o jogo dentro dela. */
function surprisePick(list) {
  const byCat = new Map();
  for (const g of list) for (const k of g.cats || ['other']) (byCat.get(k) || byCat.set(k, []).get(k)).push(g);
  const cats = [...byCat.keys()];
  return weightedPick(byCat.get(cats[(Math.random() * cats.length) | 0]), 'all');
}

/* ---------------- home ---------------- */
function renderHome() {
  const grid = $('#catGrid');
  grid.innerHTML = '';
  for (const c of CATEGORIES) {
    const games = state.byCat.get(c.key);
    if (!games.length) continue;
    const covers = shuffle(games.filter((g) => g.cover)).slice(0, 3);
    const btn = document.createElement('button');
    btn.className = 'cat';
    btn.innerHTML = `
      <div class="collage">${covers.map((g) => `<img src="${g.cover}" alt="" loading="lazy">`).join('')}</div>
      <span class="emoji">${c.emoji}</span>
      <div class="label"><b>${c.label}</b><span>${games.length} jogos · ${games.filter((g) => !g.minutes).length} novos</span></div>`;
    btn.onclick = () => go(c.key);
    grid.appendChild(btn);
  }
}

/* ---------------- roteamento (hash) ---------------- */
/* Telas: ''=início · #cats=categorias · #pick=<lista>[&edit=1]=escolher/confirmar/editar ·
   #c=<key>=prateleira · #agenda · #agenda-edit · #playing · #history */
function go(cat, focusId) { location.hash = `c=${cat}` + (focusId ? `&g=${encodeURIComponent(focusId)}` : ''); }
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id);
}
function route() {
  const h = location.hash.slice(1);
  const cat = new URLSearchParams(h).get('c');
  if (cat && state.byCat.has(cat)) return openShelf(cat, new URLSearchParams(h).get('g'));
  closeShelf();
  if (h === 'cats') showScreen('home');
  else if (h.startsWith('pick=') || h === 'now-pick') {
    const p = new URLSearchParams(h);
    openPicker(isListCat(p.get('pick')) ? p.get('pick') : 'now', p.has('edit'));
  }
  else if (h === 'agenda' || h === 'agenda-edit') openAgenda(h === 'agenda-edit');
  else if (h === 'playing') openPlaying();
  else if (h === 'history') openHistory();
  else { renderStart(); showScreen('start'); }
}
window.addEventListener('hashchange', route);

/* ---------------- prateleira ---------------- */

function openShelf(cat, focusId) {
  const c = LISTS[cat] || CATEGORIES.find((x) => x.key === cat);
  if (state.cat !== cat) { state.cat = cat; state.filter = 'all'; }
  showScreen('shelf');
  $('#shelfTitle').textContent = `${c.emoji} ${c.label}`;
  $('#editList').hidden = !isListCat(cat);
  renderChips();
  buildList(focusId);
}

function closeShelf() {
  stopTrailer();
  state.cat = null;
}

function renderChips() {
  const games = state.byCat.get(state.cat);
  const opts = [['all', 'Todos'], ['new', 'Nunca jogados'], ['played', 'Já joguei']];
  for (const [s, label] of [['steam', 'Steam'], ['gog', 'GOG'], ['epic', 'Epic'], ['ps2', 'PS2']]) {
    if (games.some((g) => g.stores.includes(s))) opts.push([s, label]);
  }
  const box = $('#chips');
  box.innerHTML = '';
  for (const [k, label] of opts) {
    const b = document.createElement('button');
    b.className = 'chip' + (state.filter === k ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { state.filter = k; renderChips(); buildList(); };
    box.appendChild(b);
  }
}

function applyFilter(games) {
  switch (state.filter) {
    case 'new': return games.filter((g) => !g.minutes);
    case 'played': return games.filter((g) => g.minutes);
    case 'all': return games;
    default: return games.filter((g) => g.stores.includes(state.filter));
  }
}

function boxHtml(g) {
  const name = esc(g.name);
  const front = g.cover
    ? `<img src="${g.cover}" alt="${name}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:this.alt}))">`
    : `<div class="noimg">${name}</div>`;
  return `<div class="box">
      <div class="face front">${front}</div>
      <div class="face spine"><span>${name}</span></div>
      <div class="face edge"></div>
      <div class="face back"></div>
      <div class="reflect" style="${g.cover ? `background-image:url('${g.cover}')` : ''}"></div>
    </div>`;
}

function buildList(focusId) {
  stopTrailer();
  state.list = shuffle(applyFilter(state.byCat.get(state.cat).slice()));
  const track = $('#track');
  if (!state.list.length) {
    track.innerHTML = `<div class="empty">Nenhum jogo com esse filtro.</div>`;
    $('#counter').textContent = '';
    showInfo(null);
    return;
  }
  track.innerHTML = state.list.map((g, i) => `<div class="slot" data-i="${i}">${boxHtml(g)}</div>`).join('');
  state.idx = -1;
  let start = 0;
  if (focusId) start = Math.max(0, state.list.findIndex((g) => g.id === focusId));
  const car = $('#carousel');
  car.scrollLeft = start * SLOT;
  requestAnimationFrame(layout);
}

/** Gira as caixas conforme a distância até o centro (só as visíveis). */
function layout() {
  state.raf = 0;
  const car = $('#carousel');
  const slots = $('#track').children;
  if (!state.list.length) return;
  const pos = car.scrollLeft / SLOT;
  const center = Math.min(state.list.length - 1, Math.max(0, Math.round(pos)));
  const span = Math.ceil(car.clientWidth / SLOT / 2) + 2;
  const from = Math.max(0, center - span - 2), to = Math.min(slots.length - 1, center + span + 2);
  for (let i = from; i <= to; i++) {
    const d = i - pos;
    const ad = Math.abs(d);
    const rot = Math.max(-62, Math.min(62, -d * 48));
    const z = -Math.min(ad, 3) * 70 + (ad < 0.5 ? 40 : 0);
    const box = slots[i].firstElementChild;
    box.style.transform = `translateZ(${z}px) rotateY(${rot}deg)`;
    slots[i].style.zIndex = String(100 - Math.round(ad * 10));
    slots[i].classList.toggle('center', i === center);
  }
  if (center !== state.idx) {
    state.idx = center;
    $('#counter').textContent = `${center + 1} de ${state.list.length}`;
    showInfo(state.list[center]);
  }
}

$('#carousel').addEventListener('scroll', () => { if (!state.raf) state.raf = requestAnimationFrame(layout); }, { passive: true });

/* ---- arrasto próprio: mais sensível que a rolagem nativa, com inércia ---- */
const DRAG_GAIN = 2.2;   // 1 px de dedo = 2,2 px de prateleira
const FLING_MS = 320;    // quanto a inércia "voa" (velocidade × este tempo)
let drag = null, suppressClick = false, anim = 0;

$('#carousel').addEventListener('pointerdown', (e) => {
  cancelAnimationFrame(anim);
  drag = { x: e.clientX, start: $('#carousel').scrollLeft, moved: false, samples: [{ t: e.timeStamp, x: e.clientX }] };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (Math.abs(dx) > 6) drag.moved = true;
  $('#carousel').scrollLeft = drag.start - dx * DRAG_GAIN;
  drag.samples.push({ t: e.timeStamp, x: e.clientX });
  while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
});
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

function endDrag(e) {
  if (!drag) return;
  const s = drag.samples, a = s[0], b = s[s.length - 1];
  const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;            // px/ms do dedo
  const car = $('#carousel');
  const target = car.scrollLeft - v * DRAG_GAIN * FLING_MS;
  suppressClick = drag.moved;
  drag = null;
  if (suppressClick) scrollToIndex(Math.round(target / SLOT));
}

$('#track').addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const slot = e.target.closest('.slot');
  if (!slot) return;
  const i = +slot.dataset.i;
  if (i === state.idx) askToPlay(state.list[i]);   // o som fica no botão 🔇 do trailer
  else scrollToIndex(i);
});

/** Anima até o índice i (ease-out); a duração cresce com a distância. */
function scrollToIndex(i) {
  const car = $('#carousel');
  i = Math.max(0, Math.min(state.list.length - 1, i));
  const from = car.scrollLeft, to = i * SLOT, dist = to - from;
  const dur = 220 + Math.min(650, Math.abs(dist) / 4);
  const t0 = performance.now();
  cancelAnimationFrame(anim);
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    car.scrollLeft = from + dist * (1 - Math.pow(1 - p, 3));
    if (p < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

/* ---------------- painel + trailer ---------------- */
const STORE_LABEL = { steam: 'Steam', gog: 'GOG', epic: 'Epic', ps2: 'PS2', manual: 'Manual' };

function showInfo(g) {
  stopTrailer();
  if (!g) { $('#infoName').textContent = ''; $('#infoMeta').textContent = ''; $('#infoDesc').textContent = ''; $('#infoStores').innerHTML = ''; return; }
  $('#infoStores').innerHTML = g.stores.map((s) => `<span class="store ${s}">${STORE_LABEL[s] || s}</span>`).join('');
  $('#infoName').textContent = g.name;
  const played = g.minutes ? `Jogou ${g.minutes >= 60 ? Math.round(g.minutes / 60) + 'h' : g.minutes + 'min'}` : 'Nunca jogado';
  $('#infoMeta').textContent = [played, ...(g.tags || []).slice(0, 3)].join(' · ');
  $('#infoDesc').textContent = g.desc || '';
  // link próprio (antes ficava no fim da descrição e sumia no corte de 2 linhas)
  const yt = $('#infoYt');
  yt.hidden = !!(g.trailer || g.youtube);
  yt.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(g.name + ' gameplay')}`;
  $('#hideBtn').textContent = isListCat(state.cat) ? 'Tirar da lista' : (g.id.startsWith('ps2:') ? 'Remover jogo' : 'Ocultar jogo');

  const img = $('#stageImg');
  img.src = g.hero || g.cover || '';
  img.style.opacity = img.src ? 1 : 0;
  state.trailerTimer = setTimeout(() => playTrailer(g), TRAILER_DELAY);
}

/* O microtrailer da Steam (6 s) NÃO tem faixa de áudio. Com som ligado,
   tocamos o trailer completo (HLS), que fica na mesma pasta do microtrailer. */
const fullTrailerUrl = (micro) => micro.replace(/microtrailer\.(mp4|webm)$/, 'hls_264_master.m3u8');

function playVideo(src, isHls) {
  const v = $('#stageVideo');
  v.muted = state.muted;
  v.onplaying = () => v.classList.add('on');
  if (isHls && window.Hls && Hls.isSupported()) {
    state.hls = new Hls({ maxBufferLength: 20, startLevel: 1 });
    state.hls.loadSource(src);
    state.hls.attachMedia(v);
  } else {
    v.src = src;                       // mp4, ou HLS nativo
  }
  v.play().catch(() => {});
}

function playTrailer(g) {
  const v = $('#stageVideo'), yt = $('#stageYt'), snd = $('#soundBtn');
  if (g.trailer) {
    if (state.muted) playVideo(g.trailer, false);
    else playVideo(fullTrailerUrl(g.trailer), true);
    snd.hidden = false;
  } else if (g.youtube) {
    yt.hidden = false;
    yt.src = ytUrl(g.youtube);
    yt.onload = () => setTimeout(() => yt.classList.add('on'), 600);
    snd.hidden = false;
  }
  snd.textContent = state.muted ? '🔇' : '🔊';
  // tocar na capa agora abre "Vou jogar"; avisa uma vez onde ficou o som
  if (!snd.hidden && !store.get('soundHint', false)) { store.set('soundHint', true); toast('Toque em 🔇 (no alto) para ouvir o trailer'); }
}

const ytUrl = (id) => `https://www.youtube.com/embed/${id}?autoplay=1&mute=${state.muted ? 1 : 0}&controls=0&loop=1&playlist=${id}&playsinline=1&rel=0`;

function stopTrailer() {
  clearTimeout(state.trailerTimer);
  const v = $('#stageVideo'), yt = $('#stageYt');
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  // elemento novo em vez de v.load(): o evento 'emptied' atrasado do load()
  // derrubava o hls.js quando o próximo trailer começava logo em seguida
  v.pause();
  const fresh = v.cloneNode(false);
  fresh.removeAttribute('src');
  fresh.classList.remove('on');
  v.replaceWith(fresh);
  // libera o vídeo antigo de vez: no Android o último quadro dele ficava na tela por segundos
  v.removeAttribute('src');
  v.load();
  yt.classList.remove('on'); yt.hidden = true; yt.removeAttribute('src');
  $('#soundBtn').hidden = true;
}

function toggleSound() {
  state.muted = !state.muted;
  const g = state.list[state.idx];
  const v = $('#stageVideo'), yt = $('#stageYt');
  if (g && g.trailer) {
    if (!state.muted && !state.hls) {
      // troca o microtrailer mudo pelo trailer completo com áudio (este clique libera o som)
      stopTrailer();
      playVideo(fullTrailerUrl(g.trailer), true);
      $('#soundBtn').hidden = false;
    } else {
      v.muted = state.muted;
    }
  }
  if (!yt.hidden && g && g.youtube) yt.src = ytUrl(g.youtube);
  $('#soundBtn').textContent = state.muted ? '🔇' : '🔊';
  toast(state.muted ? 'Som desligado' : 'Som ligado');
}
$('#soundBtn').onclick = toggleSound;
$('#backBtn').onclick = () => history.back();

/* ---------------- sortear / ocultar ---------------- */
$('#pickHere').onclick = () => {
  if (!state.list.length) return;
  stopTrailer();                                  // não misturar o trailer com o circo
  const list = isListCat(state.cat) ? state.cat : null;
  Roulette.open(state.list, {
    onPlay: (g) => startPlaying(g, list),
    onShow: (g) => scrollToIndex(state.list.indexOf(g)),
    // recusou 3 vezes na semana um jogo da lista "Estou jogando" → oferece tirar da lista
    offerRemove: list ? (g) => (Stats.rejectsThisWeek(g.id) >= 3 ? LISTS[list].label : null) : null,
    onRemove: async (g) => { removeFromNow(list, g.id); toast(`Tirado da lista "${LISTS[list].label}"`); await refresh(); },
  });
};

$('#surpriseAll').onclick = () => {
  Roulette.open(state.all, { pick: surprisePick, onPlay: (g) => startPlaying(g, null), onShow: (g) => go(g.cats[0], g.id) });
};

/** Escolha manual (tocou no jogo do meio, ou na agenda): a mesma pergunta do fim da roleta. */
function askToPlay(g, list = isListCat(state.cat) ? state.cat : null) {
  if (!g) return;
  stopTrailer();
  Roulette.confirm(g, {
    onPlay: (x) => startPlaying(x, list),
    // "não vou jogar agora": volta para a prateleira com o trailer de novo (sem contar como recusa)
    onCancel: () => { if (state.cat && state.list[state.idx] === g) showInfo(g); },
  });
}

/** "Vou jogar": registra no histórico (com a lista de onde veio: 'gi', 'now' ou null) e abre o timer. */
function startPlaying(g, list = null) {
  stopTrailer();
  Stats.start(g, list);
  location.hash = 'playing';
}

$('#hideBtn').onclick = async () => {
  const g = state.list[state.idx];
  if (!g) return;
  if (isListCat(state.cat)) {                    // nas listas "Estou jogando", só tira da lista
    removeFromNow(state.cat, g.id);
    toast(`Tirado da lista "${LISTS[state.cat].label}"`);
  } else if (g.id.startsWith('ps2:')) {
    store.set('ps2', store.get('ps2', []).filter((x) => x.id !== g.id));
    toast('Jogo removido');
  } else {
    store.set('hidden', [...store.get('hidden', []), g.id]);
    toast('Ocultado. Toque e segure "＋ PS2" para restaurar ocultos.');
  }
  await refresh();
};

async function refresh() {
  await loadLibrary();
  renderHome();
  renderStart();
  if (state.cat) { renderChips(); buildList(); }
}

/* segurar o botão ＋ PS2 restaura todos os ocultos */
let holdTimer;
$('#addBtn').addEventListener('pointerdown', () => {
  holdTimer = setTimeout(async () => { holdTimer = null; store.set('hidden', []); toast('Ocultos restaurados'); await refresh(); }, 900);
});
$('#addBtn').addEventListener('pointerup', () => {
  if (holdTimer) { clearTimeout(holdTimer); openPs2Dialog(); }
});

/* ---------------- PS2 manual ---------------- */
function openPs2Dialog() {
  $('#ps2Cat').innerHTML = CATEGORIES.map((c) => `<option value="${c.key}">${c.emoji} ${c.label}</option>`).join('');
  $('#ps2Form').reset();
  $('#ps2Preview').removeAttribute('src');
  $('#ps2Hint').textContent = 'Procuro a capa na Wikipédia pelo nome.';
  $('#ps2Dialog').showModal();
}

$('#ps2Find').onclick = async () => {
  const name = $('#ps2Name').value.trim();
  if (!name) { $('#ps2Hint').textContent = 'Digite o nome primeiro.'; return; }
  $('#ps2Hint').textContent = 'Buscando…';
  try {
    const q = encodeURIComponent(`${name} PlayStation 2 video game`);
    // page_image também traz capas "non-free" (o pageimages normal as esconde)
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${q}&gsrlimit=3&prop=pageprops|extracts&ppprop=page_image|page_image_free&exintro=1&explaintext=1&exsentences=2`;
    const data = await fetch(url).then((r) => r.json());
    const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
    const hit = pages.find((p) => p.pageprops && (p.pageprops.page_image || p.pageprops.page_image_free));
    if (!hit) throw new Error('sem imagem');
    const file = hit.pageprops.page_image || hit.pageprops.page_image_free;
    const img = `https://en.wikipedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600`;
    $('#ps2Cover').value = img;
    $('#ps2Preview').src = img;
    $('#ps2Preview').dataset.desc = hit.extract || '';
    $('#ps2Hint').textContent = `Achei: ${hit.title}`;
  } catch {
    $('#ps2Hint').textContent = 'Não achei a capa. Você pode colar um link de imagem.';
  }
};
$('#ps2Cover').addEventListener('change', (e) => { $('#ps2Preview').src = e.target.value; });

$('#ps2Dialog').addEventListener('close', async () => {
  if ($('#ps2Dialog').returnValue !== 'ok') return;
  const name = $('#ps2Name').value.trim();
  if (!name) return;
  const yt = ($('#ps2Yt').value.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/) || [])[1] || null;
  const g = {
    id: 'ps2:' + Date.now(), name, stores: ['ps2'], category: $('#ps2Cat').value, minutes: 0, tags: ['PS2'],
    cover: $('#ps2Cover').value.trim() || null, hero: null, trailer: null, youtube: yt,
    desc: $('#ps2Preview').dataset.desc || null,
  };
  store.set('ps2', [...store.get('ps2', []), g]);
  toast(`${name} adicionado`);
  await refresh();
});

/* ---------------- util ---------------- */
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg) {
  const t = Object.assign(document.createElement('div'), { className: 'toast', textContent: msg });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// a inicialização fica no fim de now.js (carregado depois deste arquivo)
