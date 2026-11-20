/* Abertura original: viagem por um campo de estrelas, salto para dobra e título.
   Toca a cada vez que o app abre; um toque na tela pula direto para o app. */
(() => {
  const INTRO_MS = 14000;   // duração total
  const WARP_AT = 6.2;      // segundo em que acontece o salto
  const el = document.getElementById('intro');
  if (!el) return;
  const cv = el.querySelector('canvas'), cx2 = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
  }
  resize(); addEventListener('resize', resize);

  // estrelas em 3D: x,y em [-1,1], z em (0,1]; projetadas a partir do centro
  const stars = Array.from({ length: 700 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), pz: 0 }));
  for (const s of stars) s.pz = s.z;

  /** velocidade da viagem ao longo do tempo (s): lenta → acelera → dobra → desacelera */
  function speed(t) {
    if (t < WARP_AT - 2) return 0.0008 + t * 0.0003;
    if (t < WARP_AT) return 0.002 + Math.pow((t - (WARP_AT - 2)) / 2, 3) * 0.045;
    if (t < WARP_AT + 0.6) return 0.047;
    return Math.max(0.0012, 0.047 * Math.exp(-(t - WARP_AT - 0.6) * 2.2));
  }

  const t0 = performance.now();
  let done = false, raf = 0;

  function frame(now) {
    const t = (now - t0) / 1000;
    const v = speed(t);
    const f = Math.min(W, H) * 0.9;
    // rastro: quanto mais rápido, menos o quadro anterior é apagado
    cx2.fillStyle = `rgba(3,3,10,${v > 0.01 ? 0.35 : 0.9})`;
    cx2.fillRect(0, 0, W, H);
    // nebulosa sutil
    const neb = cx2.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.9);
    neb.addColorStop(0, 'rgba(90,50,170,0.05)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
    cx2.fillStyle = neb; cx2.fillRect(0, 0, W, H);

    const fadeIn = Math.min(1, t / 1.5);
    for (const s of stars) {
      s.pz = s.z; s.z -= v;
      if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = s.pz = 1; continue; }
      const sx = W / 2 + (s.x / s.z) * f, sy = H / 2 + (s.y / s.z) * f;
      const px = W / 2 + (s.x / s.pz) * f, py = H / 2 + (s.y / s.pz) * f;
      const b = Math.min(1, (1 - s.z) * 1.4) * fadeIn;
      cx2.strokeStyle = `rgba(${200 + 55 * b | 0},${210 + 45 * b | 0},255,${b})`;
      cx2.lineWidth = Math.max(1, (1 - s.z) * 2.6 * dpr);
      cx2.beginPath(); cx2.moveTo(px, py); cx2.lineTo(sx + 0.1, sy + 0.1); cx2.stroke();
    }
    // clarão no momento do salto
    const flash = Math.max(0, 1 - Math.abs(t - WARP_AT - 0.15) / 0.35);
    if (flash > 0) { cx2.fillStyle = `rgba(220,230,255,${flash * 0.85})`; cx2.fillRect(0, 0, W, H); }

    if (t > WARP_AT + 0.4) el.classList.add('show-title');
    if (t * 1000 > INTRO_MS - 900) el.classList.add('leaving');
    if (t * 1000 >= INTRO_MS) return finish();
    raf = requestAnimationFrame(frame);
  }

  let track = null;   // <audio> com a trilha renderizada (ver Sound.introTrack)

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    Sound.stopAll();
    if (track) {                       // abaixa o volume em ~0,3 s e para
      const a = track;
      const fade = setInterval(() => {
        if (a.volume <= 0.1) { a.pause(); clearInterval(fade); } else a.volume -= 0.1;
      }, 30);
    }
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 450);
  }

  el.addEventListener('pointerdown', finish);
  raf = requestAnimationFrame(frame);

  // a trilha leva uma fração de segundo para ficar pronta; começa já no ponto certo da animação
  Sound.introTrack(WARP_AT, INTRO_MS / 1000).then((a) => {
    if (!a || done) return;
    track = a;
    a.addEventListener('loadedmetadata', () => {
      a.currentTime = Math.max(0, (performance.now() - t0) / 1000);
      a.play().catch(() => {});
    }, { once: true });
    a.load();
  }).catch(() => {});

  // o subtítulo mostra o tamanho da biblioteca quando ela terminar de carregar
  const sub = el.querySelector('.intro-sub');
  const fill = () => { if (state.all && state.all.length) sub.textContent = `${state.all.length} jogos esperando por você`; else setTimeout(fill, 300); };
  setTimeout(fill, 300);
})();
