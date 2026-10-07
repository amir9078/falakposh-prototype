/* The Falakposh logo in motion.
   - First visit of a session, on the home page: the name writes itself on a night curtain, then the curtain
     lifts. Any click, key, scroll or touch skips it. Later visits go straight to the page.
   - The header logo's star twinkles now and then, and once on hover.
   - Logos marked data-write play their writing when they scroll into view; [data-replay] buttons replay them.
   Reduced motion: nothing moves; the logo is simply there. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const write = (svg) => {
    if (!svg || reduce) return;
    svg.classList.remove('is-writing');
    void svg.getBBox();                 // restart the CSS animations
    svg.classList.add('is-writing');
  };

  // intro curtain
  const intro = document.querySelector('[data-intro]');
  if (intro && root.classList.contains('intro-on')) {
    const logo = intro.querySelector('.fp-logo');
    write(logo);
    let closed = false;
    const close = () => {
      if (closed) return; closed = true;
      intro.classList.add('is-done');
      try { sessionStorage.setItem('fp-intro', '1'); } catch (e) {}
      setTimeout(() => { root.classList.remove('intro-on'); intro.remove(); }, 1050);
    };
    setTimeout(close, 4300);
    ['click', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, close, { once: true, passive: true }));
  } else if (intro) {
    intro.remove();
  }

  // header: a slow twinkle
  if (!reduce) document.querySelectorAll('.hdr .fp-logo').forEach((s) => s.classList.add('is-live'));

  // logos that write themselves when they come into view
  const io = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting) return;
    write(en.target.querySelector('.fp-logo') || en.target);
    io.unobserve(en.target);
  }), { threshold: 0.45 }) : null;
  document.querySelectorAll('[data-write]').forEach((el) => io && io.observe(el));

  // replay buttons
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-replay]');
    if (!b) return;
    const target = document.querySelector(b.dataset.replay);
    write(target && (target.querySelector('.fp-logo') || target));
  });
  // twinkle on demand (for touch screens, where there is no hover)
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-twinkle]');
    if (!s || reduce) return;
    const svg = s.querySelector('.fp-logo');
    svg.classList.remove('is-twinkle'); void svg.getBBox(); svg.classList.add('is-twinkle');
  });
})();
