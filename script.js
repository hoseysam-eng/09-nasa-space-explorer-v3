// NASA Space Explorer - Beginner-friendly JS
// We fetch images, build a gallery, and show a modal with details.

// 1) API endpoints and simple settings
// We try NASA's live API first and fall back to a classroom JSON file if needed.
const NASA_API_KEY = 'DEMO_KEY'; // Replace with your own key for higher limits
// Build URL per request so we can change the count dynamically
const MOBILE_MAX_WIDTH = 480;
function getInitialCount() {
  return 9;
}
// Show this many cards max at once
const PAGE_SIZE = 9;
function buildApodUrl(count) {
  return `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&count=${count}&thumbs=true`;
}
const APOD_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/GCA-Classroom/apod/data.json';

// Network helpers: fetch with timeout so slow endpoints don't stall the UI.
async function fetchWithTimeout(resource, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(resource, { signal: controller.signal, ...options });
    return res;
  } finally {
    clearTimeout(id);
  }
}

// 2b) Thumbnail proxy to serve smaller, compressed images for the gallery
// Many APOD images are very large (2–20MB). To make the gallery snappy, we proxy
// thumbnails through a free resizing CDN. We still use the original, full image
// in the modal for best quality.
const USE_IMAGE_PROXY = true; // set to false to disable thumbnail proxying
const IMG_PROXY_BASE = 'https://images.weserv.nl/';

// Build a proxy URL for a given image at a target width; enable WebP when possible.
function proxyThumb(url, width = 640) {
  try {
    if (!url || !USE_IMAGE_PROXY) return url;
    // images.weserv.nl expects the remote URL as a query param; we strip protocol
    // to avoid mixed-content issues and let the CDN fetch over HTTPS.
    const remote = url.replace(/^https?:\/\//, '');
    // q=70 keeps good quality with big byte savings; we=1 enables WebP when supported.
    return `${IMG_PROXY_BASE}?url=${encodeURIComponent(remote)}&w=${width}&q=70&we=1`;
  } catch (_) {
    return url;
  }
}

// Build a srcset string for responsive thumbnails.
function buildThumbSrcset(url) {
  if (!url || !USE_IMAGE_PROXY) return '';
  const widths = [320, 480, 640, 960];
  return widths.map(w => `${proxyThumb(url, w)} ${w}w`).join(', ');
}

// 2) Grab important DOM elements
const galleryEl = document.getElementById('gallery');
const getBtn = document.getElementById('getImageBtn');
const loadingEl = document.getElementById('loading');

// Modal elements
const modalEl = document.getElementById('modal');
const modalCloseBtn = document.getElementById('modalClose');
const modalImg = document.getElementById('modalImage');
const modalTitle = document.getElementById('modalTitle');
const modalDate = document.getElementById('modalDate');
const modalDesc = document.getElementById('modalDesc');
const modalContentEl = document.querySelector('.modal-content'); // added: swipe target

// Random fact element
const factText = document.getElementById('factText');

// We'll store the latest items here so the modal can use them.
let currentItems = [];
let modalIndex = -1; // track which item is open in the modal

// Add "Load More" button
const loadMoreBtn = document.getElementById('loadMoreBtn');

// Simple 5-minute cache so repeat clicks are instant
const CACHE_KEY = 'apodCacheV1';
function getCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}');
    if (parsed && Array.isArray(parsed.items) && Date.now() - parsed.ts < 5 * 60 * 1000) {
      return parsed.items;
    }
  } catch (_) {}
  return null;
}
function setCache(items) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items }));
  } catch (_) {}
}

// 3) Random Space Facts
// Keep this simple: an array of strings, pick one at random on page load.
const spaceFacts = [
	'A day on Venus is longer than a year on Venus.',
	'Neutron stars can spin 600 times per second.',
	'There are more trees on Earth than stars in the Milky Way.',
	'Space is completely silent—sound needs a medium to travel.',
	'Jupiter’s Great Red Spot is a giant storm larger than Earth.',
	'A spoonful of a neutron star would weigh about a billion tons.',
	'One day on Mercury lasts 59 Earth days.',
	'Saturn could float in water because it’s mostly gas.',
	'Mars has the largest volcano in the solar system—Olympus Mons.',
	'The footprints on the Moon could last millions of years.',
	'The Sun accounts for 99.86% of the mass in our solar system.',
	'There are more than 200 billion galaxies in the observable universe.'
];

