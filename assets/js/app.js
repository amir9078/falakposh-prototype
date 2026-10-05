/* Falakposh storefront prototype: shared behaviour.
   No framework. In Shopify, the bag talks to /cart/add.js and prices come from Shopify Markets. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = document.documentElement;
  root.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: keep it in memory */ } },
  };

  /* ---------- currency ---------- */
  const curEl = $('[data-cur]');
  const rates = Object.fromEntries($$('[data-code]', curEl || document).map(li => [li.dataset.code, +li.dataset.rate]));
  let currency = store.get('fp-cur', 'AED');
  if (!rates[currency]) currency = 'AED';
  const fmt = (aed) => {
    const v = aed * (rates[currency] || 1);
    const big = currency === 'AED' || currency === 'SAR';
    // Gulf prices read as "AED 1,450"; elsewhere shoppers expect £, $ and €.
    const display = big ? 'code' : (currency === 'CAD' || currency === 'AUD') ? 'symbol' : 'narrowSymbol';
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: display, maximumFractionDigits: big || v >= 100 ? 0 : 2 }).format(v).replace(/ /g, ' ');
  };
  const paintPrices = () => {
    $$('[data-price]').forEach(el => { el.textContent = fmt(+el.dataset.price); });
    const label = $('[data-cur-label]'); if (label) label.textContent = currency;
    $$('[data-code]').forEach(li => li.setAttribute('aria-selected', li.dataset.code === currency));
    $$('[data-cur-select]').forEach(s => { s.value = currency; });
  };
  $$('[data-cur-select]').forEach(s => s.addEventListener('change', () => { currency = s.value; store.set('fp-cur', currency); paintPrices(); renderBag(); }));
  if (curEl) {
    const btn = $('.cur__btn', curEl), list = $('.cur__list', curEl);
    const close = () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    btn.addEventListener('click', () => { const open = list.hidden; list.hidden = !open; btn.setAttribute('aria-expanded', open); if (open) $('[aria-selected="true"]', list)?.focus(); });
    list.addEventListener('click', e => { const li = e.target.closest('[data-code]'); if (!li) return; currency = li.dataset.code; store.set('fp-cur', currency); paintPrices(); renderBag(); close(); btn.focus(); });
    list.addEventListener('keydown', e => {
      const items = $$('[data-code]', list); const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.activeElement.click(); }
      if (e.key === 'Escape') { close(); btn.focus(); }
    });
    document.addEventListener('click', e => { if (!curEl.contains(e.target)) close(); });
  }

  /* ---------- Din / Raat theme ---------- */
  const isDark = () => root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const themeBtns = $$('[data-theme-toggle]');
  const syncThemeLabel = () => themeBtns.forEach(b => b.setAttribute('aria-label', isDark() ? 'Switch to day' : 'Switch to night'));
  syncThemeLabel();
  themeBtns.forEach(themeBtn => themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    const apply = () => { root.dataset.theme = next; store.set('fp-theme', next); try { localStorage.setItem('fp-theme', next); } catch (err) {} syncThemeLabel(); document.dispatchEvent(new CustomEvent('fp:theme')); };
    if (!document.startViewTransition || reduce) return apply();
    const r = themeBtn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const vt = document.startViewTransition(apply);
    vt.ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
        { duration: 750, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' });
    });
  }));

  /* ---------- drawers, search, menu ---------- */
  let lastFocus = null;
  const openDrawer = (name) => {
    const d = $(`[data-drawer="${name}"]`); if (!d) return;
    lastFocus = document.activeElement;
    d.classList.add('is-open'); d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $$(`[aria-controls="${d.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'true'));
    setTimeout(() => ($('input', d) || $('[data-close]', d))?.focus(), 80);
  };
  const closeDrawers = () => {
    $$('[data-drawer].is-open').forEach(d => { d.classList.remove('is-open'); d.setAttribute('aria-hidden', 'true'); $$(`[aria-controls="${d.id}"]`).forEach(b => b.setAttribute('aria-expanded', 'false')); });
    $('.filters.is-open')?.classList.remove('is-open');
    document.body.style.overflow = '';
    lastFocus?.focus?.();
  };
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { e.preventDefault(); openDrawer(o.dataset.open); return; }
    if (e.target.closest('[data-close]')) closeDrawers();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawers();
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); openDrawer('search'); }
  });

  /* search */
  const q = $('[data-q]'), results = $('[data-results]');
  let index = null;
  const loadIndex = async () => { if (index) return index; try { index = await (await fetch('assets/search.json')).json(); } catch (e) { index = []; } return index; };
  const runSearch = async (term) => {
    const idx = await loadIndex(); const t = term.trim().toLowerCase();
    if (!t) { results.innerHTML = ''; return; }
    const hits = idx.filter(p => [p.name, p.urdu, p.cat, p.colour, p.fabric].join(' ').toLowerCase().includes(t)).slice(0, 10);
    results.innerHTML = hits.length ? hits.map(p => `<a class="sr-item" href="p-${p.slug}.html"><img src="img/p-${p.slug}-sm.webp" alt="" loading="lazy"><b>${p.name}</b><span>${p.cat}, ${p.colour.toLowerCase()}</span><br><span>${p.from ? 'From ' : ''}${fmt(p.price)}</span></a>`).join('')
      : `<p class="sr-empty">Nothing matches "${term.replace(/[<>&"]/g, '')}". Try a colour, a fabric, or "bridal".</p>`;
  };
  q?.addEventListener('input', () => runSearch(q.value));
  $$('[data-chip]').forEach(c => c.addEventListener('click', () => { q.value = c.dataset.chip; runSearch(q.value); q.focus(); }));

  /* ---------- toast ---------- */
  let toastT;
  const toast = (msg) => {
    let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.innerHTML = `<svg class="i" viewBox="0 0 256 256" aria-hidden="true"><path fill="currentColor" d="M229.66 77.66l-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32z"/></svg><span></span>`;
    t.querySelector('span').textContent = msg;
    requestAnimationFrame(() => t.classList.add('is-on'));
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('is-on'), 2600);
  };

  /* ---------- bag ---------- */
  const FREE_UAE = 500;
  let bag = store.get('fp-bag', []);
  const bagCount = () => bag.reduce((n, i) => n + i.qty, 0);
  const bagTotal = () => bag.reduce((n, i) => n + i.qty * i.price, 0);
  const esc = (s) => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  function renderBag() {
    const n = bagCount();
    $$('[data-bag-count]').forEach(el => { el.textContent = n; el.hidden = !n; });
    const t = $('[data-bag-count-text]'); if (t) t.textContent = n ? `(${n})` : '';
    const list = $('[data-bag-items]'); if (!list) return;
    $('[data-bag-empty]').hidden = !!n; $('[data-bag-foot]').hidden = !n; $('[data-ship-bar]').hidden = !n;
    list.innerHTML = bag.map((i, k) => `
      <li class="bag-item">
        <a href="p-${i.slug}.html"><img src="img/p-${i.slug}-sm.webp" alt=""></a>
        <div><h3>${esc(i.name)}</h3><p>${esc(i.option)}</p>
          <div class="qty"><button type="button" data-q-dec="${k}" aria-label="One fewer"><svg class="i" viewBox="0 0 256 256"><path fill="currentColor" d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8z"/></svg></button><span>${i.qty}</span><button type="button" data-q-inc="${k}" aria-label="One more"><svg class="i" viewBox="0 0 256 256"><path fill="currentColor" d="M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8z"/></svg></button></div>
        </div>
        <div class="bag-item__right"><span>${fmt(i.price * i.qty)}</span><button type="button" class="bag-item__rm" data-q-rm="${k}">Remove</button></div>
      </li>`).join('');
    const sub = $('[data-bag-subtotal]'); sub.dataset.price = bagTotal(); sub.textContent = fmt(bagTotal());
    const left = FREE_UAE - bagTotal();
    $('[data-ship-text]').textContent = left > 0 ? `Add ${fmt(left)} more for free UAE delivery.` : 'Your UAE delivery is free.';
    $('[data-ship-meter]').style.transform = `scaleX(${Math.min(1, bagTotal() / FREE_UAE)})`;
  }
  const addToBag = (item) => {
    const same = bag.find(i => i.slug === item.slug && i.option === item.option);
    same ? (same.qty += item.qty) : bag.push(item);
    store.set('fp-bag', bag); renderBag();
  };
  document.addEventListener('click', e => {
    const inc = e.target.closest('[data-q-inc]'), dec = e.target.closest('[data-q-dec]'), rm = e.target.closest('[data-q-rm]');
    if (inc) bag[+inc.dataset.qInc].qty++;
    else if (dec) { const i = bag[+dec.dataset.qDec]; i.qty > 1 ? i.qty-- : bag.splice(+dec.dataset.qDec, 1); }
    else if (rm) bag.splice(+rm.dataset.qRm, 1);
    else return;
    store.set('fp-bag', bag); renderBag();
  });
  $('[data-checkout]')?.addEventListener('click', () => $('[data-modal="checkout"]').showModal());

  /* quick add from cards: unstitched goes in as fabric, the rest in size M (changeable on the product page) */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-quick-add]'); if (!b) return;
    e.preventDefault();
    const opt = b.dataset.cat === 'unstitched' ? 'Unstitched fabric' : 'Size M';
    addToBag({ slug: b.dataset.quickAdd, name: b.dataset.name, price: +b.dataset.priceAed, option: opt, qty: 1 });
    b.classList.add('is-done'); b.querySelector('span') && (b.querySelector('span').textContent = 'Added');
    setTimeout(() => { b.classList.remove('is-done'); b.querySelector('span') && (b.querySelector('span').textContent = 'Add to bag'); }, 1800);
    toast(`${b.dataset.name} is in your bag (${opt.toLowerCase()}).`);
  });

  /* ---------- saved pieces ---------- */
  let wish = new Set(store.get('fp-wish', []));
  const paintWish = () => {
    $$('[data-wish]').forEach(b => b.setAttribute('aria-pressed', wish.has(b.dataset.wish)));
    $$('[data-wish-count]').forEach(el => { el.textContent = wish.size; el.hidden = !wish.size; });
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-wish]'); if (!b) return;
    e.preventDefault();
    const s = b.dataset.wish; wish.has(s) ? wish.delete(s) : wish.add(s);
    store.set('fp-wish', [...wish]); paintWish();
    if (wish.has(s)) toast('Saved. Find it under the heart at the top.');
  });

  /* ---------- announcement ---------- */
  const ann = $$('[data-ann] p');
  if (ann.length > 1 && !reduce) { let a = 0; setInterval(() => { ann[a].classList.remove('is-on'); a = (a + 1) % ann.length; ann[a].classList.add('is-on'); }, 4200); }

  /* ---------- nav hover preview ---------- */
  const peek = $('[data-peek-panel]');
  if (peek && matchMedia('(hover: hover) and (min-width: 1024px)').matches) {
    let pt;
    const show = (slug) => { clearTimeout(pt); peek.hidden = false; $$('[data-peek-pane]', peek).forEach(p => p.classList.toggle('is-on', p.dataset.peekPane === slug)); };
    const hide = () => { pt = setTimeout(() => { peek.hidden = true; }, 180); };
    $$('[data-peek]').forEach(a => { a.addEventListener('mouseenter', () => show(a.dataset.peek)); a.addEventListener('mouseleave', hide); a.addEventListener('focus', () => show(a.dataset.peek)); });
    peek.addEventListener('mouseenter', () => clearTimeout(pt)); peek.addEventListener('mouseleave', hide);
    peek.addEventListener('focusout', e => { if (!peek.contains(e.relatedTarget)) hide(); });
  }

  /* ---------- split headings + reveals ---------- */
  $$('[data-split]').forEach(h => {
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
  });
  $$('[data-stagger]').forEach(g => [...g.children].forEach((c, i) => c.style.setProperty('--i', i)));
  // Two watchers: one just below the fold hides an element a moment before it arrives,
  // the other plays it in as it enters. Anything already on screen is never hidden.
  const revealables = $$('[data-rise], [data-split], [data-stagger], .stop').filter(el => !el.closest('.hero'));
  if (!reduce && 'IntersectionObserver' in window) {
    const show = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      requestAnimationFrame(() => requestAnimationFrame(() => en.target.classList.remove('pre')));
      show.unobserve(en.target); arm.unobserve(en.target);
    }), { rootMargin: '0px 0px -8% 0px' });
    const arm = new IntersectionObserver(es => es.forEach(en => {
      const r = en.boundingClientRect;
      if (en.isIntersecting && r.top > innerHeight * 0.92) en.target.classList.add('pre');
    }), { rootMargin: '0px 0px 30% 0px' });
    revealables.forEach(el => { arm.observe(el); show.observe(el); });
  }
  $$('.grid .card').forEach((c, i) => c.style.setProperty('--n', i % 8));

  /* ---------- card ripple: the fabric moves when the view swaps ---------- */
  const rippleAnim = $('#ripple animate');
  if (rippleAnim && !reduce && matchMedia('(hover: hover)').matches) {
    document.addEventListener('mouseover', e => {
      const m = e.target.closest('.card__media'); if (!m || m.contains(e.relatedTarget)) return;
      m.classList.add('is-ripple'); try { rippleAnim.beginElement(); } catch (err) {}
      setTimeout(() => m.classList.remove('is-ripple'), 720);
    });
  }

  /* ---------- rail: drag, buttons ---------- */
  $$('[data-rail]').forEach(r => {
    const t = $('[data-rail-track]', r);
    const step = () => (t.querySelector('.card')?.offsetWidth || 300) + 20;
    $('[data-rail-next]', r)?.addEventListener('click', () => t.scrollBy({ left: step(), behavior: reduce ? 'auto' : 'smooth' }));
    $('[data-rail-prev]', r)?.addEventListener('click', () => t.scrollBy({ left: -step(), behavior: reduce ? 'auto' : 'smooth' }));
    let down = false, x0 = 0, s0 = 0, moved = 0;
    t.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; down = true; moved = 0; x0 = e.clientX; s0 = t.scrollLeft; });
    addEventListener('pointermove', e => { if (!down) return; moved = Math.abs(e.clientX - x0); if (moved > 6) t.classList.add('is-drag'); t.scrollLeft = s0 - (e.clientX - x0); });
    addEventListener('pointerup', () => { if (!down) return; down = false; setTimeout(() => t.classList.remove('is-drag'), 0); });
    t.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  });

  /* ---------- arches: hover or focus opens one ---------- */
  const arches = $$('[data-arch]');
  arches.forEach(a => {
    const open = () => arches.forEach(b => b.classList.toggle('is-open', b === a));
    a.addEventListener('mouseenter', open); a.addEventListener('focus', open);
  });

  /* ---------- compare: drag the needle ---------- */
  $$('[data-compare]').forEach(c => {
    const r = $('[data-compare-range]', c);
    const set = v => c.style.setProperty('--pos', v + '%');
    r.addEventListener('input', () => set(r.value));
    if (!reduce) {
      const nudge = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return; nudge.disconnect();
        let t0; const run = (t) => { t0 ??= t; const k = Math.min(1, (t - t0) / 1600); const v = 50 + Math.sin(k * Math.PI * 2) * 18 * (1 - k); set(v); r.value = v; if (k < 1) requestAnimationFrame(run); };
        requestAnimationFrame(run);
      }, { threshold: .6 });
      nudge.observe(c);
    }
  });

  /* ---------- join form ---------- */
  $$('[data-join]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const email = f.email.value.trim(), msg = $('[data-join-msg]', f);
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    msg.classList.toggle('is-err', !ok);
    msg.textContent = ok ? "You're on the list. We'll write when the next pieces land." : 'That email looks wrong. Check it and try again.';
    if (ok) f.reset();
  }));

  /* ---------- GSAP: header, parallax, thread ---------- */
  const withGsap = () => {
    if (!window.gsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    const hdr = $('[data-hdr]');
    ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: self => {
        const y = self.scroll();
        hdr.classList.toggle('is-stuck', y > 10);
        if (!document.querySelector('[data-drawer].is-open')) hdr.classList.toggle('is-hidden', self.direction === 1 && y > 420);
        if (self.direction === -1) hdr.classList.remove('is-hidden');
      },
    });
    if (reduce) return;
    $$('[data-parallax]').forEach(el => {
      const img = el.tagName === 'IMG' ? el : $('img', el);
      gsap.fromTo(img, { yPercent: -4, scale: 1.08 }, { yPercent: 4, scale: 1.02, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
    const thread = $('[data-thread]');
    if (thread && matchMedia('(min-width: 768px)').matches) {
      const reveal = $('.thread__reveal', thread);
      gsap.fromTo(reveal, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, ease: 'none', scrollTrigger: { trigger: $('.thread__stage', thread), start: 'top 75%', end: 'bottom 55%', scrub: .6 } });
    }
  };
  if (document.readyState === 'complete') withGsap(); else addEventListener('load', withGsap);

  /* ---------- collection page: filter, sort, density ---------- */
  const shop = $('[data-shop]');
  if (shop) {
    const grid = $('[data-shop-grid]', shop), cards = $$('[data-card]', grid), count = $('[data-count]');
    const form = $('[data-filters]'); const empty = $('[data-empty]');
    const priceIn = $('[data-price-max]'); const priceOut = $('[data-price-out]');
    const apply = () => {
      const fd = new FormData(form);
      const fab = fd.getAll('fabric'), pcs = fd.getAll('pieces'), col = fd.getAll('colour'), cat = fd.getAll('cat');
      const max = priceIn ? +priceIn.value : Infinity;
      const saved = location.hash === '#saved';
      let shown = 0;
      cards.forEach(c => {
        const ok = (!fab.length || fab.includes(c.dataset.fabric)) && (!pcs.length || pcs.includes(c.dataset.pieces)) &&
          (!col.length || col.includes(c.dataset.colour)) && (!cat.length || cat.includes(c.dataset.cat)) &&
          (+c.dataset.priceAed <= max) && (!saved || wish.has(c.dataset.slug));
        c.classList.toggle('is-out', !ok); if (ok) shown++;
      });
      count.textContent = `${shown} ${shown === 1 ? 'piece' : 'pieces'}`;
      empty.hidden = !!shown;
      if (priceOut) priceOut.textContent = fmt(max);
    };
    form.addEventListener('input', apply);
    $('[data-clear]')?.addEventListener('click', () => { form.reset(); if (location.hash) history.replaceState(null, '', location.pathname); apply(); });
    $$('[data-clear-empty]').forEach(b => b.addEventListener('click', () => { form.reset(); if (location.hash) history.replaceState(null, '', location.pathname); apply(); }));
    $('[data-sort]')?.addEventListener('change', e => {
      const v = e.target.value, sorted = [...cards];
      if (v === 'low') sorted.sort((a, b) => a.dataset.priceAed - b.dataset.priceAed);
      if (v === 'high') sorted.sort((a, b) => b.dataset.priceAed - a.dataset.priceAed);
      if (v === 'new') sorted.sort((a, b) => (b.dataset.tags.includes('new')) - (a.dataset.tags.includes('new')));
      if (v === 'az') sorted.sort((a, b) => a.dataset.slug.localeCompare(b.dataset.slug));
      sorted.forEach((c, i) => { c.style.setProperty('--n', i % 8); grid.append(c); });
    });
    $$('[data-density]').forEach(b => b.addEventListener('click', () => {
      $$('[data-density]').forEach(x => x.classList.toggle('is-on', x === b));
      grid.className = 'grid grid--' + b.dataset.density; store.set('fp-density', b.dataset.density);
    }));
    const d = store.get('fp-density', null); if (d) $(`[data-density="${d}"]`)?.click();
    $('[data-toggle-filters]')?.addEventListener('click', () => {
      if (matchMedia('(max-width: 1023px)').matches) { $('.filters').classList.add('is-open'); document.body.style.overflow = 'hidden'; }
      else shop.classList.toggle('no-side');
    });
    addEventListener('hashchange', apply);
    apply();
  }

  /* ---------- product page ---------- */
  const pdp = $('[data-pdp]');
  if (pdp) {
    const base = +pdp.dataset.base, priceEl = $('[data-pdp-price]'), bnpl = $('[data-bnpl]');
    const ways = $$('input[name="way"]', pdp), sizeBox = $('[data-size-box]'), measureBox = $('[data-measure-box]');
    const qtyEl = $('[data-pdp-qty]'); let qty = 1;
    const extra = () => +(ways.find(w => w.checked)?.dataset.extra || 0);
    const paint = () => {
      const w = ways.find(x => x.checked)?.value;
      if (sizeBox) sizeBox.hidden = !(w === 'standard' || w === 'rtw');
      if (measureBox) measureBox.hidden = w !== 'measured';
      const total = base + extra();
      priceEl.dataset.price = total; priceEl.textContent = fmt(total);
      if (bnpl) { bnpl.dataset.price = (total / 4).toFixed(2); bnpl.textContent = fmt(total / 4); }
      $$('[data-sticky-price]').forEach(el => { el.dataset.price = total; el.textContent = fmt(total); });
    };
    ways.forEach(w => w.addEventListener('change', paint));
    $('[data-pdp-inc]')?.addEventListener('click', () => { qty = Math.min(9, qty + 1); qtyEl.textContent = qty; });
    $('[data-pdp-dec]')?.addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; });
    const add = () => {
      const w = ways.find(x => x.checked);
      const size = $('input[name="size"]:checked', pdp);
      if (w && (w.value === 'standard' || w.value === 'rtw') && !size) {
        $('[data-size-err]').textContent = 'Pick a size first.'; $('.sizes', pdp).scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); return;
      }
      if (w && w.value === 'measured') {
        const missing = $$('[data-measure-box] input[required]', pdp).filter(i => !i.value);
        if (missing.length) { $('[data-measure-err]').textContent = 'Add the missing measurements, in inches.'; missing[0].focus(); return; }
      }
      $('[data-size-err]') && ($('[data-size-err]').textContent = '');
      $('[data-measure-err]') && ($('[data-measure-err]').textContent = '');
      const opt = !w ? 'One size' : w.value === 'fabric' ? 'Unstitched fabric' : w.value === 'measured' ? 'Stitched to your measurements' : w.value === 'standard' ? `Stitched, size ${size.value}` : `Size ${size.value}`;
      addToBag({ slug: pdp.dataset.slug, name: pdp.dataset.name, price: base + extra(), option: opt, qty });
      toast(`${pdp.dataset.name} is in your bag.`);
      setTimeout(() => openDrawer('bag'), 500);
    };
    $$('[data-add]').forEach(b => b.addEventListener('click', add));
    $$('input[name="size"]', pdp).forEach(s => s.addEventListener('change', () => { $('[data-size-err]').textContent = ''; }));
    const eta = $('[data-eta]'), etaOut = $('[data-eta-out]');
    eta?.addEventListener('change', () => { etaOut.textContent = eta.value; });
    paint();

    /* sticky buy bar on phones once the main button scrolls away */
    const sb = $('[data-sticky-buy]'), mainBtn = $('.buy [data-add]', pdp);
    if (sb && mainBtn) new IntersectionObserver(([en]) => sb.classList.toggle('is-on', !en.isIntersecting && en.boundingClientRect.top < 0)).observe(mainBtn);

    /* lightbox with pan */
    $$('[data-zoom]').forEach(b => b.addEventListener('click', () => {
      const lb = document.createElement('div'); lb.className = 'lightbox'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Zoomed image');
      lb.innerHTML = `<button class="icon-btn lightbox__x" type="button" aria-label="Close zoom"><svg class="i" viewBox="0 0 256 256"><path fill="currentColor" d="M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128z"/></svg></button><img src="${b.dataset.zoom}" alt="">`;
      document.body.append(lb); document.body.style.overflow = 'hidden';
      const img = $('img', lb);
      const pan = (e) => { const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5; img.style.transform = `translate(${-x * 40}%, ${-y * 40}%)`; };
      lb.addEventListener('pointermove', pan);
      const close = () => { lb.remove(); document.body.style.overflow = ''; b.focus(); };
      lb.addEventListener('click', close); addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); removeEventListener('keydown', k); } });
      $('.lightbox__x', lb).focus();
    }));
  }

  /* ---------- bridal booking form (prototype: validates, does not send) ---------- */
  const book = $('[data-book]');
  if (book) book.addEventListener('submit', e => {
    e.preventDefault();
    let ok = true;
    $$('[required]', book).forEach(f => {
      const err = f.closest('.field')?.querySelector('.field__err');
      const bad = !f.value.trim() || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.value));
      if (err) err.textContent = bad ? (f.dataset.err || 'Please fill this in.') : '';
      f.setAttribute('aria-invalid', bad); if (bad && ok) { f.focus(); ok = false; }
    });
    if (!ok) return;
    book.innerHTML = `<div class="form__done" role="status"><h3>Thank you. We'll message you within a day.</h3><p>We'll confirm a time on WhatsApp. This prototype doesn't send the form, so nothing has gone out yet.</p></div>`;
  });

  paintPrices(); renderBag(); paintWish();
})();
