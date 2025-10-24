// NASA Space Explorer - Beginner-friendly JS
// We fetch images, build a gallery, and show a modal with details.

// 1) API endpoints and simple settings
// We try NASA's live API first and fall back to a classroom JSON file if needed.
const NASA_API_KEY = 'DEMO_KEY'; // Replace with your own key for higher limits
const NASA_APOD_URL = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&count=12&thumbs=true`;
const APOD_FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/GCA-Classroom/apod/data.json';

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

// Random fact element
const factText = document.getElementById('factText');

// We'll store the latest items here so the modal can use them.
let currentItems = [];

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
			// APOD can be image or video
			const isImage = item.media_type === 'image';
			const hasThumb = !!item.thumbnail_url;
			const imageUrl = isImage ? (item.url || item.hdurl) : (hasThumb ? item.thumbnail_url : null);
			if (!imageUrl) return null; // we can’t display this item

			return {
				title: item.title || 'Untitled',
				date: item.date || '',
				explanation: item.explanation || '',
				url: imageUrl,
				hdurl: item.hdurl || item.url || imageUrl
			};
		})
		.filter(Boolean);
}

// 7) Fetch APOD items - try live API then fallback
async function fetchApod() {
	// Show the loading message and clear the gallery
	showLoading();
	galleryEl.innerHTML = '';

	try {
		const res = await fetch(NASA_APOD_URL);
		if (!res.ok) throw new Error('NASA API error');
		const data = await res.json();
		const items = normalizeItems(data);
		if (items.length === 0) throw new Error('No image items from API');
		return items;
	} catch (err) {
		// Fallback: use the classroom JSON
		try {
			const res = await fetch(APOD_FALLBACK_URL);
			const data = await res.json();
			// Shuffle and take 12 items for variety
			const shuffled = [...data].sort(() => Math.random() - 0.5);
			return normalizeItems(shuffled).slice(0, 12);
		} catch (e) {
			console.error('Fallback failed:', e);
			return [];
		}
	} finally {
		hideLoading();
	}
}

// 8) Render the gallery cards
function renderGallery(items) {
	// Keep a copy so the modal can read details later
	currentItems = items;

	if (!items || items.length === 0) {
		galleryEl.innerHTML = `
			<div class="placeholder">
				<div class="placeholder-icon">🛰️</div>
				<p>No images were returned. Please try again.</p>
			</div>
		`;
		return;
	}

	// Build HTML for all items
	const cards = items.map((item, index) => {
		return `
			<article class="gallery-item" data-index="${index}" tabindex="0" aria-label="View details for ${item.title}">
				<img src="${item.url}" alt="${item.title}" loading="lazy" />
				<p><strong>${item.title}</strong><br><span>${formatDate(item.date)}</span></p>
			</article>
		`;
	}).join('');

	galleryEl.innerHTML = cards;

	// Add click and keyboard handlers
	const cardEls = galleryEl.querySelectorAll('.gallery-item');
	cardEls.forEach(card => {
		card.addEventListener('click', () => {
			const idx = Number(card.getAttribute('data-index'));
			openModal(items[idx]);
		});
		card.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				const idx = Number(card.getAttribute('data-index'));
				openModal(items[idx]);
			}
		});
	});
}

// 9) Modal logic
function openModal(item) {
	// Fill in the modal content
	modalImg.src = item.hdurl || item.url;
	modalImg.alt = item.title;
	modalTitle.textContent = item.title;
	modalDate.textContent = formatDate(item.date);
	modalDesc.textContent = item.explanation;

	// Show modal
	modalEl.setAttribute('aria-hidden', 'false');
}

function closeModal() {
	modalEl.setAttribute('aria-hidden', 'true');
	// Clear image to free memory on some browsers
	modalImg.src = '';
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
	}
});

// 10) Wire up the main button
getBtn.addEventListener('click', async () => {
	showLoading();
	const items = await fetchApod();
	renderGallery(items);
});

// 11) On page load: show a random fact
showRandomFact();