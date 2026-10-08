(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Project pages: clips play only while on screen, and not at all for people who ask for reduced motion.
  const clips = document.querySelectorAll('video[autoplay]');
  clips.forEach((v) => {
    if (still) { v.removeAttribute('autoplay'); v.pause(); v.controls = true; }
  });
  if (!still && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {}); else target.pause();
      });
    }, { threshold: 0.25 });
    clips.forEach((v) => io.observe(v));
  }

  // Home tiles: the still is the resting state. A short preview plays over it while you point at
  // (or tab to) a tile; on touch screens it plays while the tile is mostly in view.
  const previews = [...document.querySelectorAll('.tile video')];
  if (!still && previews.length) {
    const start = (v) => {
      v.play().then(() => v.classList.add('is-playing')).catch(() => {});
    };
    const stop = (v) => {
      v.classList.remove('is-playing');
      v.pause();
    };
    // Rewind only once the fade back to the still has finished, so nothing jumps.
    previews.forEach((v) => v.addEventListener('transitionend', () => {
      if (!v.classList.contains('is-playing')) v.currentTime = 0;
    }));

    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      previews.forEach((v) => {
        const tile = v.closest('.tile');
        tile.addEventListener('pointerenter', () => start(v));
        tile.addEventListener('pointerleave', () => stop(v));
        tile.addEventListener('focus', () => start(v));
        tile.addEventListener('blur', () => stop(v));
      });
    } else if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(({ target, isIntersecting }) => (isIntersecting ? start(target) : stop(target)));
      }, { threshold: 0.6 });
      previews.forEach((v) => io.observe(v));
    }
  }

  // Phones: the project links scroll sideways. Start with the current one in view.
  const nav = document.querySelector('.topbar nav');
  if (nav) {
    const current = nav.querySelector('[aria-current="page"]');
    // Fade only the edge (or edges) that hide more links: start, middle, end, or none if it all fits.
    const edge = () => {
      const atStart = nav.scrollLeft <= 2;
      const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2;
      nav.dataset.edge = atStart && atEnd ? 'none' : atStart ? 'start' : atEnd ? 'end' : 'middle';
    };
    const centre = () => {
      if (current && nav.scrollWidth > nav.clientWidth) {
        nav.scrollLeft = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
      }
      edge();
    };
    nav.addEventListener('scroll', edge, { passive: true });
    centre();
    // Measure again once the web font has replaced the fallback, since link widths change with it.
    if (document.fonts) document.fonts.ready.then(centre);
  }

  // Project pages: the left and right arrow keys move to the previous and next project.
  const prev = document.querySelector('a[rel="prev"]');
  const next = document.querySelector('a[rel="next"]');
  if (prev || next) {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      if (e.key === 'ArrowLeft' && prev) location.href = prev.href;
      if (e.key === 'ArrowRight' && next) location.href = next.href;
    });
  }
})();
