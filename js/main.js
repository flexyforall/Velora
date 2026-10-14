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

// Hero: until hero-bg.mp4 is uploaded the video has no source, so keep only the poster image.
const heroVideo = document.querySelector('.hero__video');

if (heroVideo) {
  const sources = heroVideo.querySelectorAll('source');
  const lastSource = sources[sources.length - 1];
  lastSource?.addEventListener('error', () => heroVideo.remove());
}
