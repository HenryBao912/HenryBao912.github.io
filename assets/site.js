(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Rows that scroll sideways on a phone fade only the edge (or edges) that hide more:
  // start, middle, end, or none if everything fits.
  const markEdges = (row) => {
    const atStart = row.scrollLeft <= 2;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
    row.dataset.edge = atStart && atEnd ? 'none' : atStart ? 'start' : atEnd ? 'end' : 'middle';
  };

  // Loading: until an image or clip arrives, its frame shows my name (.is-loaded in site.css
  // removes it). Each frame gets a promise so the page loader can wait for the first screen.
  const frames = [...document.querySelectorAll('.panel, .shot, .tile-media, .carousel-slide')];
  const frameReady = new Map(frames.map((frame) => [frame, new Promise((resolve) => {
    const settle = (ok) => { frame.classList.add(ok ? 'is-loaded' : 'is-failed'); resolve(); };
    const img = frame.querySelector('img');
    const video = frame.querySelector('video');
    if (img) {
      if (img.complete) { settle(img.naturalWidth > 0); return; }
      img.addEventListener('load', () => settle(true), { once: true });
      img.addEventListener('error', () => settle(false), { once: true });
    } else if (video) {
      if (video.readyState >= 2) { settle(true); return; }
      video.addEventListener('loadeddata', () => settle(true), { once: true });
      if (video.poster) {
        const probe = new Image();
        probe.onload = () => settle(true);
        probe.onerror = () => settle(false);
        probe.src = video.poster;
      }
    } else {
      resolve();
    }
  })]));

  // Page loader (first page of a visit only, see .loader in site.css): once the fonts and the media
  // on the first screen are ready, and the name has had a moment to fill in, fade it out. Never hold
  // the page more than three seconds after navigation began.
  const loader = document.querySelector('.loader');
  const root = document.documentElement;
  if (loader && !root.classList.contains('seen') && !still) {
    const firstScreen = frames.filter((f) => {
      const r = f.getBoundingClientRect();
      return r.width > 0 && r.bottom > 0 && r.top < innerHeight;
    });
    const waits = firstScreen.map((f) => frameReady.get(f));
    if (document.fonts) waits.push(document.fonts.ready);
    waits.push(new Promise((r) => setTimeout(r, Math.max(0, 1000 - performance.now()))));
    const cap = new Promise((r) => setTimeout(r, Math.max(0, 3000 - performance.now())));
    Promise.race([Promise.all(waits), cap]).then(() => {
      try { sessionStorage.setItem('hb-intro', '1'); } catch (e) { /* private mode: show it again next time */ }
      loader.style.animation = 'none';
      loader.style.transition = 'opacity 0.45s ease';
      loader.style.opacity = '0';
      setTimeout(() => loader.classList.add('is-gone'), 500);
    });
  }

  // WikiSpeedrun's route table scrolls sideways on narrow screens: fade the edge that hides columns.
  document.querySelectorAll('.routes-scroll').forEach((row) => {
    const update = () => markEdges(row);
    row.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
    if (document.fonts) document.fonts.ready.then(update);
  });

  // Project pages: clips load and play only while near the screen, so a page with a dozen clips
  // doesn't download all of them up front. Reduced motion gets controls instead of playback.
  const clips = document.querySelectorAll('video[data-autoplay]');
  if (still) {
    clips.forEach((v) => { v.controls = true; v.preload = 'metadata'; });
  } else if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (isIntersecting) target.play().catch(() => {}); else target.pause();
      });
    }, { rootMargin: '200px 0px', threshold: 0 });
    clips.forEach((v) => io.observe(v));
  } else {
    clips.forEach((v) => v.play().catch(() => {}));
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

  // Hutong After Rain: switch every still between the path tracer and Lumen, from the buttons above
  // the stills or from the same switch on an enlarged photo in the viewer; both stay in step.
  const renderer = document.querySelector('.renderer');
  let rendererMode = 'pt';
  const setRenderer = (mode) => {
    rendererMode = mode;
    if (renderer) renderer.querySelectorAll('button[data-renderer]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.renderer === mode)));
    document.querySelectorAll('img[data-pt][data-rt]').forEach((img) => { img.src = img.dataset[mode]; });
    document.dispatchEvent(new CustomEvent('renderer-change', { detail: mode }));
  };
  if (renderer) {
    renderer.hidden = false;
    renderer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-renderer]');
      if (btn) setRenderer(btn.dataset.renderer);
    });
  }

  // Project pages: every image and clip opens larger in a viewer. Images that have a full-resolution
  // copy (assets/full/, same file name) load that; the rest open at their own size.
  if (document.body.classList.contains('page-project')) {
    const items = [...document.querySelectorAll('.panel, .shot, .carousel-slide')].filter((el) => el.querySelector('img, video'));
    if (items.length) {
      const icon = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2h4v4M6 14H2v-4M14 2 9.5 6.5M2 14l4.5-4.5"/></svg>';
      const labelFor = (el) => {
        if (el.dataset.label) return el.dataset.label;
        const own = el.querySelector('.panel-label');
        if (own) return own.textContent.trim();
        const stage = el.closest('.stage');
        if (stage) return (stage.querySelector('.stage-label')?.textContent || '').trim();
        const cap = el.closest('figure')?.querySelector('figcaption');
        if (cap) return cap.textContent.trim();
        const m = el.querySelector('img, video');
        return m.getAttribute('alt') || m.getAttribute('aria-label') || '';
      };
      const nameItems = () => items.forEach((el) => {
        const name = labelFor(el);
        el.setAttribute('aria-label', name ? `View larger: ${name}` : 'View larger');
      });
      const fullSrc = (img) => {
        if (img.dataset.pt && img.dataset.rt) return img.dataset[rendererMode].replace('assets/', 'assets/full/');
        const src = img.currentSrc || img.src;
        return img.hasAttribute('data-full') ? src.replace('/assets/', '/assets/full/') : src;
      };

      const box = document.createElement('dialog');
      box.className = 'lightbox';
      box.setAttribute('aria-label', 'Enlarged view');
      box.innerHTML = '<div class="lightbox-stage"></div>'
        + '<div class="lightbox-switch" role="group" aria-label="Renderer" hidden>'
        + '<button type="button" data-mode="pt" aria-pressed="true">Path traced</button>'
        + '<button type="button" data-mode="rt" aria-pressed="false">Real time</button></div>'
        + '<div class="lightbox-bar"><p class="lightbox-caption"></p><div class="lightbox-controls">'
        + '<button type="button" data-go="-1">Previous</button><span class="lightbox-count"></span>'
        + '<button type="button" data-go="1">Next</button><button type="button" data-close>Close</button>'
        + '</div></div>';
      document.body.appendChild(box);
      const stage = box.querySelector('.lightbox-stage');
      const caption = box.querySelector('.lightbox-caption');
      const count = box.querySelector('.lightbox-count');
      const switcher = box.querySelector('.lightbox-switch');
      // Keep the switch on the top-right corner of the part of the photo that is in view.
      const placeSwitch = () => {
        if (switcher.hidden) return;
        const img = stage.querySelector('img');
        if (!img || !img.naturalWidth) { switcher.style.visibility = 'hidden'; return; }
        const r = img.getBoundingClientRect();
        const v = stage.getBoundingClientRect();
        switcher.style.visibility = '';
        const inset = innerWidth < 640 ? 8 : 12;
        switcher.style.top = `${Math.max(r.top, v.top) + inset}px`;
        switcher.style.left = `${Math.min(r.right, v.right) - inset - switcher.offsetWidth}px`;
      };
      const pressSwitch = () => switcher.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === rendererMode)));
      switcher.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-mode]');
        if (!b || b.dataset.mode === rendererMode) return;
        setRenderer(b.dataset.mode);
        const media = items[index].querySelector('img');
        const img = stage.querySelector('img');
        if (media && img) { img.alt = media.alt; img.src = fullSrc(media); }
      });
      document.addEventListener('renderer-change', pressSwitch);
      addEventListener('resize', () => { if (box.open) placeSwitch(); });
      stage.addEventListener('scroll', placeSwitch, { passive: true });
      let index = 0;
      let opener = null;
      let swiped = false;

      // Click a large image to see it at actual pixels, centred on the point you clicked.
      const zoom = (e, img) => {
        const r = img.getBoundingClientRect();
        const fx = (e.clientX - r.left) / r.width;
        const fy = (e.clientY - r.top) / r.height;
        if (box.classList.toggle('is-zoomed')) {
          requestAnimationFrame(() => {
            stage.scrollLeft = fx * stage.scrollWidth - stage.clientWidth / 2;
            stage.scrollTop = fy * stage.scrollHeight - stage.clientHeight / 2;
            placeSwitch();
          });
        } else {
          requestAnimationFrame(placeSwitch);
        }
      };

      let loadToken = 0;
      const show = (i) => {
        index = (i + items.length) % items.length;
        const el = items[index];
        const media = el.querySelector('video') || el.querySelector('img');
        box.classList.remove('is-zoomed');
        stage.replaceChildren();
        // My name holds the stage until the enlarged image or clip arrives. The token stops a slow
        // earlier image from clearing the placeholder of the one now showing.
        const token = ++loadToken;
        const loaded = () => { if (token === loadToken) stage.classList.remove('is-loading'); };
        stage.classList.add('is-loading');
        if (media.tagName === 'VIDEO') {
          switcher.hidden = true;
          const v = document.createElement('video');
          // A clip with a larger copy in assets/full/ plays that one full screen, falling back to the page's copy.
          const pageSrc = media.currentSrc || media.src;
          v.src = media.hasAttribute('data-full') ? pageSrc.replace('/assets/', '/assets/full/') : pageSrc;
          v.addEventListener('error', () => { if (v.src !== pageSrc) { v.src = pageSrc; v.play().catch(() => {}); } }, { once: true });
          v.poster = media.poster;
          v.controls = true; v.muted = true; v.loop = true; v.playsInline = true;
          v.setAttribute('aria-label', media.getAttribute('aria-label') || '');
          v.addEventListener('loadedmetadata', () => { v.currentTime = media.currentTime || 0; }, { once: true });
          v.addEventListener('loadeddata', loaded, { once: true });
          if (v.poster) { const probe = new Image(); probe.onload = loaded; probe.src = v.poster; }
          stage.appendChild(v);
          if (!still) v.play().catch(() => {});
        } else {
          const img = new Image();
          const fallback = media.currentSrc || media.src;
          img.alt = media.alt;
          img.addEventListener('error', () => { if (img.src !== fallback) img.src = fallback; else loaded(); });
          img.addEventListener('load', () => {
            loaded();
            img.classList.toggle('can-zoom', img.naturalWidth > stage.clientWidth || img.naturalHeight > stage.clientHeight);
            placeSwitch();
          });
          img.addEventListener('click', (e) => {
            if (!img.classList.contains('can-zoom')) return;
            e.stopPropagation();
            zoom(e, img);
          });
          img.src = fullSrc(media);
          stage.appendChild(img);
          // A still that exists in both renderers gets the switch, and the other version is fetched
          // now so switching is instant.
          const dual = Boolean(media.dataset.pt && media.dataset.rt);
          switcher.hidden = !dual;
          if (dual) {
            pressSwitch();
            switcher.style.visibility = 'hidden';
            new Image().src = media.dataset[rendererMode === 'pt' ? 'rt' : 'pt'].replace('assets/', 'assets/full/');
          }
        }
        caption.textContent = labelFor(el);
        count.textContent = `${index + 1} / ${items.length}`;
        // Fetch the neighbouring images now, so paging through them feels instant.
        [index - 1, index + 1].forEach((j) => {
          const n = items[(j + items.length) % items.length];
          const im = n.querySelector('video') ? null : n.querySelector('img');
          if (im) new Image().src = fullSrc(im);
        });
      };

      const open = (i) => {
        opener = document.activeElement;
        show(i);
        box.showModal();
        document.documentElement.style.overflow = 'hidden';
        document.dispatchEvent(new CustomEvent('viewer-open'));
        box.querySelector('[data-close]').focus();
      };

      box.addEventListener('close', () => {
        stage.replaceChildren();  // also stops a playing clip
        stage.classList.remove('is-loading');
        document.documentElement.style.overflow = '';
        document.dispatchEvent(new CustomEvent('viewer-close'));
        if (opener && opener.focus) opener.focus();
      });
      box.addEventListener('click', (e) => {
        if (swiped) { swiped = false; return; }
        const go = e.target.closest('[data-go]');
        if (go) { show(index + Number(go.dataset.go)); return; }
        // Anything but the photo or clip itself and the controls closes the viewer.
        if (e.target.closest('[data-close]') || !e.target.closest('img, video, button, .lightbox-switch')) box.close();
      });
      // While the viewer is open, the arrow keys page through images instead of changing project.
      box.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          show(index + (e.key === 'ArrowRight' ? 1 : -1));
        }
      });
      // A sideways swipe on a touch screen pages too.
      let startX = null;
      stage.addEventListener('pointerdown', (e) => {
        startX = e.pointerType !== 'mouse' && !box.classList.contains('is-zoomed') ? e.clientX : null;
      });
      stage.addEventListener('pointerup', (e) => {
        if (startX === null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) { swiped = true; show(index + (dx < 0 ? 1 : -1)); }
      });

      items.forEach((el, i) => {
        el.classList.add('zoomable');
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.insertAdjacentHTML('beforeend', `<span class="zoom-hint">${icon}<span>View larger</span></span>`);
        el.addEventListener('click', () => open(i));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
        });
      });
      nameItems();
      document.addEventListener('renderer-change', nameItems);
    }
  }

  // Slideshows: one large frame at a time. The active label's progress line is the timer; when it
  // fills, the next frame shows. It pauses while the pointer is over it, while it has keyboard focus,
  // while it is off screen, while the viewer is open, or when someone presses Pause.
  document.querySelectorAll('.carousel').forEach((car) => {
    const slides = [...car.querySelectorAll('.carousel-slide')];
    const tabs = [...car.querySelectorAll('.carousel-tabs button')];
    const pause = car.querySelector('.carousel-pause');
    let current = 0;
    const go = (i) => {
      current = (i + slides.length) % slides.length;
      slides.forEach((sl, j) => {
        sl.classList.toggle('is-active', j === current);
        sl.setAttribute('aria-hidden', String(j !== current));
      });
      tabs.forEach((t, j) => t.setAttribute('aria-current', String(j === current)));
      // Keep the chosen label in view when the row scrolls on a narrow screen.
      const t = tabs[current], row = t.closest('.carousel-tabs');
      if (row.scrollWidth > row.clientWidth) row.scrollLeft = t.parentElement.offsetLeft - (row.clientWidth - t.parentElement.offsetWidth) / 2;
      markEdges(row);
    };
    const tabRow = car.querySelector('.carousel-tabs');
    tabRow.addEventListener('scroll', () => markEdges(tabRow), { passive: true });
    tabs.forEach((t, j) => t.addEventListener('click', () => go(j)));
    car.querySelector('.carousel-step.prev').addEventListener('click', () => go(current - 1));
    car.querySelector('.carousel-step.next').addEventListener('click', () => go(current + 1));
    car.querySelector('.carousel-tabs').addEventListener('animationend', (e) => {
      if (e.animationName === 'carousel-progress') go(current + 1);
    });

    if (still) car.classList.add('is-static');
    pause.addEventListener('click', () => {
      const paused = car.classList.toggle('is-paused');
      pause.textContent = paused ? 'Play' : 'Pause';
      pause.setAttribute('aria-pressed', String(paused));
    });
    if (matchMedia('(hover: hover)').matches) {
      car.addEventListener('pointerenter', () => car.classList.add('is-hovered'));
      car.addEventListener('pointerleave', () => car.classList.remove('is-hovered'));
    }
    car.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) car.classList.add('is-focused'); });
    car.addEventListener('focusout', (e) => { if (!car.contains(e.relatedTarget)) car.classList.remove('is-focused'); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => car.classList.toggle('is-offscreen', !en.isIntersecting), { threshold: 0.35 }).observe(car);
    }
    document.addEventListener('viewer-open', () => car.classList.add('is-viewing'));
    document.addEventListener('viewer-close', () => car.classList.remove('is-viewing'));

    // Arrow keys move through the frames while focus is inside the slideshow (not between projects).
    car.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        go(current + (e.key === 'ArrowRight' ? 1 : -1));
      }
    });
    // A sideways swipe moves too; a swipe is not a tap, so it doesn't open the viewer.
    const frame = car.querySelector('.carousel-frame');
    let startX = null;
    frame.addEventListener('pointerdown', (e) => { startX = e.clientX; });
    frame.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) {
        go(current + (dx < 0 ? 1 : -1));
        // Swallow the click a mouse drag produces, but only right after it: touch swipes don't
        // always produce one, and the next real tap must still open the viewer.
        const swallow = (c) => c.stopPropagation();
        frame.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => frame.removeEventListener('click', swallow, { capture: true }), 350);
      }
    });
    go(0);
  });

  // Phones: the project links scroll sideways. Start with the current one in view.
  const nav = document.querySelector('.topbar nav');
  if (nav) {
    const current = nav.querySelector('[aria-current="page"]');
    const edge = () => markEdges(nav);
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
