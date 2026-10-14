// FAQ: items that have an answer toggle open/closed; only one stays open at a time.
const faqItems = document.querySelectorAll('.faq-item.has-answer');

faqItems.forEach((item) => {
  item.addEventListener('click', () => {
    const willOpen = !item.classList.contains('is-open');

    faqItems.forEach((other) => {
      other.classList.remove('is-open');
      other.querySelector('.faq-item__q').setAttribute('aria-expanded', 'false');
    });

    if (willOpen) {
      item.classList.add('is-open');
      item.querySelector('.faq-item__q').setAttribute('aria-expanded', 'true');
    }
  });
});

// Agents: the side tabs switch the slide shown in the white panel.
const agentTabs = [...document.querySelectorAll('.agents__tabs [role="tab"]')];

const selectAgent = (index, { focus = false } = {}) => {
  agentTabs.forEach((tab, i) => {
    const isActive = i === index;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).classList.toggle('is-active', isActive);
  });
  if (focus) agentTabs[index].focus();
};

agentTabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectAgent(i));
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step) {
      event.preventDefault();
      selectAgent((i + step + agentTabs.length) % agentTabs.length, { focus: true });
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      selectAgent(event.key === 'Home' ? 0 : agentTabs.length - 1, { focus: true });
    }
  });
});

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// About: as the text scrolls up the screen its muted words darken one by one (Figma «about»,
// 1450:2727); under the key phrase the underline grows together with the words being filled.
const aboutText = document.querySelector('.about__text');

if (aboutText) {
  const muted = aboutText.querySelector('.about__muted');
  const underline = aboutText.querySelector('.about__underline');

  // Wrap every word of the muted part in a span, keeping the spaces as they are.
  const walker = document.createTreeWalker(muted, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const parts = node.textContent.split(/(\s+)/);
    const fragment = document.createDocumentFragment();
    parts.forEach((part) => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
      } else {
        const word = document.createElement('span');
        word.textContent = part;
        fragment.append(word);
      }
    });
    node.replaceWith(fragment);
  });
  const words = [...muted.querySelectorAll('span:not(.about__underline)')];
  const phraseWords = [...underline.querySelectorAll('span')];
  const firstPhraseWord = words.indexOf(phraseWords[0]);

  // The underline is one background running through the phrase's line fragments laid end to end.
  // For each phrase word store where its stretch of that strip starts and ends (the stretch
  // includes the space before it), so the line can follow the word being filled.
  let stretches = [];
  const measure = () => {
    const lines = [...underline.getClientRects()];
    const lineStart = [];
    let length = 0;
    lines.forEach((rect, i) => {
      lineStart[i] = length;
      length += rect.width;
    });
    const along = (rect) => {
      const middle = rect.top + rect.height / 2;
      const i = Math.max(0, lines.findIndex((line) => middle >= line.top && middle <= line.bottom));
      return lineStart[i] + rect.right - lines[i].left;
    };
    let previousEnd = 0;
    stretches = phraseWords.map((word) => {
      const end = along(word.getBoundingClientRect());
      const stretch = [previousEnd, end];
      previousEnd = end;
      return stretch;
    });
  };

  const shown = new Array(words.length).fill(-1);
  let progress = 0;

  const render = () => {
    const filled = progress * words.length; // how many words are dark, fractional
    words.forEach((word, i) => {
      const t = Math.round(Math.min(1, Math.max(0, filled - i)) * 100) / 100;
      if (t !== shown[i]) {
        shown[i] = t;
        word.style.color = `rgba(17, 17, 17, ${0.5 + 0.5 * t})`;
      }
    });

    const inPhrase = filled - firstPhraseWord;
    let length = 0;
    if (inPhrase >= stretches.length) {
      length = stretches[stretches.length - 1]?.[1] ?? 0;
    } else if (inPhrase > 0) {
      const [from, to] = stretches[Math.floor(inPhrase)];
      length = from + (to - from) * (inPhrase % 1);
    }
    underline.style.setProperty('--underline', `${length}px`);
  };

  const remeasure = () => {
    measure();
    render();
  };
  document.fonts.ready.then(remeasure);
  window.addEventListener('resize', remeasure);

  if (reduceMotion) {
    progress = 1;
    remeasure();
  } else {
    // Starts when the text's top reaches 80% of the screen height, ends at 30%.
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      const top = aboutText.getBoundingClientRect().top;
      progress = Math.min(1, Math.max(0, (vh * 0.8 - top) / (vh * 0.5)));
      render();
    };
    const requestUpdate = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    remeasure();
    update();
  }
}

