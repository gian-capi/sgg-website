/* ===========================================================
   Signature Gallery Group — shared behaviour
   =========================================================== */
(function () {
  'use strict';

  /* ---------- top progress rail ---------- */
  var railFill = document.getElementById('railFill');
  function updateRail() {
    if (!railFill) return;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var p = h > 0 ? window.scrollY / h : 0;
    railFill.style.width = (8 + p * 92) + '%';
  }
  var navEl = document.querySelector('.nav');
  function updateNav() {
    if (navEl) navEl.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', updateNav, { passive: true });
  updateNav();

  window.addEventListener('scroll', updateRail, { passive: true });
  window.addEventListener('resize', updateRail);
  updateRail();

  /* ---------- reveal on scroll ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.rv').forEach(function (el) { io.observe(el); });

  /* ---------- accordion ---------- */
  document.querySelectorAll('.acc-item').forEach(function (item) {
    var btn = item.querySelector('.acc-btn');
    var panel = item.querySelector('.acc-panel');
    if (!btn || !panel) return;
    btn.addEventListener('click', function () {
      var open = item.classList.contains('open');
      document.querySelectorAll('.acc-item.open').forEach(function (o) {
        o.classList.remove('open');
        o.querySelector('.acc-panel').style.maxHeight = null;
      });
      if (!open) {
        item.classList.add('open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
      }
    });
  });

  /* ---------- menu overlay ---------- */
  var menu = document.getElementById('menuOverlay');
  if (menu) {
    document.querySelectorAll('[data-menu-open]').forEach(function (b) {
      b.addEventListener('click', function () { menu.classList.add('open'); });
    });
    menu.addEventListener('click', function (e) {
      if (e.target === menu || e.target.closest('[data-menu-close]')) menu.classList.remove('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') menu.classList.remove('open');
    });
  }

  /* ---------- right icon rail scroll-spy ---------- */
  var railBtns = Array.prototype.slice.call(document.querySelectorAll('.iconrail button'));
  railBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var t = document.querySelector(b.dataset.target);
      if (t) t.scrollIntoView({ behavior: 'smooth' });
    });
  });
  if (railBtns.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          railBtns.forEach(function (b) {
            b.classList.toggle('active', b.dataset.target === '#' + e.target.id);
          });
        }
      });
    }, { threshold: .3 });
    railBtns.forEach(function (b) {
      var el = document.querySelector(b.dataset.target);
      if (el) spy.observe(el);
    });
  }

  /* =========================================================
     Hero carousel — arrows, dots, autoplay, swipe
     ========================================================= */
  var hero = document.getElementById('hero');
  if (hero) {
    var slides = Array.prototype.slice.call(hero.querySelectorAll('.hero-slide'));
    var dotWrap = hero.querySelector('.hero-dots');
    var idx = 0, timer = null, DELAY = 7000;

    var dots = slides.map(function (_, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      b.addEventListener('click', function () { go(i); restart(); });
      dotWrap.appendChild(b);
      return b;
    });

    function go(n) {
      idx = (n + slides.length) % slides.length;
      slides.forEach(function (s, i) { s.classList.toggle('active', i === idx); });
      dots.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
    }
    function next() { go(idx + 1); }
    function prev() { go(idx - 1); }
    function restart() { clearInterval(timer); timer = setInterval(next, DELAY); }

    hero.querySelector('.hero-arrow.next').addEventListener('click', function () { next(); restart(); });
    hero.querySelector('.hero-arrow.prev').addEventListener('click', function () { prev(); restart(); });
    hero.addEventListener('mouseenter', function () { clearInterval(timer); });
    hero.addEventListener('mouseleave', restart);

    var sx = null;
    hero.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 45) { dx < 0 ? next() : prev(); restart(); }
      sx = null;
    }, { passive: true });

    go(0);
    restart();

    /* nested artwork rotator on slide 1 */
    var rot = hero.querySelector('.art-rotator');
    if (rot) {
      var shots = Array.prototype.slice.call(rot.querySelectorAll('img'));
      var ri = 0;
      shots[0].classList.add('active');
      setInterval(function () {
        shots[ri].classList.remove('active');
        ri = (ri + 1) % shots.length;
        shots[ri].classList.add('active');
      }, 3400);
    }
  }

  /* =========================================================
     New Releases — one artwork at a time (Ciao-style stage)
     ========================================================= */
  var stage = document.getElementById('releaseStage');
  if (stage) {
    var items = Array.prototype.slice.call(stage.querySelectorAll('.slot'));
    var titleEl = document.getElementById('releaseTitle');
    var metaEl = document.getElementById('releaseMeta');
    var countEl = document.getElementById('releaseCount');
    var scatterEl = document.getElementById('releaseScatter');
    var cur = 0;

    function paint() {
      items.forEach(function (el, i) {
        el.classList.remove('slot-current', 'slot-prev', 'slot-next', 'slot-hidden');
        var d = (i - cur + items.length) % items.length;
        if (d === 0) el.classList.add('slot-current');
        else if (d === items.length - 1) el.classList.add('slot-prev');
        else if (d === 1) el.classList.add('slot-next');
        else el.classList.add('slot-hidden');
      });

      var el = items[cur];
      var title = el.dataset.title || '';
      var artist = el.dataset.artist || '';

      [titleEl, metaEl].forEach(function (n) { if (n) n.classList.add('out'); });
      setTimeout(function () {
        if (titleEl) titleEl.textContent = title;
        if (metaEl) metaEl.textContent = artist;
        [titleEl, metaEl].forEach(function (n) { if (n) n.classList.remove('out'); });
      }, 240);

      if (countEl) {
        countEl.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(items.length).padStart(2, '0');
      }

      /* scatter the current title across the grid, as the reference does */
      if (scatterEl) {
        var letters = title.replace(/[^A-Za-z0-9]/g, '').toUpperCase().split('').slice(0, 12);
        scatterEl.innerHTML = '';
        letters.forEach(function (ch, i) {
          var s = document.createElement('span');
          s.textContent = ch;
          var col = i % 6, row = Math.floor(i / 6);
          s.style.left = (7 + col * 17) + '%';
          s.style.top = (row === 0 ? 22 : 76) + '%';
          scatterEl.appendChild(s);
        });
      }
    }

    document.getElementById('releaseNext').addEventListener('click', function () {
      cur = (cur + 1) % items.length; paint();
    });
    document.getElementById('releasePrev').addEventListener('click', function () {
      cur = (cur - 1 + items.length) % items.length; paint();
    });

    var rsx = null;
    stage.addEventListener('touchstart', function (e) { rsx = e.touches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (rsx === null) return;
      var dx = e.changedTouches[0].clientX - rsx;
      if (Math.abs(dx) > 45) { cur = (cur + (dx < 0 ? 1 : -1) + items.length) % items.length; paint(); }
      rsx = null;
    }, { passive: true });

    paint();
  }

  /* =========================================================
     Horizontal rail carousels (artists, releases strip, …)
     ========================================================= */
  document.querySelectorAll('[data-rail]').forEach(function (wrap) {
    var track = wrap.querySelector('[data-rail-track]');
    var prev = wrap.querySelector('[data-rail-prev]');
    var next = wrap.querySelector('[data-rail-next]');
    if (!track) return;

    function step() {
      var card = track.querySelector('*');
      return card ? card.getBoundingClientRect().width + 20 : 320;
    }
    function sync() {
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
    }
    if (next) next.addEventListener('click', function () { track.scrollLeft += step() * 2; });
    if (prev) prev.addEventListener('click', function () { track.scrollLeft -= step() * 2; });
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    setTimeout(sync, 60);
  });

  /* =========================================================
     Lightbox for artwork catalogues
     ========================================================= */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('[data-lb-caption]');
    document.querySelectorAll('[data-lb-src]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        lbImg.src = el.dataset.lbSrc;
        lbImg.alt = el.dataset.lbCaption || '';
        if (lbCap) lbCap.textContent = el.dataset.lbCaption || '';
        lb.classList.add('open');
      });
    });
    lb.addEventListener('click', function () { lb.classList.remove('open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') lb.classList.remove('open');
    });
  }
})();

