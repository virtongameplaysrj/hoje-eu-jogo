/* Roleta do sorteio: uma fita de capas gira ao som da marchinha de circo;
   ao tocar na tela, ela desacelera e para exatamente no jogo sorteado. */
const Roulette = (() => {
  const CARD = 132;            // passo entre capas: 120 de capa + 12 de espaço (igual ao CSS .rl-card)
  const MID = 60;              // meio da capa (não do passo), onde o ponteiro deve cair
  const SEG = 40;              // capas por volta (a fita tem 2 voltas iguais para girar sem emenda)
  const SPIN_SPEED = 2.4;      // px/ms girando livre
  const STOP_MS = 3800;        // duração da desaceleração
  const AUTO_STOP_MS = 15000;  // se ninguém tocar, para sozinha

  const el = document.getElementById('roulette');
  const strip = el.querySelector('.rl-strip');
  const hint = el.querySelector('.rl-hint');
  const result = el.querySelector('.rl-result');
  const title = el.querySelector('.rl-title');
  let phase = 'idle', x = 0, raf = 0, last = 0, lastIdx = -1, lastTick = 0;
  let candidates = [], cards = [], onDone = null, autoTimer = 0, winnerIdx = -1, winner = null;

  function cardHtml(g, i) {
    const img = g.cover ? `<img src="${g.cover}" alt="" draggable="false">` : `<span>${esc(g.name)}</span>`;
    return `<div class="rl-card" data-i="${i}">${img}</div>`;
  }

  function render() {
    strip.innerHTML = cards.map(cardHtml).join('');
  }

  function place() {
    strip.style.transform = `translateX(${el.clientWidth / 2 - x}px)`;
    const idx = Math.floor(x / CARD);
    if (idx !== lastIdx) {
      lastIdx = idx;
      const now = performance.now();
      if (now - lastTick > 28) { Sound.tick(); lastTick = now; }   // não "metralha" em alta velocidade
    }
  }

  function spin(now) {
    const dt = Math.min(50, now - last); last = now;
    x += SPIN_SPEED * dt;
    if (x >= SEG * CARD + CARD / 2) x -= SEG * CARD;              // volta à 1ª metade: emenda invisível
    place();
    raf = requestAnimationFrame(spin);
  }

  /** Para a roleta: sorteia agora e escolhe uma capa à frente, a uma distância compatível com a velocidade. */
  function stop() {
    if (phase !== 'spinning') return;
    phase = 'stopping';
    clearTimeout(autoTimer);
    cancelAnimationFrame(raf);
    hint.classList.add('hidden');
    winner = weightedPick(candidates);
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
    strip.children[winnerIdx].classList.add('win');
    title.textContent = '🎉 Sorteado!';
    result.innerHTML = `<b>${esc(winner.name)}</b><span>Toque para jogar!</span>`;
    result.classList.remove('hidden');
    autoTimer = setTimeout(close, 2600);
  }

  function close() {
    if (phase !== 'done') return;
    clearTimeout(autoTimer);
    phase = 'idle';
    el.classList.add('hidden');
    const cb = onDone, g = winner;
    onDone = null;
    if (cb) cb(g);
  }

  el.addEventListener('pointerdown', () => {
    if (phase === 'spinning') stop();
    else if (phase === 'done') close();
  });

  /** Abre a roleta com estes candidatos; done(jogo) é chamado com o vencedor. */
  function open(list, done) {
    if (!list.length || phase !== 'idle') return;
    candidates = list;
    onDone = done;
    // uma volta = até 40 capas sorteadas (repete se a lista for pequena); a 2ª volta é cópia da 1ª
    const pool = shuffle(list.slice()).slice(0, SEG);
    const lap = Array.from({ length: SEG }, (_, i) => pool[i % pool.length]);
    cards = lap.concat(lap);
    render();
    x = CARD / 2 + Math.random() * SEG * CARD * 0.5;
    lastIdx = -1;
    hint.classList.remove('hidden');
    result.classList.add('hidden');
    el.classList.remove('hidden');
    title.textContent = '🎪 Girando a roleta…';
    phase = 'spinning';
    Sound.circusStart();
    last = performance.now();
    raf = requestAnimationFrame(spin);
    autoTimer = setTimeout(stop, AUTO_STOP_MS);
  }

  return { open };
})();