function showRandomFact() {
	// Pick a random index and show the fact text
	const idx = Math.floor(Math.random() * spaceFacts.length);
	factText.textContent = spaceFacts[idx];
}

// 4) Small helpers to show/hide loading state
function showLoading() {
	loadingEl.hidden = false;
}

function hideLoading() {
	loadingEl.hidden = true;
}

// 5) Format dates in a friendlier way (e.g., 2024-01-05 -> Jan 5, 2024)
function formatDate(dateStr) {
	try {
		const d = new Date(dateStr);
		const opts = { year: 'numeric', month: 'short', day: 'numeric' };
		return d.toLocaleDateString(undefined, opts);
	} catch (e) {
		return dateStr;
	}
}

// 6) Normalize APOD items to a consistent shape
// We only keep items we can show as images. If an item is a video, we try thumbnail_url.
function normalizeItems(data) {
	// Ensure we have an array
	const list = Array.isArray(data) ? data : [data];

	return list
		.map(item => {
			const isImage = item.media_type === 'image';
			const hasThumb = !!item.thumbnail_url;
      const thumb = hasThumb ? item.thumbnail_url : (item.url || item.hdurl);
			const full = item.hdurl || item.url || thumb;
			if (!thumb) return null;
      // Use a resized, compressed thumbnail for the gallery to load faster
      const thumbSrc = USE_IMAGE_PROXY ? proxyThumb(thumb, 640) : thumb;
      const thumbSrcset = USE_IMAGE_PROXY ? buildThumbSrcset(thumb) : '';
      const thumbSizes = '(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw';
			return {
				title: item.title || 'Untitled',
				date: item.date || '',
				explanation: item.explanation || '',
        thumb: thumbSrc,        // small, proxied image for gallery
        thumbSrcset,  // responsive variants via proxy
        thumbSizes,   // responsive size hints
				full          // large image for modal
			};
		})
		.filter(Boolean);
}

// Helper: remove duplicates (by APOD date or full image URL) against existing items
function dedupeItems(items, existing = []) {
  // Build a Set of keys we've already seen (dates are unique per APOD)
  const seen = new Set(existing.map(i => i.date || i.full));
  const unique = [];
  for (const item of items) {
    const key = item.date || item.full;
    if (seen.has(key)) continue; // skip duplicates
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

// 7) Fetch APOD items - try live API then fallback
async function fetchApod(count = getInitialCount(), options = { mode: 'initial' }) {
  const mode = options?.mode || 'initial';
  const existing = options?.existing || [];

  if (mode === 'initial') {
    showLoading();
    galleryEl.innerHTML = '';
    showSkeletons(count);
  }

  try {
    const res = await fetchWithTimeout(buildApodUrl(count), {}, 10000);
    if (!res || !res.ok) throw new Error('NASA API error or timeout');
    const data = await res.json();
    let items = normalizeItems(data);
    // Remove any accidental duplicates inside the batch
    items = dedupeItems(items);
    // If appending, remove ones already in gallery
    if (mode === 'append') items = dedupeItems(items, existing);
    if (items.length === 0) throw new Error('No unique image items from API');
    if (mode === 'initial') setCache(items);
    return items;
  } catch (err) {
    try {
      const res = await fetchWithTimeout(APOD_FALLBACK_URL, {}, 8000);
      if (!res || !res.ok) throw new Error('Fallback fetch failed');
      const data = await res.json();
      const shuffled = [...data].sort(() => Math.random() - 0.5);
      let items = normalizeItems(shuffled).slice(0, count);
      items = dedupeItems(items);
      if (mode === 'append') items = dedupeItems(items, existing);
      if (mode === 'initial') setCache(items);
      return items;
    } catch (e) {
      console.error('Fallback failed:', e);
      return [];
    }
  } finally {
    if (mode === 'initial') hideLoading();
  }
}

// Simple skeleton cards to show while waiting
function showSkeletons(count = PAGE_SIZE) {
	const skeletonHtml = Array.from({ length: count }).map(() => `
		<article class="gallery-item">
			<div class="skeleton" aria-hidden="true"></div>
			<p style="opacity:0">Loading...</p>
		</article>
	`).join('');
	galleryEl.innerHTML = skeletonHtml;
}

// Lazy-load: only set the real src when the image is near the viewport
function lazyLoadImages() {
  const imgs = galleryEl.querySelectorAll('img[data-src]');
  if (!('IntersectionObserver' in window)) {
    // Fallback: set src immediately
    imgs.forEach(img => {
      img.src = img.dataset.src;
      // Copy responsive data if present
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      if (img.dataset.sizes) img.sizes = img.dataset.sizes;
      img.removeAttribute('data-src');
      img.removeAttribute('data-srcset');
      img.removeAttribute('data-sizes');
      const p = img.dataset.priority;
      if (p) img.setAttribute('fetchpriority', p);
    });
    return;
  }
  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        if (img.dataset.srcset) img.srcset = img.dataset.srcset;
        if (img.dataset.sizes) img.sizes = img.dataset.sizes;
        const p = img.dataset.priority;
        if (p) img.setAttribute('fetchpriority', p);
        img.removeAttribute('data-src');
        img.removeAttribute('data-srcset');
        img.removeAttribute('data-sizes');
        observer.unobserve(img);
      }
    });
  }, { rootMargin: '200px' });
  imgs.forEach(img => io.observe(img));
}

