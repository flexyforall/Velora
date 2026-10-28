// Velora — loader, scroll-driven hero animation and product tabs.
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
  // Scroll distance (design px) for home-1 → home-2, then home-2 → home-3 (product settles 63.5px higher).
  const TRACK_MORPH = 900;
  const TRACK_SETTLE = 160;

  const hero = document.getElementById('hero');
  hero.classList.add('hero--animated');
  root.style.setProperty('--track', `${TRACK_MORPH + TRACK_SETTLE}px`);

  // Floating tags (home-1) head for the dashboard during the first half of the morph,
  // shrink a little and slip behind the white card, turning transparent along the way.
  const floating = [...document.querySelectorAll('.ftag')].map((el) => {
    const ax = parseFloat(el.style.getPropertyValue('--ax'));
    const ay = parseFloat(el.style.getPropertyValue('--ay'));
    const aw = parseFloat(el.style.getPropertyValue('--aw'));
    return { el, cx: ax - 7 + aw / 2, cy: ay - 7 + 23 };
  });
  function moveFloating(p) {
    const t = clamp(p / .5);
    const e = easeInOut(t);
    const sx = 720 + .5 * p;            // centre of the white card at this point of the morph
    const sy = 878.5 - 446.5 * p;
    floating.forEach(({ el, cx, cy }) => {
      const tx = sx + (cx - 720) * .3;
      const ty = sy + (cy - 650) * .3;
      el.style.setProperty('--fx', `${((tx - cx) * e).toFixed(2)}px`);
      el.style.setProperty('--fy', `${((ty - cy) * e).toFixed(2)}px`);
      el.style.setProperty('--fs', (1 - .2 * e).toFixed(4));
      el.style.setProperty('--fo', (1 - clamp((t - .15) / .75)).toFixed(4));
    });
  }

  let ticking = false;
  function render() {
    ticking = false;
    const scrolled = -hero.getBoundingClientRect().top / zoom;
    const p = easeInOut(clamp(scrolled / TRACK_MORPH));
    const q = clamp((scrolled - TRACK_MORPH) / TRACK_SETTLE);
    root.style.setProperty('--p', p.toFixed(4));
    root.style.setProperty('--q', q.toFixed(4));
    moveFloating(p);
    hero.classList.toggle('is-open', p > .97);   // dashboard fully open: show the bookkeeping column
    hero.classList.toggle('is-tabs', p > .999);
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

  // ---------------------------------------------------------------- Product tabs
  // Once the tab row has appeared (home-2), the active tab cycles.
  const tabs = [...document.querySelectorAll('.tab')];
  function activate(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
    });
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab));
    tab.querySelector('.tab__bar').addEventListener('animationend', () => {
      activate(tabs[(i + 1) % tabs.length]);
    });
  });

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
