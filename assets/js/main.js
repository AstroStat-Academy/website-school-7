/**
 * main.js — UI logic
 *
 * Handles: apply-button transition, footer canvas reactivation,
 * scroll reveal, animated counters, side-nav dots, navbar active state.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {

    // --- Lock scroll on landing ---
    document.body.classList.add('locked');

    // --- Boot canvases ---
    FooterCanvas.init(document.getElementById('footer-c'));
    AstroCanvas.init({
      canvas:     document.getElementById('c'),
      whiteFlash: document.getElementById('whiteFlash'),
      hero:       document.querySelector('.hero'),
      content:    document.getElementById('content'),
      nav:        document.getElementById('siteNav'),
      sideDots:   document.getElementById('sideDots'),
    });

    // --- Dev shortcut: ?skip jumps straight to content ---
    if (location.search.includes('skip')) {
      document.body.classList.remove('locked');
      document.body.classList.add('unlocked');
      document.querySelector('.hero').style.display   = 'none';
      document.getElementById('c').style.display      = 'none';
      document.getElementById('content').classList.add('visible');
      document.getElementById('siteNav').classList.add('visible');
      document.getElementById('sideDots').classList.add('visible');
    }

    // ===== EXPLORE BUTTON =====
    document.getElementById('exploreBtn').addEventListener('click', function (e) {
      e.preventDefault();
      if (window.innerWidth < 769) {
        window.location.href = '?skip#about';
      } else {
        AstroCanvas.startTransition();
      }
    });

    // ===== HAMBURGER MENU =====
    var hamburger = document.getElementById('navHamburger');
    var navLinksMenu = document.querySelector('.nav-links');
    if (hamburger && navLinksMenu) {
      hamburger.addEventListener('click', function () {
        var isOpen = navLinksMenu.classList.toggle('open');
        hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        hamburger.innerHTML = isOpen
          ? '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="2" y1="2" x2="16" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="2" x2="2" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
      });
      // Close menu when a nav link is clicked
      navLinksMenu.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          navLinksMenu.classList.remove('open');
          hamburger.setAttribute('aria-expanded', 'false');
          hamburger.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><line x1="2" y1="5" x2="16" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="13" x2="16" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        });
      });
    }

    // ===== FOOTER DARK-MODE NAV =====
    const applyFooter = document.getElementById('apply-section');
    const contentDiv  = document.getElementById('content');
    const siteNav     = document.getElementById('siteNav');

    const footerObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          siteNav.classList.add('dark-mode');
        } else {
          siteNav.classList.remove('dark-mode');
        }
      });
    }, { threshold: 0.1, root: window.innerWidth >= 769 ? contentDiv : null });

    footerObs.observe(applyFooter);

    // ===== SCROLL REVEAL =====
    const revealObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach(function (el) {
      revealObs.observe(el);
    });

    // ===== ANIMATED COUNTERS =====
    let countersDone = false;
    const statsRow = document.getElementById('statsRow');

    if (statsRow) {
      const statsObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !countersDone) {
            countersDone = true;
            document.querySelectorAll('.stat-number').forEach(function (el) {
              const target = parseInt(el.dataset.target);
              const duration = 1500;
              const start = performance.now();
              function tick(now) {
                const p = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased) + (target > 10 ? '+' : '');
                if (p < 1) requestAnimationFrame(tick);
              }
              requestAnimationFrame(tick);
            });
          }
        });
      }, { threshold: 0.5 });

      statsObs.observe(statsRow);
    }

    // ===== ANIMATED COUNTERS (legacy stats) =====
    let legacyCountersDone = false;
    const legacySection = document.getElementById('legacy');
    if (legacySection) {
      const legacyStatsObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !legacyCountersDone) {
            legacyCountersDone = true;
            document.querySelectorAll('.stat-number-sm').forEach(function (el) {
              const target = parseInt(el.dataset.target);
              const duration = 1500;
              const start = performance.now();
              function tick(now) {
                const p = Math.min((now - start) / duration, 1);
                const eased = 1 - Math.pow(1 - p, 3);
                el.textContent = Math.round(target * eased) + (target > 10 ? '+' : '');
                if (p < 1) requestAnimationFrame(tick);
              }
              requestAnimationFrame(tick);
            });
          }
        });
      }, { threshold: 0.3 });
      legacyStatsObs.observe(legacySection);
    }

    // ===== SIDE NAVIGATION DOTS =====
    const sections      = document.querySelectorAll('.content-section .snap-sec');
    const dotsContainer = document.getElementById('sideDots');
    const sectionIds    = [];

    sections.forEach(function (sec) {
      const id = sec.id;
      sectionIds.push(id);
      const btn = document.createElement('button');
      btn.className = 'side-dot';
      btn.setAttribute('aria-label', id);
      btn.addEventListener('click', function () {
        const target = document.getElementById(id);
        if (window.innerWidth >= 769 && contentDiv) {
          contentDiv.scrollTo({ top: target.offsetTop - contentDiv.offsetTop, behavior: 'smooth' });
        } else {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
      dotsContainer.appendChild(btn);
    });

    // On mobile, contentDiv is not a scroll container — use viewport (null) as root
    var obsRoot = window.innerWidth >= 769 ? contentDiv : null;

    const dotBtns = dotsContainer.querySelectorAll('.side-dot');
    const dotObs  = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          const idx = sectionIds.indexOf(entry.target.id);
          dotBtns.forEach(function (d, i) { d.classList.toggle('active', i === idx); });
          const isDark = entry.target.classList.contains('sec-dark') ||
                         entry.target.classList.contains('apply-footer');
          dotsContainer.classList.toggle('on-dark', isDark);
        }
      });
    }, { threshold: 0.5, root: obsRoot });

    sections.forEach(function (sec) { dotObs.observe(sec); });

    // ===== NAVBAR ACTIVE LINK + DARK MODE =====
    const navLinks = document.querySelectorAll('.nav-links a');

    const navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id);
          });
          const isDark = entry.target.classList.contains('sec-dark') ||
                         entry.target.classList.contains('apply-footer');
          siteNav.classList.toggle('dark-mode', isDark);
        }
      });
    }, { threshold: 0.3, root: obsRoot });

    sections.forEach(function (sec) { navObs.observe(sec); });

  });

})();
