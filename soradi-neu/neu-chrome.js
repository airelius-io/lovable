// One continuous chrome line for the whole scroll story.
// The path is computed once per frame in viewport space and drawn into a layer
// inside each sticky stage, so it always sits behind the copy and never doubles.
const root = document.getElementById('ss-webgl-m2m');
if (root) {
  const q = s => root.querySelector(s);
  const scroller = root.ssScroller, track1 = q('.scroll-track'), stage1 = q('.stage');
  const track2 = q('.method-track'), stage2 = q('.method-stage');
  const layers = [...root.querySelectorAll('.chrome-layer')].map(c => ({ c, ctx: c.getContext('2d'), stage: c.parentElement, dirty: true }));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // Morph path: 21 centerline states from the Higgsfield scene, wave (0) to the 2 (20).
  const src = JSON.parse(q('.chrome-path-data').textContent);
  const N = src.points, K = src.states, R0 = src.radius;
  const states = [];
  // The path data may be stored at a lower resolution (src.stored points); upsample to N points.
  const M = src.stored || N;
  for (let k = 0; k < K; k++) {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const f = i / (N - 1) * (M - 1), lo = Math.floor(f), hi = Math.min(lo + 1, M - 1), t = f - lo;
      for (let c = 0; c < 3; c++) a[i * 3 + c] = (src.d[(k * M + lo) * 3 + c] * (1 - t) + src.d[(k * M + hi) * 3 + c] * t) / 1000;
    }
    states.push(a);
  }
  // Bounds of the finished 2 (stroke centre).
  let twoMinY = Infinity, twoMaxY = -Infinity, twoMinX = Infinity, twoMaxX = -Infinity;
  for (let i = 0; i < N; i++) { const x = states[K - 1][i * 3], y = states[K - 1][i * 3 + 1]; twoMinX = Math.min(twoMinX, x); twoMaxX = Math.max(twoMaxX, x); twoMinY = Math.min(twoMinY, y); twoMaxY = Math.max(twoMaxY, y); }

  let lastT = 0, w = 960, H = 660, dpr = 1, s = 0, targetS = 0, px = 0, py = 0, tpx = 0, tpy = 0, frame = 0;
  let two = { cx: 480, base: 400, scale: 80 }, fingertipY = .47;
  const P = new Float32Array(N * 3);   // current path, viewport px, y down
  const tmp = new Float32Array(N * 3);

  let LA = 1, T2 = 2600, LB = 1;   // cached scroll geometry
  function measure() {
    w = scroller.clientWidth || 960; H = stage1.clientHeight || 660; dpr = Math.min(devicePixelRatio || 1, 2);
    LA = Math.max(1, track1.offsetHeight - H); T2 = track2.offsetTop; LB = Math.max(1, track2.offsetHeight - H);
    for (const l of layers) { l.c.width = Math.round(w * dpr); l.c.height = Math.round(H * dpr); }
    // Place the 2 between the two Ms, on their baseline, at their cap height.
    const ml = q('.m-left'), mr = q('.m-right');
    const fs = parseFloat(getComputedStyle(ml).fontSize) || 200;
    const c = document.createElement('canvas').getContext('2d');
    c.font = fs + 'px Italiana, Georgia, serif';
    const m = c.measureText('M');
    const cap = m.actualBoundingBoxAscent || fs * .7;
    const asc = m.fontBoundingBoxAscent || fs * .8, desc = m.fontBoundingBoxDescent || fs * .2;
    const lineH = parseFloat(getComputedStyle(ml).lineHeight) || fs * .95;
    const baseline = ml.offsetTop + (lineH - (asc + desc)) / 2 + asc;
    const leftEdge = ml.offsetLeft + ml.offsetWidth, rightEdge = mr.offsetLeft;
    const scale = cap * .98 / (twoMaxY - twoMinY + 2 * R0);
    // base: y of the 2's outer bottom edge (sits on the M baseline)
    two = { cx: (leftEdge + rightEdge) / 2 - (twoMinX + twoMaxX) / 2 * scale, base: baseline, scale, minY: twoMinY };
    // Fingertips of the marble hands in the Öffnungsmoment.
    const hands = q('.opening-hands');
    const hr = hands.getBoundingClientRect(), sr = stage2.getBoundingClientRect();
    fingertipY = hr.height ? (hr.top - sr.top + hr.height * .455) / H : .47;
    // Blue core of the Metapher scene (the line loops around it).
    const or = q('.method-orbit').getBoundingClientRect();
    orbit = { x: or.left - sr.left + or.width / 2, y: or.top - sr.top + or.height / 2, r: or.width * .11 };
    // "Und für Ihr Unternehmen?" button: the line ends as its underline.
    const br = q('.method-next').getBoundingClientRect();
    cta = { x0: br.left - sr.left, x1: br.right - sr.left, y: br.bottom - sr.top + 3 };
    strikes = [...root.querySelectorAll('.metaphor-strikes span')].map(e => { const r = e.getBoundingClientRect(); return { x0: r.left - sr.left - 6, x1: r.right - sr.left + 6, y: r.top - sr.top + r.height * .55 }; });
    const idea = q('.metaphor-idea'), keep = idea.style.transform; idea.style.transform = 'none';
    const ir = idea.getBoundingClientRect(); idea.style.transform = keep;
    ideaBox = { x0: ir.left - sr.left, x1: ir.right - sr.left, y: ir.bottom - sr.top + 6 };
    bust = w < 650 ? { cx: w * .34, cy: H * .73, h: H * .21 } : { cx: w * .66, cy: H * .47, h: H * .58 };
    request();
  }
  let ideaBox = null, strikes = [], orbit = { x: 800, y: 330, r: 50 }, cta = { x0: 80, x1: 400, y: 500 }, bust = { cx: 900, cy: 360, h: 420 };

  // Resample a dense polyline to N points by arc length (only the first `frac` of it).
  const poly = [];
  function resample(out, frac = 1, from = 0) {
    const n = poly.length, cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]) * (poly[i][3] ?? 1);
    const L1 = cum[n - 1] * clamp(frac, .0005, 1), L0 = Math.min(cum[n - 1] * clamp(from), L1 - .5);
    let j = 1;
    for (let i = 0; i < N; i++) {
      const target = L0 + (L1 - L0) * i / (N - 1);
      while (j < n - 1 && cum[j] < target) j++;
      const seg = cum[j] - cum[j - 1] || 1, f = clamp((target - cum[j - 1]) / seg);
      const a = poly[j - 1], b = poly[j], k = i * 3;
      out[k] = lerp(a[0], b[0], f); out[k + 1] = lerp(a[1], b[1], f); out[k + 2] = lerp(a[2], b[2], f);
    }
  }
  function cubic(a, b, c, d, steps, z0 = 0, z1 = 0) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, u = 1 - t;
      poly.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
                 u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1], lerp(z0, z1, t)]);
    }
  }
  // Metapher: the line works like a pen. It crosses out the usual outreach one line after the other,
  // turning in a smooth arc at each end, then runs out low to the right.
  const strikeEls = [...root.querySelectorAll('.metaphor-strikes span')];
  function loopShape(out, t, yShift, tail = 0) {
    const yLow = H * (w < 650 ? .88 : .83) + yShift;
    poly.length = 0; poly.push([-.14 * w, yLow, 0]);
    const ends = [];
    if (strikes.length) {
      const xl = Math.min(...strikes.map(s => s.x0)), xr = Math.max(...strikes.map(s => s.x1));
      const y0 = strikes[0].y + yShift;
      cubic([-.14 * w, yLow], [xl - 160, yLow], [xl - 70, y0 + 40], [xl, y0], 30);
      strikes.forEach((st, i) => {
        const y = st.y + yShift, ltr = i % 2 === 0, a = ltr ? xl : xr, b = ltr ? xr : xl;
        for (let k = 1; k <= 40; k++) poly.push([lerp(a, b, k / 40), y + Math.sin(k / 40 * Math.PI) * -1.2, 0]);
        ends.push(poly.length - 1);
        const nx = strikes[i + 1];
        if (nx) {   // round turn to the next line
          const ny = nx.y + yShift, r = (ny - y) / 2, cx = b, cy = y + r, dir = ltr ? 1 : -1;
          for (let k = 1; k <= 16; k++) { const ang = -Math.PI / 2 + k / 16 * Math.PI; poly.push([cx + dir * Math.cos(ang) * r * .9, cy + Math.sin(ang) * r, 0]); }
        }
      });
      const last = poly[poly.length - 1];
      if (ideaBox) {
        const iy = ideaBox.y + yShift, dir = strikes.length % 2 ? 1 : -1;
        cubic([last[0], last[1]], [last[0] + dir * 50, last[1] + 25], [ideaBox.x0 - 60, iy], [ideaBox.x0, iy], 30);
        ends.push(poly.length - 1);           // the idea appears when the pen reaches it
        for (let k = 1; k <= 40; k++) poly.push([lerp(ideaBox.x0, ideaBox.x1, k / 40), iy, 0]);
        cubic([ideaBox.x1, iy], [ideaBox.x1 + 80, iy], [w * .95, yLow], [1.14 * w, yLow], 30);
      } else cubic([last[0], last[1]], [last[0] + 80, last[1] + 30], [w * .92, yLow], [1.14 * w, yLow], 30);
    } else cubic([-.14 * w, yLow], [w * .3, yLow], [w * .7, yLow], [1.14 * w, yLow], 30);
    // pen progress, and which words it has already crossed out
    const q = strikes.length ? lerp(.08, 1, smooth((t - .03) / .16)) : 1;
    let total = 0; const cum = [0];
    for (let i = 1; i < poly.length; i++) { total += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]); cum.push(total); }
    const ideaEl = root.querySelector('.metaphor-idea'), ideaOn = ends[strikes.length] !== undefined && q * total >= cum[ends[strikes.length]] - 2;
    if (ideaEl.classList.contains('is-shown') !== ideaOn) ideaEl.classList.toggle('is-shown', ideaOn);
    strikeEls.forEach((el, i) => { const done = ends[i] !== undefined && q * total >= cum[ends[i]] - 2; if (el.classList.contains('is-struck') !== done) el.classList.toggle('is-struck', done); });
    resample(out, q, tail);
  }
  // Öffnungsmoment: straight line through the fingertips.
  function straightShape(out, y) {
    for (let i = 0; i < N; i++) { const k = i * 3; out[k] = lerp(-.14, 1.14, i / (N - 1)) * w; out[k + 1] = y; out[k + 2] = 0; }
  }
  // Verbindung: the line draws a hand that points at the bust ("Das hat etwas mit mir zu tun").
  // Outline of a pointing hand, index finger to the left, forearm leaving to the right. Units: hand size.
  const HAND = [[3.2,.17],[1.0,.18],[.88,.15],[.76,.08],[.66,.09],[.6,.14],[.66,.19],[.58,.2],[.3,.2],[.19,.205],[.155,.24],[.19,.275],[.3,.28],[.57,.285],
    [.55,.31],[.56,.35],[.63,.355],[.59,.38],[.6,.425],[.67,.43],[.63,.455],[.65,.5],[.73,.505],[.82,.53],[.92,.5],[1.0,.45],[3.2,.44]];
  function catmull(pts, steps) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      for (let j = 0; j < steps; j++) {
        const t = j / steps, t2 = t * t, t3 = t2 * t;
        out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                  .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[pts.length - 1]); return out;
  }
  const HANDC = catmull(HAND, 10);
  // The arm belongs to the bust: out of the shoulder, down to the elbow, forearm back up,
  // index finger pointing at her own chest.
  function handGeom() {
    const mobile = w < 650, bw = bust.h * (bustPts ? bustPts.aspect : .83);
    const S = mobile ? bust.h * .42 : bust.h * .4;
    const tip = [bust.cx + bw * .44, bust.cy + bust.h * .26];
    const rot = .28;                                             // finger points left, slightly up, at the chest
    const wrist = [tip[0] + .85 * S * Math.cos(rot), tip[1] + .85 * S * Math.sin(rot)];
    const elbow = [wrist[0] + bust.h * .02, bust.cy + bust.h * .6];
    const shoulder = [bust.cx + bw * .02, bust.cy + bust.h * .33];
    return { S, tip, elbow, shoulder, rot, bw };
  }
  const HAND_ONLY = HANDC.filter(([x]) => x <= 1.0001);
  function handShape(out, d, yShift) {
    const g = handGeom(), c = Math.cos(g.rot), s2 = Math.sin(g.rot), ax = .155, ay = .24;
    const toWorld = (x, y) => { const lx = (x - ax) * g.S, ly = (y - ay) * g.S; return [g.tip[0] + lx * c - ly * s2, g.tip[1] + lx * s2 + ly * c + yShift]; };
    const wristTop = toWorld(1.0, .18), wristMid = toWorld(1.0, .31);
    const sh = [g.shoulder[0], g.shoulder[1] + yShift], el = [g.elbow[0], g.elbow[1] + yShift];
    poly.length = 0;
    // enters from below the bust, rises into the shoulder
    poly.push([sh[0], sh[1], 0]);   // the arm grows out of her shoulder
    // upper arm down to a rounded elbow, forearm straight up to the wrist
    cubic(sh, [lerp(sh[0], el[0], .45), sh[1] + bust.h * .05], [el[0] - bust.h * .14, el[1] + bust.h * .02], [el[0] - bust.h * .02, el[1]], 24);
    cubic([el[0] - bust.h * .02, el[1]], [el[0] + bust.h * .06, el[1] - bust.h * .01], [wristMid[0] + bust.h * .05, lerp(el[1], wristMid[1], .5)], wristTop, 20);
    for (const q2 of poly) if (q2[3] === undefined) q2[3] = .5;   // the arm gets fewer points than the hand
    for (const [x, y] of HAND_ONLY) { const p2 = toWorld(x, y); poly.push([p2[0], p2[1], 0, 1]); }
    resample(out, d);
  }
  // Aktivierung: the line comes back in from the left and ends under the button.
  function ctaShape(out, d, yShift) {
    const y = cta.y + yShift, start = [-.2 * w, y - H * .22];
    poly.length = 0; poly.push([start[0], start[1], 0]);
    cubic(start, [cta.x0 * .4, start[1]], [cta.x0 - 80, y], [cta.x0, y], 50);
    poly.push([cta.x1, y, 0]);
    resample(out, d);
  }

  // ---- path keyframes -------------------------------------------------------
  function wavePoint(i, o, out, k) {
    const t = i / (N - 1);
    const x = lerp(-.14, 1.14, t) * w;
    const y = H * (o.yc + o.amp * Math.sin(t * o.freq + o.phase)) + px * 13 * Math.sin(t * 3) * o.amp * 7 + py * 7 * o.amp * 7;
    const z = o.z * Math.sin(t * 8.7 + o.phase);
    out[k] = x; out[k + 1] = y; out[k + 2] = z;
  }
  function twoState(kf, i, out, k, yShift) {
    const lo = Math.floor(kf), hi = Math.min(lo + 1, K - 1), f = kf - lo, j = i * 3;
    const a = states[lo], b = states[hi];
    const x = a[j] + (b[j] - a[j]) * f, y = a[j + 1] + (b[j + 1] - a[j + 1]) * f, z = a[j + 2] + (b[j + 2] - a[j + 2]) * f;
    out[k] = two.cx + x * two.scale;
    out[k + 1] = two.base + yShift - (y - two.minY + R0) * two.scale;
    out[k + 2] = z * two.scale;
  }

  // Returns {alpha, radius} and fills P.
  const late = new Float32Array(N * 3), late2 = new Float32Array(N * 3);
  function solve(sv, realStage1Top, realStage2Top) {
    const L1 = LA, mt = T2, L2 = LB;
    const p = clamp(sv / L1), t = clamp((sv - mt) / L2), mobile = w < 650;
    // Form the 2 with the Ms, hold it, then let it run out again once the M2M stage leaves.
    const formed = smooth((p - .62) / .30);
    const unravel = smooth((sv - (mt - H * .75)) / (H * .75 + L2 * .08));   // stays a 2 until the method stage arrives
    const m = formed * (1 - unravel);
    // Wave before the 2 (address world and person). Same rhythm as the approved draft.
    const early = { yc: mobile ? .9 : .84, amp: mobile ? .035 : .06, freq: 6.4, phase: p * 6.4, z: 26 };
    const after = sv > L1 + 1;
    const y2 = realStage2Top;                    // later shapes travel with the method stage
    if (after) {
      if (t < .5) {
        // Pen through the metaphor, then the line slides out to the right; the opening stays clean.
        loopShape(late, t, y2, smooth((t - .19) / .05));
      } else {
        // Aktivierung: the line comes back in from the left and ends under the button.
        ctaShape(late, smooth((t - .76) / .12), y2);
      }
    }
    const kf = m * (K - 1), e = m;           // e: how much of the 2 is present
    const yShift = Math.min(0, realStage1Top);   // the 2 travels up with its stage
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (after) { tmp[k] = late[k]; tmp[k + 1] = late[k + 1]; tmp[k + 2] = late[k + 2]; }
      else wavePoint(i, early, tmp, k);
      if (e <= 0) { P[k] = tmp[k]; P[k + 1] = tmp[k + 1]; P[k + 2] = tmp[k + 2]; continue; }
      twoState(kf, i, P, k, yShift);
      // Offset field: at e=0 the path is the wave, at e=1 the 2. Decays as the morph advances.
      const d = 1 - e; const dd = d * d * (3 - 2 * d);
      const b0x = two.cx + states[0][k] * two.scale, b0y = two.base + yShift - (states[0][k + 1] - two.minY + R0) * two.scale, b0z = states[0][k + 2] * two.scale;
      P[k] += (tmp[k] - b0x) * dd; P[k + 1] += (tmp[k + 1] - b0y) * dd; P[k + 2] += (tmp[k + 2] - b0z) * dd;
    }
    const thin = mobile ? 2.6 : 3.6;
    const radius = lerp(after ? thin * .9 : thin, R0 * two.scale, e);
    const alpha = .94;
    return { alpha, radius };
  }

  // ---- renderers --------------------------------------------------------------
  let gl = null;
  function stageTops(y) { const t1 = y <= LA ? 0 : LA - y; const t2 = y < T2 ? T2 - y : y <= T2 + LB ? 0 : T2 + LB - y; return [t1, t2]; }

  function draw2D(ctx, dy, radius) {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, dy * dpr);
    const lw = radius * 2, grad = ctx.createLinearGradient(0, H * .2, w, H * .8);
    [['#15283f', 0], ['#e7edf2', .22], ['#6e84a9', .42], ['#ffffff', .6], ['#142039', .8], ['#dfe6f2', 1]].forEach(([c, o]) => grad.addColorStop(o, c));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const [width, style] of [[lw, grad], [lw * .35, 'rgba(255,255,255,.75)']]) {
      ctx.beginPath(); ctx.moveTo(P[0], P[1] - (style === grad ? 0 : radius * .35));
      for (let i = 1; i < N; i++) ctx.lineTo(P[i * 3], P[i * 3 + 1] - (style === grad ? 0 : radius * .35));
      ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke();
    }
    ctx.restore();
  }

  function paint() {
    frame = 0;
    const now = performance.now(), dt = Math.min(64, now - (lastT || now)); lastT = now;
    const k = 1 - Math.exp(-dt / 70), kp = 1 - Math.exp(-dt / 140);   // frame-rate independent easing
    s = reduced ? targetS : lerp(s, targetS, k); if (Math.abs(s - targetS) < .3) s = targetS;
    px = lerp(px, tpx, kp); py = lerp(py, tpy, kp);
    const [top1, top2] = stageTops(targetS);
    const { alpha, radius } = solve(s, top1, top2);
    const visible = alpha > .002;
    if (visible && gl) gl.render(radius);
    for (const l of layers) {
      const top = l.stage === stage1 ? top1 : top2;
      const onScreen = top > -H && top < H;
      if (!onScreen) { if (l.dirty) { l.ctx.clearRect(0, 0, l.c.width, l.c.height); l.dirty = false; } continue; }
      l.ctx.setTransform(1, 0, 0, 1, 0, 0); l.ctx.clearRect(0, 0, l.c.width, l.c.height); l.dirty = true;
      if (!visible) continue;
      l.ctx.globalAlpha = alpha;
      if (gl) l.ctx.drawImage(gl.canvas, 0, 0, gl.canvas.width, gl.canvas.height, 0, -top * dpr, w * dpr, H * dpr);
      else draw2D(l.ctx, -top, radius);
      l.ctx.globalAlpha = 1;
    }
    if (Math.abs(s - targetS) > .3 || Math.abs(px - tpx) > .002 || Math.abs(py - tpy) > .002) request(); else lastT = 0;
  }
  function request() { if (!frame) frame = requestAnimationFrame(paint); }


  // The bust from contact data waits for the marble bust from Higgsfield (kept out for now).
  let bustPts = null;

  scroller.addEventListener('scroll', () => { targetS = scroller.scrollTop; request(); }, { passive: true });
  scroller.addEventListener('pointermove', e => { if (reduced) return; const r = scroller.getBoundingClientRect(); tpx = (e.clientX - r.left) / r.width - .5; tpy = (e.clientY - r.top) / r.height - .5; request(); });
  scroller.addEventListener('pointerleave', () => { tpx = 0; tpy = 0; request(); });
  new ResizeObserver(measure).observe(stage1);
  targetS = s = scroller.scrollTop;
  measure();
  if (document.fonts) document.fonts.ready.then(measure);

  // ---- WebGL tube (progressive enhancement; the 2D path above is the fallback) ----
  (async () => {
    try {
      const THREE = await import('three');
      const SEG = 12, CAP = 5, RINGS = N + CAP * 2;
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
      const scene = new THREE.Scene();
      let sweepStart = -1; const ctaBtn = q('.method-next');
      ctaBtn.addEventListener('pointerenter', () => { sweepStart = performance.now(); request(); });
      ctaBtn.addEventListener('focus', () => { sweepStart = performance.now(); request(); });
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 5000); camera.position.set(0, 0, 2000); camera.lookAt(0, 0, 0);
      // Small studio environment for reflections, no external image.
      const env = document.createElement('canvas'); env.width = 512; env.height = 256;
      const ec = env.getContext('2d'), g = ec.createLinearGradient(0, 0, 0, 256);
      [[0, '#e4ecff'], [.23, '#ffffff'], [.30, '#17223a'], [.47, '#0a1120'], [.52, '#d6e4ff'], [.67, '#ffffff'], [.74, '#627798'], [1, '#101725']].forEach(([o, c]) => g.addColorStop(o, c));
      ec.fillStyle = g; ec.fillRect(0, 0, 512, 256); ec.fillStyle = '#fff'; ec.fillRect(45, 15, 18, 200); ec.fillStyle = '#0a142c'; ec.fillRect(330, 0, 50, 256);
      const tex = new THREE.CanvasTexture(env); tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
      const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromEquirectangular(tex).texture; tex.dispose();
      const material = new THREE.MeshStandardMaterial({ color: 0xd9e3f5, metalness: 1, roughness: .15, envMapIntensity: 1.35 });
      const key = new THREE.DirectionalLight(0xffffff, 2); key.position.set(-3, 5, 7); scene.add(key);
      const fill = new THREE.DirectionalLight(0x587cff, .7); fill.position.set(4, -2, 3); scene.add(fill);

      const pos = new Float32Array(RINGS * SEG * 3), nor = new Float32Array(RINGS * SEG * 3);
      const index = [];
      for (let r = 0; r < RINGS - 1; r++) for (let j = 0; j < SEG; j++) {
        const a = r * SEG + j, b = r * SEG + (j + 1) % SEG, c = (r + 1) * SEG + j, d = (r + 1) * SEG + (j + 1) % SEG;
        index.push(a, c, b, b, c, d);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setIndex(index);
      const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; scene.add(mesh);

      const C = new Float32Array(N * 3), T = new Float32Array(N * 3);
      let nx = 0, ny = 0, nz = 1;
      function ring(r, cx, cy, cz, rad, ox, oy, oz, Nx, Ny, Nz, Bx, By, Bz) {
        // (ox,oy,oz): centre used for normals (sphere centre on caps)
        for (let j = 0; j < SEG; j++) {
          const a = j / SEG * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const vx = cx + (Nx * ca + Bx * sa) * rad, vy = cy + (Ny * ca + By * sa) * rad, vz = cz + (Nz * ca + Bz * sa) * rad;
          const k = (r * SEG + j) * 3; pos[k] = vx; pos[k + 1] = vy; pos[k + 2] = vz;
          let mx = vx - ox, my = vy - oy, mz = vz - oz; const l = Math.hypot(mx, my, mz) || 1;
          nor[k] = mx / l; nor[k + 1] = my / l; nor[k + 2] = mz / l;
        }
      }
      function build(radius) {
        for (let i = 0; i < N; i++) { const k = i * 3; C[k] = P[k] - w / 2; C[k + 1] = H / 2 - P[k + 1]; C[k + 2] = P[k + 2]; }
        for (let i = 0; i < N; i++) {
          const a = Math.max(0, i - 1) * 3, b = Math.min(N - 1, i + 1) * 3;
          let tx = C[b] - C[a], ty = C[b + 1] - C[a + 1], tz = C[b + 2] - C[a + 2]; const l = Math.hypot(tx, ty, tz) || 1;
          T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
        }
        // Parallel transport frame, seeded perpendicular to the first tangent.
        let Nx = -T[1], Ny = T[0], Nz = 0; { const l = Math.hypot(Nx, Ny, Nz) || 1; Nx /= l; Ny /= l; Nz /= l; if (l < 1e-3) { Nx = 0; Ny = 0; Nz = 1; } }
        const frames = [];
        for (let i = 0; i < N; i++) {
          const tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
          const dot = Nx * tx + Ny * ty + Nz * tz; Nx -= tx * dot; Ny -= ty * dot; Nz -= tz * dot;
          const l = Math.hypot(Nx, Ny, Nz) || 1; Nx /= l; Ny /= l; Nz /= l;
          const Bx = ty * Nz - tz * Ny, By = tz * Nx - tx * Nz, Bz = tx * Ny - ty * Nx;
          frames.push([Nx, Ny, Nz, Bx, By, Bz]);
        }
        // Start cap (hemisphere), body, end cap.
        const f0 = frames[0], fN = frames[N - 1];
        for (let j = 0; j < CAP; j++) {
          const th = (CAP - j) / CAP * Math.PI / 2, back = Math.sin(th) * radius, rad = Math.cos(th) * radius;
          ring(j, C[0] - T[0] * back, C[1] - T[1] * back, C[2] - T[2] * back, rad, C[0], C[1], C[2], ...f0);
        }
        for (let i = 0; i < N; i++) { const k = i * 3; ring(CAP + i, C[k], C[k + 1], C[k + 2], radius, C[k], C[k + 1], C[k + 2], ...frames[i]); }
        const e = (N - 1) * 3;
        for (let j = 0; j < CAP; j++) {
          const th = (j + 1) / CAP * Math.PI / 2, fwd = Math.sin(th) * radius, rad = Math.cos(th) * radius;
          ring(CAP + N + j, C[e] + T[e] * fwd, C[e + 1] + T[e + 1] * fwd, C[e + 2] + T[e + 2] * fwd, rad, C[e], C[e + 1], C[e + 2], ...fN);
        }
        geometry.attributes.position.needsUpdate = true; geometry.attributes.normal.needsUpdate = true;
      }
      let sw = 0, sh = 0;
      gl = {
        canvas: renderer.domElement,
        render(radius) {
          if (sw !== w || sh !== H) {
            sw = w; sh = H; renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); renderer.setSize(w, H, false);
            camera.left = -w / 2; camera.right = w / 2; camera.top = H / 2; camera.bottom = -H / 2; camera.updateProjectionMatrix();
          }
          build(radius);
          mesh.rotation.y = px * .04;
          const sweep = sweepStart < 0 ? 1 : clamp((performance.now() - sweepStart) / 900);
          scene.environmentRotation.y = smooth(sweep) * Math.PI * 2;
          if (sweep < 1) request();
          scene.environmentRotation.x = Math.sin(s * .0006) * .25; renderer.render(scene, camera);
        }
      };
      renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); gl = null; root.dataset.chromeRenderer = 'canvas'; request(); });
      root.dataset.chromeRenderer = 'webgl';
      request();
    } catch (err) {
      root.dataset.chromeRenderer = 'canvas';
      request();
    }
  })();
}