// Load progress shown by the loader: 0..1 per resource. The video entry is reset to 0 only when
// the scrub actually loads it.
const loadProgress = { fonts: 0, poster: 0, video: 1 };

// Reads a response body chunk by chunk to report download progress (0..1).
const fetchBlob = async (url, onProgress) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const total = Number(response.headers.get('Content-Length'));
  if (!response.body || !total) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(received / total);
  }
  return new Blob(chunks, { type: response.headers.get('Content-Type') || 'video/mp4' });
};

// Hero scroll scrub: the hero is pinned and scroll position drives the video's currentTime.
// The last frame of the video is the Agents section, so once the scrub ends the real section
// fades in on top of it at the same spot.
const intro = document.querySelector('.intro');
const hero = intro?.querySelector('.hero');
const video = hero?.querySelector('.hero__video');

// Share of the scroll distance that fades out the hero copy, and the share after which
// the video holds its final frame before the handoff.
const OVERLAY_FADE_END = 0.1;
const VIDEO_END = 0.92;
const FRAME_WIDTH = 1440;

// Scroll progress → video time in seconds (null: the last frame). The office shot gets a longer
// stretch of scroll, so «One outcome. Many agents.» (Figma «second», 1057:21749) can be read over it
// while the progress is inside CHAPTER.
const TIME_KEYS = [[0, 0], [0.4, 5.3], [0.48, 6.2], [0.72, 7.3], [VIDEO_END, null]];
const CHAPTER = [0.47, 0.73];

// Browsers without H.264 (some Linux Chromium builds) keep the static hero.
const canPlayVideo = video?.canPlayType('video/mp4; codecs="avc1.640033"') !== '';

