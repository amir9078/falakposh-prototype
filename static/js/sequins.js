/* Sequin canvases.
   data-sequins="band": the hero sky. Sequins are sewn along a band through the photograph,
     like the Milky Way (Kehkashan). Sequins behind the words fade back.
   data-sequins="text" data-text="2010": a word embroidered in sequins.
   Each sequin is a tilted disc with its own surface normal. The pointer is the light:
   a sequin flashes only when the light bounces off it toward the viewer, the way real sequins do.
   Phones: the light drifts on its own, and follows the phone's tilt where the browser allows.
   Reduced motion: drawn once, lit from one fixed angle. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;

  function Sky(canvas) {
    const mode = canvas.dataset.sequins || 'band';
    const ctx = canvas.getContext('2d');
    const host = mode === 'band' ? (canvas.closest('[data-hero]') || canvas.parentElement) : canvas.parentElement;
    const zone = mode === 'band' ? host : (canvas.closest('section') || host); // where the pointer moves the light
    const haze = document.createElement('canvas');
    const hctx = haze.getContext('2d');
    let W = 0, H = 0, dpr = 1, seq = [], C = {}, band = null;
    const light = { x: 0, y: 0, z: mode === 'band' ? 380 : 260 }, target = { x: 0, y: 0 };
    let lastPointer = 0, visible = false, raf = 0, t0 = performance.now(), started = mode === 'band';

    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const rgb = (n) => cs.getPropertyValue(n).trim().split(',').map(Number);
      const theme = document.documentElement.dataset.theme;
      const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      C = { base: rgb('--sequin'), tint: rgb('--sequin-tint'), dark };
      if (mode === 'text') C.base = dark ? rgb('--sequin') : [44, 64, 132]; // lapis sequins on a light ground
    };

    let s = 20101;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const rectIn = (el, pad = 0) => {
      if (!el) return null;
      const h = host.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x0: r.left - h.left - pad, y0: r.top - h.top - pad, x1: r.right - h.left + pad, y1: r.bottom - h.top + pad };
    };
    const sequin = (x, y, r, fade, delay) => {
      const tilt = 0.12 + rnd() * 0.42, az = rnd() * Math.PI * 2;
      return { x, y, r, az, nx: Math.sin(tilt) * Math.cos(az), ny: Math.sin(tilt) * Math.sin(az), nz: Math.cos(tilt), tint: rnd() < 0.18, fade, delay };
    };

    const buildBand = () => {
      const arch = rectIn(host.querySelector('.hero__arch'));
      const cx = arch ? (arch.x0 + arch.x1) / 2 : W * 0.7, cy = arch ? (arch.y0 + arch.y1) / 2 : H * 0.5;
      const ang = -0.62, ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux, reach = Math.hypot(W, H);
      band = { cx, cy, ux, uy, px, py, width: Math.min(W, H) * 0.16 };
      const copy = rectIn(host.querySelector('.hero__copy'), 18);
      const n = Math.round(Math.min(coarse ? 420 : 1300, (W * H) / (coarse ? 800 : 900)));
      for (let i = 0; i < n; i++) {
        const inBand = rnd() < 0.86;
        let x, y, t;
        if (inBand) {
          t = rnd() * 2 - 1;
          const off = gauss() * band.width * (0.55 + 0.45 * Math.cos(t * 1.4)) * 0.55;
          x = cx + ux * reach * 0.6 * t + px * off; y = cy + uy * reach * 0.6 * t + py * off;
        } else { x = rnd() * W; y = rnd() * H; t = (x / W) * 2 - 1; }
        if (x < -8 || y < -8 || x > W + 8 || y > H + 8) continue;
        const behind = copy && x > copy.x0 && x < copy.x1 && y > copy.y0 && y < copy.y1;
        seq.push(sequin(x, y, 0.8 + Math.pow(rnd(), 1.8) * 2.2 + (rnd() < 0.04 ? 1.3 : 0), behind ? 0.12 : 1, (t + 1) * 0.7 + rnd() * 0.2));
      }
    };

    const buildText = () => {
      const text = canvas.dataset.text || '';
      const off = document.createElement('canvas');
      off.width = Math.ceil(W); off.height = Math.ceil(H);
      const o = off.getContext('2d');
      const fam = getComputedStyle(host).fontFamily;
      let size = H * 1.05;
      o.font = `400 ${size}px ${fam}`;
      const w = o.measureText(text).width;
      if (w > W * 0.98) { size *= (W * 0.98) / w; o.font = `400 ${size}px ${fam}`; }
      o.textBaseline = 'alphabetic'; o.fillStyle = '#000';
      const m = o.measureText(text);
      const asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
      o.fillText(text, 0, (H + asc - desc) / 2);
      const data = o.getImageData(0, 0, off.width, off.height).data;
      const step = Math.max(3.6, W / 120);
      for (let y = step / 2, row = 0; y < H; y += step * 0.87, row++) {
        for (let x = (row % 2 ? step / 2 : 0) + step / 2; x < W; x += step) {
          const jx = x + (rnd() - 0.5) * step * 0.25, jy = y + (rnd() - 0.5) * step * 0.25;
          const a = data[((jy | 0) * off.width + (jx | 0)) * 4 + 3];
          if (a > 140) seq.push(sequin(jx, jy, step * (0.5 + rnd() * 0.12), 1, (jx / W) * 1.3 + rnd() * 0.15));
        }
      }
    };

    const paintHaze = () => {
      haze.width = canvas.width; haze.height = canvas.height;
      hctx.setTransform(dpr, 0, 0, dpr, 0, 0); hctx.clearRect(0, 0, W, H);
      if (!band) return;
      const { cx, cy, ux, uy, width } = band, R = Math.hypot(W, H) * 0.5;
      hctx.save(); hctx.translate(cx, cy); hctx.rotate(Math.atan2(uy, ux)); hctx.scale(1, width / R);
      const g = hctx.createRadialGradient(0, 0, 0, 0, 0, R), [r, gg, b] = C.tint, a = C.dark ? 0.2 : 0.11;
      g.addColorStop(0, `rgba(${r},${gg},${b},${a})`); g.addColorStop(0.45, `rgba(${r},${gg},${b},${a * 0.45})`); g.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      hctx.fillStyle = g; hctx.beginPath(); hctx.arc(0, 0, R, 0, Math.PI * 2); hctx.fill(); hctx.restore();
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!light.x) { light.x = target.x = W * (mode === 'band' ? 0.66 : 0.3); light.y = target.y = H * 0.3; }
      s = 20101; seq = [];
      mode === 'band' ? buildBand() : buildText();
      paintHaze(); draw(performance.now());
    };

    const star = (x, y, L, w) => {
      ctx.beginPath();
      ctx.moveTo(x - L, y); ctx.lineTo(x, y - w); ctx.lineTo(x + L, y); ctx.lineTo(x, y + w); ctx.closePath();
      ctx.moveTo(x, y - L); ctx.lineTo(x + w, y); ctx.lineTo(x, y + L); ctx.lineTo(x - w, y); ctx.closePath();
      ctx.fill();
    };

    const draw = (now) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (band) ctx.drawImage(haze, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const el = started ? (now - t0) / 1000 : -1;
      const { dark, base, tint } = C, text = mode === 'text';
      const glints = [];
      for (let i = 0; i < seq.length; i++) {
        const q = seq[i];
        let k = reduce ? 1 : Math.min(1, Math.max(0, (el - q.delay) / 0.5));
        if (k <= 0) continue;
        k = 1 - Math.pow(1 - k, 3);
        let lx = light.x - q.x, ly = light.y - q.y, lz = light.z;
        const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
        let hx = lx, hy = ly, hz = lz + 1; const hl = Math.hypot(hx, hy, hz); hx /= hl; hy /= hl; hz /= hl;
        const spec = Math.pow(Math.max(0, q.nx * hx + q.ny * hy + q.nz * hz), text ? 70 : 140);
        const diff = Math.max(0, q.nx * lx + q.ny * ly + q.nz * lz);
        const c = q.tint && !text ? tint : base;
        const lum = text ? (dark ? 0.5 + diff * 0.45 : 0.78 + diff * 0.45) : (dark ? 0.42 + diff * 0.5 : 0.62 + diff * 0.3);
        const glint = Math.min(1, spec * 1.4);
        const R = Math.min(255, c[0] * lum + glint * 140), G = Math.min(255, c[1] * lum + glint * 140), B = Math.min(255, c[2] * lum + glint * 140);
        const alpha = (text ? 0.95 : (dark ? 0.62 : 0.72) + glint * 0.3) * k * q.fade;
        ctx.save();
        ctx.translate(q.x, q.y); ctx.rotate(q.az); ctx.scale(1, 0.5 + 0.5 * q.nz);
        ctx.beginPath(); ctx.arc(0, 0, q.r * k, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${R | 0},${G | 0},${B | 0},${alpha})`;
        ctx.fill();
        if (!dark && !text) { ctx.lineWidth = 0.5; ctx.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${0.22 * k * q.fade})`; ctx.stroke(); }
        if (!text && q.r > 2.1) { ctx.beginPath(); ctx.arc(0, 0, q.r * 0.22, 0, Math.PI * 2); ctx.fillStyle = dark ? 'rgba(8,12,30,.55)' : 'rgba(255,255,255,.55)'; ctx.fill(); }
        ctx.restore();
        if (glint > 0.45 && q.fade === 1) glints.push([q, (glint - 0.45) / 0.55]);
      }
      for (const [q, g] of glints) {
        const rad = q.r * (3.5 + g * 3);
        const halo = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, rad);
        if (dark || text) { halo.addColorStop(0, `rgba(255,255,255,${0.8 * g})`); halo.addColorStop(1, 'rgba(255,255,255,0)'); }
        else { halo.addColorStop(0, `rgba(255,255,255,${0.95 * g})`); halo.addColorStop(0.35, `rgba(${tint[0]},${tint[1]},${tint[2]},${0.16 * g})`); halo.addColorStop(1, `rgba(${tint[0]},${tint[1]},${tint[2]},0)`); }
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(q.x, q.y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = dark || text ? `rgba(255,255,255,${0.9 * g})` : `rgba(${tint[0]},${tint[1]},${tint[2]},${0.55 * g})`;
        star(q.x, q.y, q.r * (2.4 + g * 3.2), 0.55);
        ctx.fillStyle = `rgba(255,255,255,${g})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.8, q.r * 0.45), 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = (now) => {
      raf = 0;
      if (!visible) return;
      if (now - lastPointer > 2200) { // idle: the light wanders slowly
        const tt = now / 1000;
        if (band) {
          const along = Math.sin(tt * 0.21) * Math.hypot(W, H) * 0.32, across = Math.sin(tt * 0.53) * H * 0.18;
          target.x = band.cx + band.ux * along + band.px * across; target.y = band.cy + band.uy * along + band.py * across;
        } else { target.x = W * (0.5 + 0.55 * Math.sin(tt * 0.35)); target.y = H * (0.5 + 0.6 * Math.sin(tt * 0.7)); }
      }
      light.x += (target.x - light.x) * 0.075;
      light.y += (target.y - light.y) * 0.075;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => { if (!raf && !reduce) raf = requestAnimationFrame(loop); else if (reduce) draw(performance.now()); };

    zone.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      target.x = e.clientX - r.left; target.y = e.clientY - r.top; lastPointer = performance.now();
    });
    addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || !visible) return;
      const cx = band ? band.cx : W / 2, cy = band ? band.cy : H / 2;
      target.x = cx + Math.max(-1, Math.min(1, e.gamma / 30)) * W * 0.45;
      target.y = cy + Math.max(-1, Math.min(1, (e.beta - 50) / 30)) * H * 0.35;
      lastPointer = performance.now();
    });
    new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible && !started) { started = true; t0 = performance.now(); }
      if (visible) start();
    }, { threshold: mode === 'text' ? 0.35 : 0 }).observe(host);
    let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(resize, 60); }).observe(host);
    const retheme = () => { readColors(); paintHaze(); draw(performance.now()); };
    document.addEventListener('fp:theme', retheme);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
    document.fonts?.ready.then(() => resize());
    readColors(); resize();
  }

  document.querySelectorAll('[data-sequins]').forEach(Sky);
})();
