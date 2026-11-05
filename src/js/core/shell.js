// Shared chrome injected into every page: nav, mobile menu, footer, cursor, grain. (The curtain is static HTML.)
import logoUrl from '../../assets/hyde-logo.svg';

export const PAGES = [
  { id: 'home', href: 'index.html', label: 'Home', curtain: ['Hyde Lounge', 'Adliya · Bahrain'] },
  { id: 'menu', href: 'menu.html', label: 'Menu', curtain: ['The Menu', 'Hyde Lounge'] },
  { id: 'live', href: 'live.html', label: 'Live Nights', curtain: ['Live Nights', 'Hyde Lounge'] },
  { id: 'brunch', href: 'brunch.html', label: 'Brunch', curtain: ['Friday Brunch', 'Hyde Lounge'] },
  { id: 'reserve', href: 'reserve.html', label: 'Reserve', curtain: ['Reserve', 'Hyde Lounge'] },
];

export const VENUE = {
  phone: '+973 6665 5099',
  phoneHref: 'tel:+97366655099',
  whatsapp: 'https://wa.me/97366655099',
  address: 'Adliya · Block 338 · Bahrain',
  hours: 'Daily 8 PM – 2:30 AM',
  instagram: 'https://www.instagram.com/hydebahrain/',
  maps: 'https://www.google.com/maps/search/?api=1&query=Hyde+Lounge+Adliya+Bahrain',
};

export function injectShell(current) {
  const cur = (id) => (id === current ? ' aria-current="page"' : '');

  const nav = `
  <header class="nav" data-nav>
    <a class="nav__logo" href="index.html" aria-label="Hyde Lounge — home" data-cursor>
      <img src="${logoUrl}" alt="HYDE" width="96" height="28" />
      <span>LOUNGE</span>
    </a>
    <nav class="nav__links" aria-label="Primary">
      ${PAGES.map((p) => `<a class="link-u" href="${p.href}"${cur(p.id)}>${p.label}</a>`).join('')}
    </nav>
    <div class="nav__right">
      <a class="btn nav__cta" href="reserve.html"><span class="dot"></span>Book a table</a>
      <button class="nav__burger" aria-label="Open menu" aria-expanded="false" data-burger><span></span><span></span></button>
    </div>
  </header>

  <div class="menu" data-menu aria-hidden="true">
    <div class="menu__links">
      ${PAGES.map((p, i) => `<span class="split-line"><a href="${p.href}"${cur(p.id)}><small>0${i + 1}</small>${p.label}</a></span>`).join('')}
    </div>
    <div class="menu__foot">
      <span class="eyebrow">Reservations</span>
      <a href="${VENUE.phoneHref}">${VENUE.phone}</a>
      <span>${VENUE.address}</span>
      <span>${VENUE.hours}</span>
    </div>
  </div>`;

  // The loader/curtain is static markup at the top of each page's <body> (see the HTML files).
  const extras = `
  <div class="cursor" data-cursor-el aria-hidden="true"><div class="cursor__dot"></div></div>
  <div class="grain" aria-hidden="true"></div>`;

  document.body.insertAdjacentHTML('afterbegin', nav);
  document.querySelector('main')?.insertAdjacentHTML('afterend', footer(current));
  document.body.insertAdjacentHTML('beforeend', extras);
}

/* Site footer: the closing reservation moment, shared by every page. */
function footer(current) {
  const year = new Date().getFullYear();
  return `
  <footer class="foot" data-foot>
    <div class="foot__cta">
      <p class="eyebrow" data-fr>Reservations</p>
      <h2 class="foot__title">
        <span class="split-line"><span data-fl>Your table</span></span>
        <span class="split-line"><span data-fl><em>is waiting.</em></span></span>
      </h2>
      <div class="foot__actions" data-fr>
        <a class="btn" href="reserve.html"><span class="dot"></span>Reserve a table</a>
        <a class="btn btn--ghost" href="${VENUE.phoneHref}">Call ${VENUE.phone}</a>
      </div>
    </div>
    <div class="foot__grid" data-fr>
      <div>
        <p class="eyebrow">Visit</p>
        <p>Adliya · Block 338<br />Kingdom of Bahrain</p>
        <a class="link-u" href="${VENUE.maps}" target="_blank" rel="noopener">Get directions</a>
      </div>
      <div>
        <p class="eyebrow">Hours</p>
        <p>Daily<br />8 PM – 2:30 AM</p>
        <p class="foot__muted">Parking available</p>
      </div>
      <div>
        <p class="eyebrow">Follow</p>
        <a class="link-u" href="${VENUE.instagram}" target="_blank" rel="noopener">Instagram · @hydebahrain</a>
      </div>
      <nav aria-label="Footer">
        <p class="eyebrow">Explore</p>
        ${PAGES.map((p) => `<a class="link-u" href="${p.href}"${p.id === current ? ' aria-current="page"' : ''}>${p.label}</a>`).join('')}
      </nav>
    </div>
    <div class="foot__mark" aria-hidden="true"><img src="${logoUrl}" alt="" /></div>
    <div class="foot__base"><span>© ${year} Hyde Lounge</span><span>Adliya · Bahrain</span></div>
  </footer>`;
}
