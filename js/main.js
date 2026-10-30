// Velora — loader, scroll-driven hero animation and product switcher.
(() => {
  const root = document.documentElement;
  const DESIGN_W = 1440;
  const DESIGN_H = 812;

  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const easeInOut = (t) => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  // ---------------------------------------------------------------- Canvas zoom
  // The hero is a 1440 × 812 canvas; in a window narrower or shorter than that it is
  // scaled down as a whole, so the product block never gets cut off at the bottom.
  let zoom = 1;
  function updateZoom() {
    zoom = Math.min(1, window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
    root.style.setProperty('--zoom', zoom);
    // Canvas px the viewport extends past the canvas (sides on wide screens, bottom on tall ones)
    root.style.setProperty('--bleed', `${Math.max(0, (window.innerWidth / zoom - DESIGN_W) / 2)}px`);
    root.style.setProperty('--extra', `${Math.max(0, window.innerHeight / zoom - DESIGN_H)}px`);
    root.style.setProperty('--loader-zoom', Math.min(1, window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
  }
  updateZoom();

  // ---------------------------------------------------------------- Hero scroll
  // Scroll distance (design px) for home-1 → home-2, then a short hold on home-2.
  const TRACK_MORPH = 900;
  const TRACK_HOLD = 160;

  const hero = document.getElementById('hero');
  hero.classList.add('hero--animated');
  root.style.setProperty('--track', `${TRACK_MORPH + TRACK_HOLD}px`);

  // Product icons fly from their home-1 spots into the switcher (home-2): 52px tiles with a
  // 24px glyph, 132px from the top. They land at 90% of the morph and hand over to the
  // switcher's own tiles once it is settled.
  const SLOT = { y: 132, s: 52, g: 24 };
  const flies = [...document.querySelectorAll('.fly')].map((el) => {
    const v = (name) => parseFloat(el.style.getPropertyValue(name));
    return { el, x: v('--x'), y: v('--y'), s: v('--s'), g: v('--g'), bx: parseFloat(el.dataset.bx) };
  });
  // They rise faster than they gather in (ease-out on y, ease-in-out on x), so they pass
  // above the opening dashboard instead of across it.
  function moveFlies(p) {
    const t = clamp(p / .9);
    const ex = easeInOut(t);
    const ey = 1 - Math.pow(1 - t, 2.4);
    const lerp = (a, b, e) => (a + (b - a) * e).toFixed(2);
    flies.forEach((f) => {
      f.el.style.setProperty('--x', lerp(f.x, f.bx, ex));
      f.el.style.setProperty('--y', lerp(f.y, SLOT.y, ey));
      f.el.style.setProperty('--s', lerp(f.s, SLOT.s, ex));
      f.el.style.setProperty('--g', lerp(f.g, SLOT.g, ex));
    });
  }

  const products = [...document.querySelectorAll('.sw')];
  function activate(btn) {
    products.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  let ticking = false;
  function render() {
    ticking = false;
    const scrolled = -hero.getBoundingClientRect().top / zoom;
    const p = easeInOut(clamp(scrolled / TRACK_MORPH));
    root.style.setProperty('--p', p.toFixed(4));
    moveFlies(p);
    hero.classList.toggle('is-open', p > .97);   // dashboard fully open: show the bookkeeping column
    const settled = p > .999;
    // The icons fly to the Fundraising layout, so the switcher starts from it again
    if (!settled && hero.classList.contains('is-tabs')) activate(products[0]);
    hero.classList.toggle('is-tabs', settled);
  }
  function requestRender() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(render);
    }
  }
  window.addEventListener('scroll', requestRender, { passive: true });
  window.addEventListener('resize', () => { updateZoom(); requestRender(); });
  render();

  // ---------------------------------------------------------------- Product switcher
  // Once settled on home-2 the active product moves on every 6s (paused while hovered);
  // a click picks one and restarts the count.
  const switcher = document.querySelector('.switcher');
  const CYCLE = 6000;
  let cycle = null;
  function restartCycle() {
    clearInterval(cycle);
    cycle = setInterval(() => {
      if (!hero.classList.contains('is-tabs') || switcher.matches(':hover')) return;
      const i = products.findIndex((b) => b.classList.contains('is-active'));
      activate(products[(i + 1) % products.length]);
    }, CYCLE);
  }
  products.forEach((btn) => btn.addEventListener('click', () => { activate(btn); restartCycle(); }));
  restartCycle();

  // ---------------------------------------------------------------- Reveal on scroll
  if (root.classList.contains('reveal')) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -5% 0px' });
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------- Loader
  if (!root.classList.contains('is-loading')) return;

  const loader = document.getElementById('loader');
  const ring = document.getElementById('loader-ring');
  const pct = document.getElementById('loader-pct');
  const markBox = document.getElementById('loader-mark');
  const words = [...loader.querySelectorAll('.loader__word')];
  const DURATION = 2400;

  window.scrollTo(0, 0);

  // Inline the mark so each stroke can light up on its own (R → C → L).
  let marks = null;
  fetch(markBox.querySelector('img').src)
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((svg) => {
      markBox.innerHTML = svg;
      marks = ['Mark R', 'Mark C', 'Mark L'].map((id) => markBox.querySelector(`[id="${id}"]`));
    })
    .catch(() => {});

  let loaded = document.readyState === 'complete';
  window.addEventListener('load', () => { loaded = true; });
  setTimeout(() => { loaded = true; }, 8000);

  let start = null;
  let shown = 0;
  function frame(now) {
    if (start === null) start = now;
    const raw = (now - start) / DURATION;
    const cap = loaded ? 1 : .9;
    shown = Math.max(shown, Math.min(easeInOut(clamp(raw)), cap));
    if (loaded && raw >= 1) shown = Math.min(1, shown + .02);

    ring.style.setProperty('--deg', `${shown * 360}deg`);
    pct.textContent = `${Math.round(shown * 100)}%`;
    words.forEach((w) => w.classList.toggle('is-lit', shown >= Number(w.dataset.at)));
    if (marks) {
      const fill = [clamp(shown / .25), clamp((shown - .25) / .17), clamp((shown - .42) / .5)];
      marks.forEach((m, i) => { if (m) m.style.opacity = .2 + .8 * fill[i]; });
    }

    if (shown < 1) {
      requestAnimationFrame(frame);
    } else {
      setTimeout(() => {
        loader.classList.add('is-leaving');
        root.classList.remove('is-loading');
        root.classList.add('is-ready'); // hero assembles while the loader fades out
      }, 250);
    }
  }
  requestAnimationFrame(frame);
})();