// 8) Render the gallery cards
function renderGallery(items) {
  // Keep a copy so the modal can read details later
  currentItems = items;
  const visible = items.slice(-PAGE_SIZE);
  const startIndex = items.length - visible.length;

  if (!visible.length) {
    galleryEl.innerHTML = `
      <div class="placeholder">
        <div class="placeholder-icon">🛰️</div>
        <p>No images were returned. Please try again.</p>
      </div>
    `;
    return;
  }

  // Tiny transparent pixel as placeholder src to avoid immediate network request
  const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

  // Build HTML for all items
  const cards = visible.map((item, i) => {
    const globalIndex = startIndex + i;
    if (i === 0) {
      return `
        <article class="gallery-item" data-index="${globalIndex}" tabindex="0" aria-label="View details for ${item.title}">
          <img
            src="${item.thumb}"
            alt="${item.title}"
            loading="eager"
            decoding="async"
            fetchpriority="high"
            srcset="${item.thumbSrcset}"
            sizes="${item.thumbSizes}"
            width="640"
            height="360"
          />
          <p><strong>${item.title}</strong><br><span>${formatDate(item.date)}</span></p>
        </article>
      `;
    }
    return `
      <article class="gallery-item" data-index="${globalIndex}" tabindex="0" aria-label="View details for ${item.title}">
        <img
          src="${transparentPixel}"
          data-src="${item.thumb}"
          data-srcset="${item.thumbSrcset}"
          data-sizes="${item.thumbSizes}"
          alt="${item.title}"
          loading="lazy"
          decoding="async"
          width="640"
          height="360"
        />
        <p><strong>${item.title}</strong><br><span>${formatDate(item.date)}</span></p>
      </article>
    `;
  }).join('');

  galleryEl.innerHTML = cards;

  const cardEls = galleryEl.querySelectorAll('.gallery-item');
  cardEls.forEach(card => {
    card.addEventListener('click', () => {
      const idx = Number(card.getAttribute('data-index'));
      openModalByIndex(idx);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const idx = Number(card.getAttribute('data-index'));
        openModalByIndex(idx);
      }
    });
  });

  lazyLoadImages();
  if (loadMoreBtn) loadMoreBtn.hidden = false;
}

// Replace append with redraw of last PAGE_SIZE
function appendGallery(newItems) {
  if (!newItems || !newItems.length) return;
  currentItems = currentItems.concat(newItems);
  renderGallery(currentItems); // re-render limited view
}

