/* Abertura original (15 s): uma nave exploradora — desenho próprio do app — vem do fundo do espaço,
   faz a curva diante da câmera, carrega o anel de energia e salta para a dobra; então surge o título.
   Toca a cada vez que o app abre; um toque na tela pula direto para o app. */
(() => {
  const INTRO_MS = 15000;   // duração total
  const WARP_AT = 9.5;      // segundo do salto
  const el = document.getElementById('intro');
  if (!el) return;
  const cv = el.querySelector('canvas'), g2 = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
  }
  resize(); addEventListener('resize', resize);

  /* ======================= a nave (modelo 3D próprio) =======================
     Casco em ponta de flecha (seção em losango), asas curtas enflechadas, barbatana dorsal
     e um anel de energia na traseira, preso por duas hastes. Nariz aponta para +z. */
  const V = [], F = [];
  const v = (x, y, z) => V.push([x, y, z]) - 1;
  const face = (idx, col, opts = {}) => F.push({ idx, col, ...opts });

  const nose = v(0, 0, 3.2);
  const m = [v(0, 0.38, 0.4), v(0.55, 0, 0.4), v(0, -0.28, 0.4), v(-0.55, 0, 0.4)];   // meio: topo, dir, baixo, esq
  const r = [v(0, 0.26, -2), v(0.38, 0, -2), v(0, -0.2, -2), v(-0.38, 0, -2)];        // traseira
  const HULL = [182, 192, 212], WING = [138, 148, 176], DARK = [36, 38, 58], STRUT = [118, 124, 142];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    face([nose, m[i], m[j]], HULL, { solid: true });
    face([m[i], r[i], r[j], m[j]], HULL, { solid: true });
  }
  face([r[0], r[1], r[2], r[3]], DARK, { solid: true });                                  // placa do motor
  for (const s of [1, -1]) {                                                               // asas
    face([v(0.5 * s, 0, 0.1), v(1.75 * s, -0.12, -1.35), v(0.38 * s, 0, -1.7)], WING);
    face([v(0.3 * s, 0.05, -1.9), v(0.95 * s, 0.05, -2.45), v(0.95 * s, -0.05, -2.45), v(0.3 * s, -0.05, -1.9)], STRUT);
  }
  face([v(0, 0.3, -0.9), v(0, 0.85, -1.95), v(0, 0.24, -1.95)], WING);                    // barbatana
  // faixas de luz nas bordas das asas (linhas emissivas)
  const STRIPS = [[v(0.5, 0.01, 0.1), v(1.75, -0.11, -1.35)], [v(-0.5, 0.01, 0.1), v(-1.75, -0.11, -1.35)]];
  // anel de energia: toro de raio 0.95, tubo 0.09, no plano xy em z = -2.45
  const RING_Z = -2.45, RN = 22, RM = 5, ringStart = V.length;
  for (let i = 0; i < RN; i++) {
    const a = (i / RN) * Math.PI * 2;
    for (let k = 0; k < RM; k++) {
      const b = (k / RM) * Math.PI * 2, rr = 0.95 + 0.09 * Math.cos(b);
      v(rr * Math.cos(a), rr * Math.sin(a), RING_Z + 0.09 * Math.sin(b));
    }
  }
  for (let i = 0; i < RN; i++) for (let k = 0; k < RM; k++) {
    const i2 = (i + 1) % RN, k2 = (k + 1) % RM, at = (ii, kk) => ringStart + ii * RM + kk;
    face([at(i, k), at(i2, k), at(i2, k2), at(i, k2)], null, { ring: true, solid: true });
  }
  const CENTER = [0, 0, -0.2];

  /* ======================= roteiro da nave ======================= */
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
  const clamp01 = (u) => Math.max(0, Math.min(1, u));

  /** posição (x,y,z), rotação (yaw,pitch,roll) e carga do anel no instante t (s) */
  function pose(t) {
    const charge = clamp01((t - 3) / (WARP_AT - 3));
    if (t < 6.2) {                                   // vem do fundo, de frente para a câmera
      const u = clamp01((t - 0.8) / 5.4), e = 1 - Math.pow(1 - u, 2.2);
      return { x: lerp(-5, 0.6, e), y: lerp(-2.6, -0.4, e), z: lerp(95, 7.5, e),
        yaw: Math.PI - 0.35 + 0.25 * e, pitch: 0.12, roll: 0.35 * Math.sin(t * 0.8), charge };
    }
    if (t < 8.2) {                                   // faz a curva e mostra o anel de energia
      const u = ease((t - 6.2) / 2);
      return { x: lerp(0.6, 0, u), y: lerp(-0.4, -0.15, u), z: lerp(7.5, 8.2, u),
        yaw: Math.PI - 0.1 + (Math.PI + 0.1) * u, pitch: 0.12 + 0.1 * Math.sin(Math.PI * u),
        roll: 0.35 * Math.sin(6.2 * 0.8) * (1 - u) + 0.55 * Math.sin(Math.PI * u), charge };
    }
    if (t < WARP_AT) {                               // segura e treme enquanto o anel carrega
      const shake = Math.pow(clamp01((t - 8.2) / (WARP_AT - 8.2)), 2) * 0.03;
      return { x: Math.sin(t * 41) * shake, y: -0.15 + Math.cos(t * 37) * shake, z: 8.2,
        yaw: 2 * Math.PI, pitch: 0.12, roll: Math.sin(t * 2) * 0.03, charge };
    }
    const w = (t - WARP_AT) / 0.7;                   // salto: dispara para longe
    return { x: 0, y: -0.15, z: 8.2 + 420 * w * w * w, yaw: 2 * Math.PI, pitch: 0.12, roll: 0, charge: 1, warp: w };
  }

  function transform(p, P) {
    let [x, y, z] = [p[0] - CENTER[0], p[1] - CENTER[1], p[2] - CENTER[2]];
    const s = 0.85;
    x *= s; y *= s; z *= s;
    let c = Math.cos(P.roll), n = Math.sin(P.roll);           // roll (eixo z)
    [x, y] = [x * c - y * n, x * n + y * c];
    c = Math.cos(P.pitch); n = Math.sin(P.pitch);             // pitch (eixo x)
    [y, z] = [y * c - z * n, y * n + z * c];
    c = Math.cos(P.yaw); n = Math.sin(P.yaw);                 // yaw (eixo y)
    [x, z] = [x * c + z * n, -x * n + z * c];
    return [x + P.x, y + P.y, z + P.z];
  }

  const LIGHT = (() => { const l = [-0.45, 0.7, -0.55], k = Math.hypot(...l); return l.map((a) => a / k); })();
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function drawShip(t) {
    const P = pose(t);
    if (P.z > 300) return;
    const foc = Math.min(W, H) * 1.05;
    const proj = (q) => [W / 2 + (q[0] / q[2]) * foc, H / 2 - (q[1] / q[2]) * foc];
    const T = V.map((p) => transform(p, P));
    const C = transform(CENTER, P);
    const glow = 0.35 + 0.65 * P.charge + 0.12 * P.charge * Math.sin(t * 9);
    const items = [];
    for (const f of F) {
      const pts = f.idx.map((i) => T[i]);
      const cen = pts.reduce((a, q) => [a[0] + q[0] / pts.length, a[1] + q[1] / pts.length, a[2] + q[2] / pts.length], [0, 0, 0]);
      let nrm = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
      const k = Math.hypot(...nrm) || 1; nrm = nrm.map((a) => a / k);
      if (f.solid && dot(nrm, sub(cen, C)) < 0) nrm = nrm.map((a) => -a);   // normal apontando para fora
      if (f.solid && dot(nrm, cen) > 0) continue;                              // de costas para a câmera
      if (!f.solid && dot(nrm, cen) > 0) nrm = nrm.map((a) => -a);             // superfícies finas: dois lados
      let fill;
      if (f.ring) {
        const b = glow * (0.75 + 0.25 * -nrm[2]);
        fill = `rgb(${110 + 145 * b * 0.6 | 0},${150 + 105 * b | 0},255)`;
      } else {
        const sh = 0.22 + 0.78 * Math.max(0, dot(nrm, LIGHT));
        fill = `rgb(${f.col[0] * sh | 0},${f.col[1] * sh | 0},${f.col[2] * sh | 0})`;
      }
      items.push({ z: cen[2], pts: pts.map(proj), fill });
    }
    items.sort((a, b) => b.z - a.z);                                           // pintor: do fundo para a frente
    for (const it of items) {
      g2.fillStyle = it.fill; g2.strokeStyle = it.fill; g2.lineWidth = 1;
      g2.beginPath(); g2.moveTo(it.pts[0][0], it.pts[0][1]);
      for (let i = 1; i < it.pts.length; i++) g2.lineTo(it.pts[i][0], it.pts[i][1]);
      g2.closePath(); g2.fill(); g2.stroke();
    }
    // faixas de luz das asas
    g2.strokeStyle = `rgba(120,230,255,${0.4 + 0.5 * glow})`;
    g2.lineWidth = Math.max(1.5, 2.2 * dpr * 8 / P.z);
    for (const [a, b] of STRIPS) {
      const A = proj(T[a]), B = proj(T[b]);
      g2.beginPath(); g2.moveTo(A[0], A[1]); g2.lineTo(B[0], B[1]); g2.stroke();
    }
    // brilho do anel (aura) e rastro no salto
    const RC = proj(transform([0, 0, RING_Z], P));
    const rad = (foc * 1.6) / P.z;
    const aura = g2.createRadialGradient(RC[0], RC[1], 0, RC[0], RC[1], rad);
    aura.addColorStop(0, `rgba(150,220,255,${0.15 + 0.45 * glow})`);
    aura.addColorStop(1, 'rgba(120,90,255,0)');
    g2.fillStyle = aura; g2.beginPath(); g2.arc(RC[0], RC[1], rad, 0, Math.PI * 2); g2.fill();
    if (P.warp !== undefined) {
      const from = proj(transform([0, 0, RING_Z], { ...P, z: 8.2 }));
      g2.strokeStyle = `rgba(190,230,255,${1 - P.warp})`;
      g2.lineWidth = 6 * dpr * (1 - P.warp) + 1;
      g2.beginPath(); g2.moveTo(from[0], from[1]); g2.lineTo(RC[0], RC[1]); g2.stroke();
    }
  }

  /* ======================= estrelas ======================= */
  const stars = Array.from({ length: 650 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), pz: 0 }));
  for (const s of stars) s.pz = s.z;

  /** velocidade das estrelas: devagar → acelera junto com a carga → dobra → desacelera */
  function speed(t) {
    if (t < WARP_AT - 1.5) return 0.0007 + t * 0.00012;
    if (t < WARP_AT) return 0.0018 + Math.pow((t - (WARP_AT - 1.5)) / 1.5, 3) * 0.045;
    if (t < WARP_AT + 0.6) return 0.047;
    return Math.max(0.0012, 0.047 * Math.exp(-(t - WARP_AT - 0.6) * 2.2));
  }

  const t0 = performance.now();
  let done = false, raf = 0;

  function frame(now) {
    const t = (now - t0) / 1000;
    const sp = speed(t);
    const f = Math.min(W, H) * 0.9;
    g2.fillStyle = `rgba(3,3,10,${sp > 0.01 ? 0.35 : 0.92})`;   // rastro: mais rápido, menos apagado
    g2.fillRect(0, 0, W, H);
    const neb = g2.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.9);
    neb.addColorStop(0, 'rgba(90,50,170,0.05)'); neb.addColorStop(1, 'rgba(0,0,0,0)');
    g2.fillStyle = neb; g2.fillRect(0, 0, W, H);

    const fadeIn = Math.min(1, t / 1.5);
    for (const s of stars) {
      s.pz = s.z; s.z -= sp;
      if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = s.pz = 1; continue; }
      const sx = W / 2 + (s.x / s.z) * f, sy = H / 2 + (s.y / s.z) * f;
      const px = W / 2 + (s.x / s.pz) * f, py = H / 2 + (s.y / s.pz) * f;
      const b = Math.min(1, (1 - s.z) * 1.4) * fadeIn;
      g2.strokeStyle = `rgba(${200 + 55 * b | 0},${210 + 45 * b | 0},255,${b})`;
      g2.lineWidth = Math.max(1, (1 - s.z) * 2.6 * dpr);
      g2.beginPath(); g2.moveTo(px, py); g2.lineTo(sx + 0.1, sy + 0.1); g2.stroke();
    }
    if (t > 0.8 && t < WARP_AT + 0.8) drawShip(t);
    const flash = Math.max(0, 1 - Math.abs(t - WARP_AT - 0.15) / 0.35);   // clarão do salto
    if (flash > 0) { g2.fillStyle = `rgba(220,230,255,${flash * 0.85})`; g2.fillRect(0, 0, W, H); }

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
  const subEl = el.querySelector('.intro-sub');
  // (intro.js roda antes do app.js, então `state` pode ainda não existir)
  const fill = () => {
    if (typeof state !== 'undefined' && state.all && state.all.length) subEl.textContent = `${state.all.length} jogos esperando por você`;
    else if (!done) setTimeout(fill, 300);
  };
  setTimeout(fill, 300);
})();
