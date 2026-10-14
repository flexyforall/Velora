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

// Hero scroll scrub: the hero is pinned and scroll position drives the video's currentTime.
// The last frame of the video is the Agents section, so once the scrub ends the real section
// fades in on top of it at the same spot.
const intro = document.querySelector('.intro');
const hero = intro?.querySelector('.hero');
const video = hero?.querySelector('.hero__video');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Share of the scroll distance that fades out the hero copy, and the share after which
// the video holds its final frame before the handoff.
const OVERLAY_FADE_END = 0.1;
const VIDEO_END = 0.92;
const FRAME_WIDTH = 1440;

// Browsers without H.264 (some Linux Chromium builds) keep the static hero.
const canPlayVideo = video?.canPlayType('video/mp4; codecs="avc1.640033"') !== '';

if (video && canPlayVideo && !reduceMotion) {
  let targetTime = 0;
  let ticking = false;

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
    intro.classList.toggle('is-done', distance > 0 && scrolled >= distance - 0.5);

    if (video.duration) {
      // Stop just short of the end so the final frame stays on screen.
      targetTime = Math.min(1, progress / VIDEO_END) * (video.duration - 0.02);
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
    window.removeEventListener('scroll', requestUpdate);
    window.removeEventListener('resize', requestUpdate);
    video.remove();
  };

  video.addEventListener('loadedmetadata', update);
  video.addEventListener('seeked', seek);
  video.addEventListener('loadeddata', () => hero.classList.add('is-video-ready'));
  video.addEventListener('error', disableScrub);

  // iOS Safari only decodes frames after a play() call made from a user gesture.
  window.addEventListener('touchstart', () => {
    video.play().then(() => video.pause()).catch(() => {});
  }, { once: true, passive: true });

  intro.classList.add('is-scrub');

  // Load the whole file into a Blob: a blob: URL is seekable to any frame even when the
  // host doesn't support HTTP range requests.
  fetch(video.dataset.src)
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(response.status))))
    .then((blob) => { video.src = URL.createObjectURL(blob); })
    .catch(disableScrub);

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  update();
}
