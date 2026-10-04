// navIndicator.js — indikator menu bawah (mobile) bergaya "notch + bubble".
//
// Cara kerja:
// - Bar menu digambar dari elemen `.nav-bg` yang dipotong dengan clip-path
//   sehingga punya lekukan (notch) setengah lingkaran tepat di bawah tab aktif.
// - `.nav-bubble` (bulatan berisi ikon tab aktif) berada di dalam lekukan itu.
// - Saat tab berpindah, bubble melompat; lekukan menutup saat lepas landas
//   lalu terbuka saat mendarat. Semua geometri mengikuti satu animation frame.
// - Warna 100% dari CSS variable (--nav-*) per tema di css/bottomnav.css,
//   jadi file ini tidak tahu apa pun soal tema.
// - Di desktop, penanda dan ikon bergerak vertikal mengikuti menu samping.
// - Tidak mengubah routing: cukup membaca class `.active` yang sudah diatur app.js.

// Geometri (px) — harus sama dengan nilai di css/bottomnav.css
const NOTCH_RADIUS = 29;  // radius lekukan = radius bubble (25) + cincin (4)
const NOTCH_DEPTH = 12;   // jarak pusat lekukan dari tepi atas bar
const FILLET = 22;        // lebar bahu lengkung antara tepi datar dan lekukan
const SLIDE_MS = 580;

