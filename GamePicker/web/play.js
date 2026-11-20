/* Tela "Jogando agora" (timer) e "Meu histórico" (com backup). */

/* ---------------- timer ---------------- */
let playTimer = 0;

function openPlaying() {
  const s = Stats.session();
  if (!s) { location.replace('#'); return; }
  $('#playingName').textContent = s.name;
  $('#playingCover').innerHTML = s.cover
    ? `<img src="${s.cover}" alt="">`
    : `<div class="noimg">${esc(s.name)}</div>`;
  const started = new Date(s.start);
  const sameDay = started.toDateString() === new Date().toDateString();
  $('#playingSince').textContent = `Começou ${sameDay ? 'às' : 'em ' + started.toLocaleDateString('pt-BR') + ' às'} ` +
    started.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  showScreen('playing');
  tickPlaying();
  clearInterval(playTimer);
  playTimer = setInterval(tickPlaying, 1000);
}

/** O tempo vem sempre de agora − início: não importa se o app ficou fechado no meio. */
function tickPlaying() {
  const s = Stats.session();
  if (!s || $('#playing').classList.contains('hidden')) { clearInterval(playTimer); return; }
  const sec = Math.max(0, Math.floor((Date.now() - s.start) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, ss = sec % 60;
  $('#playingTimer').textContent = `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

const FORGOT_MIN = 300;   // mais de 5 h: pergunta se esqueceu de parar

$('#stopPlaying').onclick = () => {
  const min = Stats.elapsedMin();
  if (min > FORGOT_MIN) {
    $('#fixText').textContent = `O timer marcou ${fmtMinutes(min)}. Se esqueceu de parar, corrija os minutos:`;
    $('#fixMinutes').value = min;
    $('#fixDialog').showModal();
    return;
  }
  finishPlaying(min);
};

$('#fixDialog').addEventListener('close', () => {
  if ($('#fixDialog').returnValue === 'ok') finishPlaying(Math.max(0, parseInt($('#fixMinutes').value, 10) || 0));
});

function finishPlaying(min) {
  clearInterval(playTimer);
  const r = Stats.stop(min);
  if (r) toast(`Registrado: ${fmtMinutes(r.minutes)} de ${r.name}`);
  renderStart();
  location.replace('#');
}

// voltar NÃO encerra a sessão: o timer continua e um aviso aparece na tela inicial
$('#playingBack').onclick = () => location.replace('#');

function renderPlayingBanner() {
  const s = Stats.session(), b = $('#playingBanner');
  b.hidden = !s;
  if (s) b.textContent = `▶ Jogando ${s.name} · ${fmtMinutes(Stats.elapsedMin(s))} — toque para ver`;
}
$('#playingBanner').onclick = () => { location.hash = 'playing'; };

/* ---------------- histórico ---------------- */
function when(ts) {
  if (!ts) return '';
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(ts).setHours(0, 0, 0, 0)) / 864e5);
  return days <= 0 ? 'hoje' : days === 1 ? 'ontem' : `há ${days} dias`;
}

function openHistory() {
  const rows = Object.entries(Stats.all()).map(([id, r]) => ({ id, ...r }))
    .filter((r) => r.plays || r.minutes || r.rejects)
    .sort((a, b) => Math.max(b.last, b.lastReject) - Math.max(a.last, a.lastReject));
  const plays = rows.reduce((s, r) => s + r.plays, 0), mins = rows.reduce((s, r) => s + r.minutes, 0);
  $('#historySub').textContent = rows.length
    ? `${plays} ${plays === 1 ? 'jogada' : 'jogadas'} · ${fmtMinutes(mins)} no total`
    : 'Nada registrado ainda';
  $('#historyList').innerHTML = rows.length ? rows.map((r) => {
    const thumb = r.cover ? `<img src="${r.cover}" alt="" loading="lazy">` : `<span class="ph">🎮</span>`;
    const bits = [`${r.plays}× jogado`, fmtMinutes(r.minutes)];
    if (r.last) bits.push(`última: ${when(r.last)}`);
    if (r.rejects) bits.push(`recusado ${r.rejects}×`);
    return `<div class="prow">${thumb}<span class="nm">${esc(r.name || r.id)}<small>${bits.join(' · ')}</small></span></div>`;
  }).join('') : `<p class="empty-pick">Quando você tocar em "Vou jogar" na roleta, seus jogos aparecem aqui.</p>`;
  showScreen('history');
}

$('#openHistory').onclick = () => { location.hash = 'history'; };
$('#historyBack').onclick = () => history.back();

/* ---------------- backup ---------------- */
$('#backupCopy').onclick = async () => {
  const text = Stats.exportText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });   // plano B
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast('Backup copiado. Cole num lugar seguro (e-mail, notas…)');
};

$('#backupPaste').onclick = () => { $('#restoreText').value = ''; $('#restoreDialog').showModal(); };

$('#restoreDialog').addEventListener('close', async () => {
  if ($('#restoreDialog').returnValue !== 'ok') return;
  try {
    Stats.importText($('#restoreText').value.trim());
    await refresh();
    openHistory();
    toast('Backup restaurado');
  } catch (e) {
    toast('Não consegui ler esse backup: ' + e.message);
  }
});