if (video && canPlayVideo && !reduceMotion) {
  let targetTime = 0;
  let ticking = false;
  const ticks = [...hero.querySelectorAll('.hero__ticks span')];
  let currentTick = -1;

  const timeAt = (progress, duration) => {
    const end = duration - 0.02; // just short of the end, so the final frame stays on screen
    const keys = TIME_KEYS.map(([at, time]) => [at, Math.min(time ?? end, end)]);
    if (progress >= keys[keys.length - 1][0]) return end;
    let i = 0;
    while (progress > keys[i + 1][0]) i += 1;
    const [fromAt, fromTime] = keys[i];
    const [toAt, toTime] = keys[i + 1];
    return fromTime + ((toTime - fromTime) * (progress - fromAt)) / (toAt - fromAt);
  };

  const setTick = (index) => {
    if (index === currentTick) return;
    currentTick = index;
    ticks.forEach((tick, i) => {
      tick.classList.toggle('is-current', i === index);
      tick.classList.toggle('is-near', Math.abs(i - index) === 1);
      tick.classList.toggle('is-next', i === index + 2);
      tick.classList.toggle('is-ahead', i > index + 2);
    });
  };

  const seek = () => {
    if (!video.duration || video.seeking) return;
    if (Math.abs(video.currentTime - targetTime) > 0.01) video.currentTime = targetTime;
  };

  const update = () => {
    ticking = false;
    const distance = intro.offsetHeight - hero.offsetHeight;
    const scrolled = Math.min(Math.max(-intro.getBoundingClientRect().top, 0), distance);
    const progress = distance > 0 ? scrolled / distance : 0;

    // Wider than the 1440 frame: cover the screen, then settle to the exact layout while the
    // final frame is held, so it lines up with the Agents section underneath.
    const coverScale = Math.max(1, hero.clientWidth / FRAME_WIDTH);
    const settle = Math.min(1, Math.max(0, (progress - VIDEO_END) / (1 - VIDEO_END)));
    hero.style.setProperty('--video-scale', String(coverScale + (1 - coverScale) * settle));

    hero.style.setProperty('--overlay', String(Math.max(0, 1 - progress / OVERLAY_FADE_END)));
    hero.classList.toggle('is-overlay-hidden', progress >= OVERLAY_FADE_END);
    hero.classList.toggle('is-chapter', progress >= CHAPTER[0] && progress < CHAPTER[1]);
    hero.classList.toggle('is-ticks', progress >= OVERLAY_FADE_END && progress < VIDEO_END);
    setTick(Math.round(Math.min(1, progress / VIDEO_END) * (ticks.length - 1)));
    const isDone = distance > 0 && scrolled >= distance - 0.5;
    // The video ends on the Gaia slide, so scrolling back into it brings the tabs back to Gaia.
    if (!isDone && intro.classList.contains('is-done')) selectAgent(0);
    intro.classList.toggle('is-done', isDone);

    if (video.duration) {
      targetTime = timeAt(progress, video.duration);
      seek();
    }
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  // Without the video there is nothing to scrub: fall back to the static hero.
  const disableScrub = () => {
    intro.classList.remove('is-scrub', 'is-done');
    hero.classList.remove('is-chapter', 'is-ticks');
    window.removeEventListener('scroll', requestUpdate);
    window.removeEventListener('resize', requestUpdate);
    video.remove();
  };

  video.addEventListener('loadedmetadata', update);
  video.addEventListener('seeked', seek);
  video.addEventListener('loadeddata', () => {
    hero.classList.add('is-video-ready');
    loadProgress.video = 1;
  });
  video.addEventListener('error', () => {
    loadProgress.video = 1;
    disableScrub();
  });

  // iOS Safari only decodes frames after a play() call made from a user gesture.
  window.addEventListener('touchstart', () => {
    video.play().then(() => video.pause()).catch(() => {});
  }, { once: true, passive: true });

  intro.classList.add('is-scrub');

  // Load the whole file into a Blob: a blob: URL is seekable to any frame even when the
  // host doesn't support HTTP range requests.
  loadProgress.video = 0;
  fetchBlob(video.dataset.src, (share) => { loadProgress.video = share * 0.95; })
    .then((blob) => { video.src = URL.createObjectURL(blob); })
    .catch(() => {
      loadProgress.video = 1;
      disableScrub();
    });

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  update();
}

// Compact header: appears once the hero menu is gone (faded out by the scrub, or scrolled past),
// and turns white while a dark banner (data-header="light") is behind the middle of the bar.
const siteHeader = document.querySelector('.site-header');

if (siteHeader) {
  const bar = siteHeader.querySelector('.site-header__menu');
  let ticking = false;

  const update = () => {
    ticking = false;
    const isScrub = intro?.classList.contains('is-scrub');
    const threshold = isScrub
      ? intro.offsetTop + (intro.offsetHeight - hero.offsetHeight) * OVERLAY_FADE_END
      : 70;
    siteHeader.classList.toggle('is-visible', window.scrollY > threshold);

    const rect = bar.getBoundingClientRect();
    const behind = document.elementsFromPoint(window.innerWidth / 2, rect.top + rect.height / 2)
      .find((el) => !siteHeader.contains(el));
    siteHeader.classList.toggle('is-light', Boolean(behind?.closest('[data-header="light"]')));
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  update();
}

// Loader (Figma «Loader»): the first video frame grows with the load progress inside corner
// brackets, then expands into the hero. Sizes come from the 1440×810 frames: 193×109 at 63%,
// 621×351 at 100%, then 1317×745 before filling the hero.
const loader = document.querySelector('.loader');

if (loader && document.documentElement.classList.contains('is-loading')) {
  const image = loader.querySelector('.loader__image');
  const frame = loader.querySelector('.loader__frame');
  const value = loader.querySelector('.loader__value');
  const fill = loader.querySelector('.loader__fill');
  const poster = document.querySelector('.hero__poster');

  const WEIGHTS = { fonts: 0.15, poster: 0.25, video: 0.6 };
  const MIN_DURATION = 1400; // ms; keeps the count readable when everything is cached
  const MAX_WAIT = 6000; // ms; after this the site opens and the video keeps loading behind it

  window.scrollTo(0, 0);
  document.fonts.ready.then(() => { loadProgress.fonts = 1; });
  if (poster.complete) loadProgress.poster = 1;
  else ['load', 'error'].forEach((type) => poster.addEventListener(type, () => { loadProgress.poster = 1; }));

  const viewport = () => {
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    return { width, height, scale: Math.min(1, width / 1440, height / 810) };
  };

  // Image rect while loading: grows exponentially so 63% gives 193px and 100% gives 621px.
  const loadingRect = (percent, vp) => {
    const w = 621 * vp.scale * (193 / 621) ** ((100 - percent) / 37);
    const h = (w * 351) / 621;
    const late = Math.min(1, Math.max(0, (percent - 63) / 37));
    return {
      x: (vp.width - w) / 2, y: (vp.height - h) / 2 - 0.5, w, h,
      radius: 60 * vp.scale, padX: 7 - 6 * late, padY: 6,
    };
  };

  const setRect = (r) => {
    Object.assign(image.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, borderRadius: `${r.radius}px` });
    Object.assign(frame.style, {
      left: `${r.x - r.padX / 2}px`, top: `${r.y - r.padY / 2}px`, width: `${r.w + r.padX}px`, height: `${r.h + r.padY}px`,
    });
  };

  // Quadratic in-out: a short ease at the end, so the image doesn't crawl into the last pixels.
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  // One eased motion through several rects: `stops` are the eased progress values at which each
  // rect is reached, so intermediate rects are passed through without slowing down.
  const tween = (rects, stops, duration, onFrame) => new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOut(t);
      let i = 0;
      while (i < rects.length - 2 && e > stops[i + 1]) i += 1;
      const local = (e - stops[i]) / (stops[i + 1] - stops[i]);
      const rect = {};
      Object.keys(rects[0]).forEach((key) => { rect[key] = lerp(rects[i][key], rects[i + 1][key], local); });
      setRect(rect);
      onFrame?.(e);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });

  const reveal = async () => {
    const vp = viewport();
    const ui = [loader.querySelector('.loader__line'), loader.querySelector('.loader__progress')];
    ui.forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));

    // Nearly full screen with the brackets near the edges, as in the third Figma frame.
    const w = Math.min(vp.width - 123, ((vp.height - 65) * 1317) / 745);
    const h = (w * 745) / 1317;
    const wide = { x: (vp.width - w) / 2, y: (vp.height - h) / 2 - 0.5, w, h, radius: 20, padX: 19, padY: 22 };
    const heroRect = hero.getBoundingClientRect();
    const full = { x: heroRect.left, y: heroRect.top, w: heroRect.width, h: heroRect.height, radius: 0, padX: 19, padY: 22 };

    // Grow through the near-full-screen frame into the hero in one go. The middle rect sits where
    // the width says it should, so the speed stays even and there is no pause on it.
    const start = loadingRect(100, vp);
    const mid = Math.min(0.95, Math.max(0.5, (wide.w - start.w) / (full.w - start.w)));
    await tween([start, wide, full], [0, mid, 1], 1000, (e) => {
      frame.style.opacity = String(1 - Math.min(1, Math.max(0, (e - mid) / (1 - mid))));
    });

    // Hand over to the hero: its copy fades in while the white loader fades out.
    loader.style.display = 'block';
    document.documentElement.classList.remove('is-loading');
    hero.querySelector('.hero__inner').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
    await loader.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' }).finished;
    loader.remove();
  };

  const start = performance.now();
  let shown = 0;

  const tick = (now) => {
    const elapsed = now - start;
    let target = Object.keys(WEIGHTS).reduce((sum, key) => sum + WEIGHTS[key] * loadProgress[key], 0) * 100;
    if (elapsed > MAX_WAIT) target = 100;
    target = Math.min(target, (elapsed / MIN_DURATION) * 100);

    shown += (target - shown) * 0.12;
    if (target - shown < 0.4) shown = target;

    const vp = viewport();
    setRect(loadingRect(shown, vp));
    value.textContent = `${Math.round(shown)}%`;
    fill.style.width = `${shown}px`;

    if (shown >= 100) reveal();
    else requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}
