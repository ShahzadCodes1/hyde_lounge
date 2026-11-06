/* ==========================================================================
   MEDIA — photos and footage, with fingerprinted file names.
   The files live in src/media; the build gives each one a content-hashed name, so they can be
   cached for a year and an updated file is still picked up at once (it gets a new name).
   · mediaUrl(): the built URL of a file, by name ("plate-1.webp", "media/plate-1.webp")
   · initLazyMedia(): video posters load only when their card is about to be seen, and every
     lazy photo or poster fades in once it has loaded instead of popping in.
   ========================================================================== */

const files = import.meta.glob('/src/media/*.{jpg,webp,mp4}', { eager: true, query: '?url', import: 'default' });

/** @param {string} name a media file name, with or without a leading "media/" */
export const mediaUrl = (name) => files[`/src/media/${String(name).replace(/^\/?(src\/)?(media\/)?/, '')}`] ?? name;

const loaded = (el) => el.classList.add('is-loaded');

export function initLazyMedia() {
  // photos: fade in when they arrive (an already-decoded one shows at once)
  document.querySelectorAll('main img[loading="lazy"]').forEach((img) => {
    if (img.complete && img.naturalWidth) return;
    img.classList.add('lm');
    img.addEventListener('load', () => loaded(img), { once: true });
    img.addEventListener('error', () => loaded(img), { once: true });
  });

  // video posters: fetched about a screen and a half ahead, then faded in
  const videos = [...document.querySelectorAll('video[data-poster-src]')];
  if (!videos.length) return;
  const show = (v) => {
    if (v.dataset.posterOn) return;
    v.dataset.posterOn = '1';
    const url = mediaUrl(v.dataset.posterSrc);
    const img = new Image();
    const done = () => { v.poster = url; requestAnimationFrame(() => loaded(v)); };
    img.onload = done; img.onerror = done;
    img.src = url;
  };
  videos.forEach((v) => v.classList.add('lm'));
  if (!('IntersectionObserver' in window)) { videos.forEach(show); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
  }), { rootMargin: '150% 0px' });
  videos.forEach((v) => io.observe(v));
}

/** Show a video (its poster may still be on its way) as soon as its footage starts playing. */
export const revealVideo = (v) => loaded(v);