// 9) Modal logic
function openModalByIndex(idx) {
  // Guard: ensure index is valid
  if (idx < 0 || idx >= currentItems.length) return;
  modalIndex = idx;
  const item = currentItems[idx];

  // Fill in the modal content
  modalImg.src = item.full;
  modalImg.alt = item.title;
  modalTitle.textContent = item.title;
  modalDate.textContent = formatDate(item.date);
  modalDesc.textContent = item.explanation;

  modalEl.setAttribute('aria-hidden', 'false');
  modalCloseBtn.focus();
}

// (Deprecated old openModal kept for clarity, could be removed)
// function openModal(item) { /* original implementation */ }

function closeModal() {
  modalEl.setAttribute('aria-hidden', 'true');
  modalImg.src = '';
  modalIndex = -1; // reset
}

// Close controls: X button, backdrop click, and Escape key
modalCloseBtn.addEventListener('click', closeModal);
modalEl.addEventListener('click', (e) => {
	if (e.target.classList.contains('modal-backdrop') || e.target.dataset.close === 'true') {
		closeModal();
	}
});
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && modalEl.getAttribute('aria-hidden') === 'false') {
		closeModal();
		return;
	}

  // Arrow navigation only when modal is open
  if (modalEl.getAttribute('aria-hidden') === 'false') {
    if (e.key === 'ArrowRight') {
      // Next (wrap around)
      const next = (modalIndex + 1) % currentItems.length;
      openModalByIndex(next);
    } else if (e.key === 'ArrowLeft') {
      // Previous (wrap around)
      const prev = (modalIndex - 1 + currentItems.length) % currentItems.length;
      openModalByIndex(prev);
    }
  }
});

// Touch swipe: allow left/right swipe to move between images when modal is open
let touchStartX = 0;
let touchStartY = 0;
let touchStartAt = 0;
const SWIPE_THRESHOLD = 40; // px needed to qualify as swipe
const SWIPE_TIME = 800;     // max ms for a quick swipe

if (modalContentEl) {
  modalContentEl.addEventListener('touchstart', (e) => {
    if (modalEl.getAttribute('aria-hidden') === 'true') return;
    if (!e.touches || e.touches.length !== 1) return; // single-finger only
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartAt = Date.now();
  }, { passive: true });

  modalContentEl.addEventListener('touchend', (e) => {
    if (modalEl.getAttribute('aria-hidden') === 'true') return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const dt = Date.now() - touchStartAt;

    // Horizontal, quick-enough swipe
    if (dt <= SWIPE_TIME && Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        // swipe left -> next
        const next = (modalIndex + 1) % currentItems.length;
        openModalByIndex(next);
      } else {
        // swipe right -> previous
        const prev = (modalIndex - 1 + currentItems.length) % currentItems.length;
        openModalByIndex(prev);
      }
    }
  }, { passive: true });
}

// 10) Wire up the main button
getBtn.addEventListener('click', async (e) => {
  // Hold Shift/Alt/Ctrl/Meta to bypass the 5-minute cache
  const bypassCache = e.shiftKey || e.altKey || e.ctrlKey || e.metaKey;
  if (!bypassCache) {
    const cached = getCache();
    if (cached) {
      renderGallery(cached);
      return;
    }
  }
  const items = await fetchApod(getInitialCount(), { mode: 'initial' });
  renderGallery(items);
});

// Load more small batch on demand to keep initial load fast
if (loadMoreBtn) {
  loadMoreBtn.addEventListener('click', async () => {
    // Increase batch size to improve chances of getting uniques
    const batchCount = PAGE_SIZE * 2;
    const prevText = loadMoreBtn.textContent;
    loadMoreBtn.textContent = 'Loading…';
    loadMoreBtn.disabled = true;

    let more = await fetchApod(batchCount, { mode: 'append', existing: currentItems });
    // Retry once if we got zero after dedupe (common with fallback dataset)
    if (!more.length) {
      try {
        more = await fetchApod(batchCount, { mode: 'append', existing: currentItems });
      } catch (_) {}
    }

    if (more.length) {
      appendGallery(more);
      setCache(currentItems);
      loadMoreBtn.textContent = prevText;
    } else {
      loadMoreBtn.textContent = 'No new images';
      setTimeout(() => { loadMoreBtn.textContent = prevText; }, 1500);
    }

    loadMoreBtn.disabled = false;
  });
}

// 11) On page load: show a random fact
showRandomFact();