function notchClip(width, cx, opening = 1) {
  const L = -60;
  const R = width + 60;
  const BOT = 999;
  if (cx == null || opening < 0.001) return `path('M${L} 0H${R}V${BOT}H${L}Z')`;
  const f = (n) => n.toFixed(2);
  const a = cx - NOTCH_RADIUS - FILLET;
  const b = cx + NOTCH_RADIUS + FILLET;
  const k = FILLET * 0.55;
  const depth = NOTCH_DEPTH * opening;
  const h = depth * 0.45;
  return `path('M${L} 0H${f(a)}`
    + `C${f(a + k)} 0 ${f(cx - NOTCH_RADIUS)} ${f(h)} ${f(cx - NOTCH_RADIUS)} ${f(depth)}`
    + `A${NOTCH_RADIUS} ${f(NOTCH_RADIUS * opening)} 0 0 0 ${f(cx + NOTCH_RADIUS)} ${f(depth)}`
    + `C${f(cx + NOTCH_RADIUS)} ${f(h)} ${f(b - k)} 0 ${f(b)} 0`
    + `H${R}V${BOT}H${L}Z')`;
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function initBottomNavIndicator(nav) {
  if (!nav || nav.querySelector('.nav-bg')) return;
  initSidebarNavIndicator(nav);

  const shape = document.createElement('div');
  shape.className = 'nav-shape';
  shape.setAttribute('aria-hidden', 'true');
  const bg = document.createElement('div');
  bg.className = 'nav-bg';
  shape.appendChild(bg);

  const bubble = document.createElement('div');
  bubble.className = 'nav-bubble is-hidden';
  bubble.setAttribute('aria-hidden', 'true');

  nav.prepend(shape);
  nav.append(bubble);

  const mobileMq = window.matchMedia('(max-width:799px)');
  const reduceMq = window.matchMedia('(prefers-reduced-motion:reduce)');

  let current = null;     // posisi x lekukan saat ini (px, relatif ke nav)
  let tweenTarget = null; // tujuan animasi yang sedang berjalan
  let raf = 0;
  let shownBtn = null;    // tombol yang ikonnya sedang tampil di bubble
  let lift = 0;
  let opening = 1;
  let iconOpacity = 1;

  function paint(cx) {
    const clip = notchClip(nav.clientWidth, cx, opening);
    bg.style.clipPath = clip;
    bg.style.webkitClipPath = clip;
    if (cx == null) {
      bubble.classList.add('is-hidden');
    } else {
      bubble.classList.remove('is-hidden');
      bubble.style.transform = `translate3d(${(cx - 25).toFixed(2)}px,${(-lift).toFixed(2)}px,0)`;
    }
    const icon = bubble.querySelector('svg');
    if (icon) {
      icon.style.opacity = iconOpacity;
      icon.style.transform = `scale(${0.75 + iconOpacity * 0.25})`;
    }
  }

  function showIcon(btn) {
    if (btn === shownBtn) return;
    shownBtn = btn;
    bubble.textContent = '';
    if (!btn) return;
    const svg = btn.querySelector('svg');
    if (svg) bubble.appendChild(svg.cloneNode(true));
  }

  function activeButton() {
    const btn = nav.querySelector('.nav-btn.active');
    return btn && btn.offsetWidth > 0 ? btn : null;
  }

  function cancelTween() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    tweenTarget = null;
  }

  function sync(animate) {
    if (!mobileMq.matches || nav.clientWidth === 0) {
      cancelTween();
      current = null;
      lift = 0;
      opening = iconOpacity = 1;
      paint(null);
      return;
    }
    const btn = activeButton();
    if (!btn) {
      cancelTween();
      current = null;
      lift = 0;
      opening = iconOpacity = 1;
      paint(null);
      showIcon(null);
      return;
    }
    const target = btn.offsetLeft + btn.offsetWidth / 2;

    if (current == null || !animate || reduceMq.matches) {
      cancelTween();
      current = target;
      lift = 0;
      opening = iconOpacity = 1;
      showIcon(btn);
      paint(target);
      return;
    }
    if (tweenTarget != null && Math.abs(tweenTarget - target) < 0.5) return;
    if (tweenTarget == null && Math.abs(current - target) < 0.5) {
      showIcon(btn);
      paint(target);
      return;
    }

    cancelTween();
    tweenTarget = target;
    const from = current;
    const fromLift = lift;
    const fromOpening = opening;
    const fromOpacity = iconOpacity;
    const jumpHeight = Math.min(48, 28 + Math.abs(target - from) * 0.06);
    const start = performance.now();
    let swapped = false;
    const step = (now) => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      const progress = easeInOut(t);
      current = from + (target - from) * progress;
      lift = fromLift * (1 - progress) + Math.sin(Math.PI * t) * jumpHeight;
      opening = t < 0.45
        ? fromOpening * (1 - easeInOut(t / 0.45))
        : easeInOut((t - 0.45) / 0.55);
      iconOpacity = t < 0.5
        ? fromOpacity * (1 - Math.min(1, t / 0.28))
        : easeInOut(Math.min(1, (t - 0.5) / 0.36));
      if (!swapped && t >= 0.5) { swapped = true; showIcon(btn); }
      paint(current);
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        raf = 0;
        tweenTarget = null;
        current = target;
        lift = 0;
        opening = iconOpacity = 1;
        showIcon(btn);
        paint(target);
      }
    };
    raf = requestAnimationFrame(step);
  }

  // Tab aktif berubah (app.js menambah/menghapus class .active) atau nav
  // ditampilkan/disembunyikan (class .hidden).
  new MutationObserver((records) => {
    // Abaikan perubahan class pada bubble sendiri (is-hidden / pop).
    if (records.some((r) => r.target === nav || r.target.classList.contains('nav-btn'))) sync(true);
  }).observe(nav, {
    attributes: true,
    attributeFilter: ['class'],
    subtree: true,
  });
  // Ukuran berubah (rotasi layar, nav baru tampil): posisikan ulang tanpa animasi.
  if ('ResizeObserver' in window) new ResizeObserver(() => sync(false)).observe(nav);
  const onMq = () => sync(false);
  if (mobileMq.addEventListener) mobileMq.addEventListener('change', onMq);
  else if (mobileMq.addListener) mobileMq.addListener(onMq);
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', onMq);
  else if (reduceMq.addListener) reduceMq.addListener(onMq);

  sync(false);
}