/* =========================================================
   Gallery photo carousel (gallery pages)
   ========================================================= */
(function () {
  'use strict';
  document.querySelectorAll('[data-gcar]').forEach(function (wrap) {
    var shots = Array.prototype.slice.call(wrap.querySelectorAll('.gcar-track img'));
    if (shots.length < 2) return;
    var dotWrap = wrap.querySelector('[data-gcar-dots]');
    var i = 0, timer = null;

    var dots = shots.map(function (_, n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Photo ' + (n + 1));
      b.addEventListener('click', function () { go(n); restart(); });
      dotWrap.appendChild(b);
      return b;
    });

    function go(n) {
      i = (n + shots.length) % shots.length;
      shots.forEach(function (s, k) { s.classList.toggle('active', k === i); });
      dots.forEach(function (d, k) { d.classList.toggle('active', k === i); });
    }
    function restart() { clearInterval(timer); timer = setInterval(function () { go(i + 1); }, 5500); }

    wrap.querySelector('[data-gcar-next]').addEventListener('click', function () { go(i + 1); restart(); });
    wrap.querySelector('[data-gcar-prev]').addEventListener('click', function () { go(i - 1); restart(); });
    wrap.addEventListener('mouseenter', function () { clearInterval(timer); });
    wrap.addEventListener('mouseleave', restart);

    var sx = null;
    wrap.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 45) { go(i + (dx < 0 ? 1 : -1)); restart(); }
      sx = null;
    }, { passive: true });

    go(0);
    restart();
  });
})();
