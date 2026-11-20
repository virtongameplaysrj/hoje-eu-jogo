/* Roleta do sorteio: sobe de baixo da tela com um rufar de tambor, gira ao som da marchinha
   de circo e, ao tocar na tela, desacelera até parar exatamente no jogo sorteado.
   No fim: "Vou jogar" (abre o timer) ou "Não vou jogar, escolha outro" (gira de novo sem ele). */
const Roulette = (() => {
  const CARD = 132;            // passo entre capas: 120 de capa + 12 de espaço (igual ao CSS .rl-card)
  const MID = 60;              // meio da capa (não do passo), onde o ponteiro deve cair
  const SEG = 40;              // capas por volta (a fita tem 2 voltas iguais para girar sem emenda)
  const SPIN_SPEED = 2.4;      // px/ms girando livre
  const STOP_MS = 3800;        // duração da desaceleração
  const AUTO_STOP_MS = 15000;  // se ninguém tocar, para sozinha
  const ENTER_MS = 650;        // animação de entrada (igual ao CSS .rl-stage)

  const el = document.getElementById('roulette');
  const strip = el.querySelector('.rl-strip');
  const hint = el.querySelector('.rl-hint');
  const result = el.querySelector('.rl-result');
  const title = el.querySelector('.rl-title');
  let phase = 'idle', x = 0, raf = 0, last = 0, lastIdx = -1, lastTick = 0;
  let candidates = [], cards = [], autoTimer = 0, winnerIdx = -1, winner = null;
  let excluded = new Set(), handlers = {};

  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* sem vibração */ } };

  function cardHtml(g, i) {
    const img = g.cover ? `<img src="${g.cover}" alt="" draggable="false">` : `<span>${esc(g.name)}</span>`;
    return `<div class="rl-card" data-i="${i}">${img}</div>`;
  }

  function place() {
    strip.style.transform = `translateX(${el.clientWidth / 2 - x}px)`;
    const idx = Math.floor(x / CARD);
    if (idx !== lastIdx) {
      lastIdx = idx;
      const now = performance.now();
      if (now - lastTick > 28) { Sound.tick(); buzz(6); lastTick = now; }   // não "metralha" em alta velocidade
    }
  }

  function spin(now) {
    const dt = Math.min(50, now - last); last = now;
    x += SPIN_SPEED * dt;
    if (x >= SEG * CARD + CARD / 2) x -= SEG * CARD;              // volta à 1ª metade: emenda invisível
    place();
    raf = requestAnimationFrame(spin);
  }

  function startSpinning() {
    phase = 'spinning';
    title.textContent = '🎪 Girando a roleta…';
    hint.classList.remove('hidden');
    result.classList.add('hidden');
    Sound.circusStart();
    last = performance.now();
    raf = requestAnimationFrame(spin);
    autoTimer = setTimeout(stop, AUTO_STOP_MS);
  }

  /** Para a roleta: sorteia agora e escolhe uma capa à frente, a uma distância compatível com a velocidade. */
  function stop() {
    if (phase !== 'spinning') return;
    phase = 'stopping';
    clearTimeout(autoTimer);
    cancelAnimationFrame(raf);
    hint.classList.add('hidden');
    winner = weightedPick(candidates.filter((g) => !excluded.has(g.id)));
    // ease-out cúbico começa com velocidade 3·dist/D; igualamos à velocidade atual
    const ideal = SPIN_SPEED * STOP_MS / 3;
    winnerIdx = Math.ceil((x + ideal - MID) / CARD);
    cards[winnerIdx] = winner;
    strip.children[winnerIdx].outerHTML = cardHtml(winner, winnerIdx);
    const from = x, dist = winnerIdx * CARD + MID - from, dur = 3 * dist / SPIN_SPEED;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      x = from + dist * (1 - Math.pow(1 - p, 3));
      place();
      if (p < 1) raf = requestAnimationFrame(step);
      else land();
    };
    raf = requestAnimationFrame(step);
  }

  function land() {
    phase = 'done';
    Sound.circusStop(0.15);
    Sound.tada();
    buzz([40, 60, 90]);
    strip.children[winnerIdx].classList.add('win');
    title.textContent = '🎉 Sorteado!';
    const left = candidates.filter((g) => !excluded.has(g.id) && g.id !== winner.id).length;
    result.innerHTML = `<b>${esc(winner.name)}</b>
      <button class="rl-play">🎮 Vou jogar</button>
      ${left ? '<button class="rl-other ghost">Não vou jogar, escolha outro</button>' : ''}`;
    result.classList.remove('hidden');
  }

  function close(goToWinner) {
    clearTimeout(autoTimer);
    cancelAnimationFrame(raf);
    Sound.circusStop(0.15);
    phase = 'idle';
    el.classList.add('hidden');
    el.classList.remove('in');
    if (goToWinner && winner && handlers.onShow) handlers.onShow(winner);
  }

  // durante o giro, qualquer toque para; no resultado, só os botões agem
  el.addEventListener('pointerdown', (e) => {
    if (phase === 'spinning' && !e.target.closest('.rl-close')) stop();
  });

  el.addEventListener('click', (e) => {
    if (e.target.closest('.rl-close')) return close(phase === 'done');
    if (phase !== 'done') return;
    if (e.target.closest('.rl-play')) {
      const g = winner;
      close(false);
      if (handlers.onPlay) handlers.onPlay(g);
    } else if (e.target.closest('.rl-other')) {
      Stats.reject(winner);                  // conta como recusa: menos chance nos próximos dias
      excluded.add(winner.id);               // e não sai de novo nesta roleta
      strip.children[winnerIdx].classList.remove('win');
      startSpinning();
    }
  });

  /**
   * Abre a roleta com estes candidatos.
   * handlers.onPlay(jogo): tocou "Vou jogar" · handlers.onShow(jogo): fechou no ✕ depois do sorteio
   */
  function open(list, h) {
    if (!list.length || phase !== 'idle') return;
    candidates = list;
    handlers = h || {};
    excluded = new Set();
    winner = null;
    // uma volta = até 40 capas sorteadas (repete se a lista for pequena); a 2ª volta é cópia da 1ª
    const pool = shuffle(list.slice()).slice(0, SEG);
    const lap = Array.from({ length: SEG }, (_, i) => pool[i % pool.length]);
    cards = lap.concat(lap);
    strip.innerHTML = cards.map(cardHtml).join('');
    x = CARD / 2 + Math.random() * SEG * CARD * 0.5;
    lastIdx = -1;
    place();
    title.textContent = '🥁 Preparando a roleta…';
    hint.classList.add('hidden');
    result.classList.add('hidden');
    phase = 'entering';
    el.classList.remove('hidden');
    void el.offsetWidth;                     // força o navegador a aplicar o estado inicial antes de animar
    el.classList.add('in');                  // CSS: a roleta sobe de baixo da tela com um quique
    Sound.drumroll(ENTER_MS / 1000);
    setTimeout(() => { if (phase === 'entering') startSpinning(); }, ENTER_MS);
  }

  return { open };
})();