function initSidebarNavIndicator(nav) {
  const indicator = document.createElement('div');
  indicator.className = 'sidebar-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  const bubble = document.createElement('div');
  bubble.className = 'sidebar-bubble';
  bubble.setAttribute('aria-hidden', 'true');
  nav.append(indicator, bubble);
  nav.classList.add('sidebar-motion-ready');

  const desktopMq = window.matchMedia('(min-width:800px)');
  const reduceMq = window.matchMedia('(prefers-reduced-motion:reduce)');
  let pose = null;
  let destination = null;
  let frame = 0;
  let shown = null;
  let hop = 0;
  let opacity = 1;

  function showIcon(button) {
    if (shown === button) return;
    shown = button;
    bubble.replaceChildren(button.querySelector('svg').cloneNode(true));
  }

  function paint() {
    indicator.style.width = `${pose.width}px`;
    indicator.style.height = `${pose.height}px`;
    indicator.style.transform = `translate3d(${pose.x}px,${pose.y}px,0) scaleX(${1 - hop * 0.008})`;
    bubble.style.transform = `translate3d(${pose.iconX - hop}px,${pose.iconY}px,0)`;
    const icon = bubble.querySelector('svg');
    if (icon) {
      icon.style.opacity = opacity;
      icon.style.transform = `scale(${0.75 + opacity * 0.25})`;
    }
  }

  function sync(animate) {
    const button = [...nav.querySelectorAll('.nav-btn.active')].find(btn => btn.offsetWidth > 0);
    if (!desktopMq.matches || !button || !nav.clientWidth) {
      cancelAnimationFrame(frame);
      frame = 0;
      pose = destination = null;
      indicator.style.visibility = bubble.style.visibility = 'hidden';
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const rect = button.getBoundingClientRect();
    const icon = button.querySelector('svg').getBoundingClientRect();
    const x = nav.scrollLeft - navRect.left - nav.clientLeft;
    const y = nav.scrollTop - navRect.top - nav.clientTop;
    const target = {
      x: rect.left + x, y: rect.top + y, width: rect.width, height: rect.height,
      iconX: icon.left + x + icon.width / 2 - 16,
      iconY: icon.top + y + icon.height / 2 - 16,
    };
    if (animate && destination && Object.keys(target).every(key => Math.abs(target[key] - destination[key]) < 0.5)) return;
    cancelAnimationFrame(frame);
    frame = 0;
    destination = target;
    indicator.style.visibility = bubble.style.visibility = 'visible';
    if (!pose || !animate || reduceMq.matches) {
      pose = { ...target };
      hop = 0;
      opacity = 1;
      showIcon(button);
      paint();
      return;
    }
    const from = { ...pose };
    const fromHop = hop;
    const fromOpacity = opacity;
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / SLIDE_MS);
      const progress = easeInOut(t);
      for (const key of Object.keys(target)) pose[key] = from[key] + (target[key] - from[key]) * progress;
      hop = fromHop * (1 - progress) + Math.sin(Math.PI * t) * 6;
      opacity = t < 0.5 ? fromOpacity * (1 - Math.min(1, t / 0.28)) : easeInOut(Math.min(1, (t - 0.5) / 0.36));
      if (t >= 0.5) showIcon(button);
      if (t === 1) { hop = 0; opacity = 1; }
      paint();
      frame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    frame = requestAnimationFrame(step);
  }

  new MutationObserver(records => {
    if (records.some(({ target }) => target === nav || target.classList.contains('nav-btn'))) sync(true);
  }).observe(nav, { attributes:true, attributeFilter:['class'], subtree:true });
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => sync(false));
    observer.observe(nav);
    nav.querySelectorAll('.nav-btn').forEach(button => observer.observe(button));
  }
  for (const mq of [desktopMq, reduceMq]) {
    if (mq.addEventListener) mq.addEventListener('change', () => sync(false));
    else mq.addListener(() => sync(false));
  }
  sync(false);
}
