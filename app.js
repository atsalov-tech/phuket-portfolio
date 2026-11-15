const tg = window.Telegram?.WebApp;

const CONFIG = {
  // Рабочий Telegram username без символа @
  MANAGER_TELEGRAM: "prometheus_privat",
  LOCATIONS: [
    "All",
    "Nai Harn / Rawai",
    "Chalong / Central",
    "Surin / Bangthao",
    "Nai Yang",
    "Catamaran / Yachts"
  ]
};

const state = {
  items: [],
  activeDeal: "rent",      // 'rent' | 'sale'
  activeLocation: "All",
  selectedItem: null
};

let videoObserver = null;

// Безопасный вызов тактильного отклика Telegram
function haptic(type = "light") {
  if (!tg?.HapticFeedback) return;
  if (type === "selection") {
    tg.HapticFeedback.selectionChanged();
  } else {
    tg.HapticFeedback.impactOccurred(type);
  }
}

// Инициализация Telegram Mini App
function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  if (tg.setHeaderColor) tg.setHeaderColor("#0e1013");
  if (tg.setBackgroundColor) tg.setBackgroundColor("#0e1013");

  tg.BackButton.onClick(() => {
    closeDetail();
  });
}

// Загрузка базы объектов
async function loadCatalog() {
  try {
    const res = await fetch(`./data.json?v=${Date.now()}`);
    const data = await res.json();
    state.items = data.items || [];
    updateDealCounts();
    renderFilters();
    renderFeed();
  } catch (err) {
    document.getElementById("catalog-feed").innerHTML =
      `<div class="empty-state">Unable to load catalog data. Please try again.</div>`;
    console.error("Catalog load error:", err);
  }
}

function updateDealCounts() {
  const rentCount = state.items.filter(i => i.dealType === "rent").length;
  const saleCount = state.items.filter(i => i.dealType === "sale").length;
  document.getElementById("count-rent").textContent = rentCount;
  document.getElementById("count-sale").textContent = saleCount;
}

function renderFilters() {
  const container = document.getElementById("location-filters");
  container.innerHTML = CONFIG.LOCATIONS.map(loc => `
    <button
      type="button"
      class="filter-chip ${state.activeLocation === loc ? "active" : ""}"
      data-location="${loc}"
    >${loc}</button>
  `).join("");

  container.querySelectorAll(".filter-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      const loc = btn.dataset.location;
      if (state.activeLocation === loc) return;
      haptic("selection");
      state.activeLocation = loc;
      renderFilters();
      renderFeed();
    });
  });
}

function setupVideoObserver() {
  if (videoObserver) videoObserver.disconnect();

  videoObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;
      if (entry.isIntersecting) {
        video.muted = true;
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, { threshold: 0.35 });

  document.querySelectorAll(".card-video").forEach(v => videoObserver.observe(v));
}

function renderFeed() {
  const feed = document.getElementById("catalog-feed");
  const filtered = state.items.filter(item => {
    const matchDeal = item.dealType === state.activeDeal;
    const matchLoc = state.activeLocation === "All" || item.location === state.activeLocation;
    return matchDeal && matchLoc;
  });

  if (!filtered.length) {
    feed.innerHTML = `<div class="empty-state">No listings in this category right now.</div>`;
    return;
  }

  feed.innerHTML = filtered.map(item => `
    <article class="property-card" data-id="${item.id}">
      <div class="media-wrap">
        <video
          class="card-video"
          src="${item.teaserVideo}"
          poster="${item.poster || ""}"
          muted
          loop
          playsinline
          webkit-playsinline
          preload="metadata"
        ></video>
        <span class="location-badge">${item.location}</span>
      </div>
      <div class="card-body">
        <div class="card-header-row">
          <h2 class="card-title">${item.title}</h2>
          <span class="card-price">${item.price}</span>
        </div>
        <p class="card-tagline">${item.tagline}</p>
      </div>
    </article>
  `).join("");

  feed.querySelectorAll(".property-card").forEach(card => {
    card.addEventListener("click", () => {
      const selected = state.items.find(i => i.id === card.dataset.id);
      if (selected) openDetail(selected);
    });
  });

  setupVideoObserver();
}

// Экран детальной карточки
function openDetail(item) {
  haptic("medium");
  state.selectedItem = item;

  // Ставим фоновую ленту на паузу
  document.querySelectorAll(".card-video").forEach(v => v.pause());

  const specsHtml = (item.specs || []).map(spec => `
    <div class="spec-box">
      <span class="spec-label">${spec.label}</span>
      <span class="spec-value">${spec.value}</span>
    </div>
  `).join("");

  const pdfsHtml = (item.pdfs || []).map((pdf, idx) => `
    <button type="button" class="btn-pdf" data-pdf-idx="${idx}">
      <span>📄 ${pdf.label}</span>
      <span class="pdf-tag">PDF ↗</span>
    </button>
  `).join("");

  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <div class="detail-video-wrap">
      <video
        class="detail-video"
        src="${item.overviewVideo || item.teaserVideo}"
        poster="${item.poster || ""}"
        autoplay
        muted
        loop
        playsinline
        webkit-playsinline
        controls
      ></video>
    </div>
    <div class="detail-body">
      <div class="detail-location">${item.location} • ${item.dealType.toUpperCase()}</div>
      <h2 class="detail-title">${item.title}</h2>
      <div class="detail-price">${item.price}</div>
      <p class="detail-summary">${item.summary}</p>

      <div class="specs-grid">${specsHtml}</div>

      <div class="actions-stack">
        ${pdfsHtml}
        <button type="button" class="btn-contact" id="btn-direct-tg">
          Request Details in Telegram
        </button>
      </div>
    </div>
  `;

  // Обработчики открытия PDF в системном браузере
  content.querySelectorAll(".btn-pdf").forEach(btn => {
    btn.addEventListener("click", () => {
      haptic("light");
      const pdfObj = item.pdfs[Number(btn.dataset.pdfIdx)];
      openExternalPdf(pdfObj.url);
    });
  });

  // Прямая связь с автоподстановкой названия объекта
  document.getElementById("btn-direct-tg").addEventListener("click", () => {
    haptic("medium");
    contactManager(item);
  });

  const overlay = document.getElementById("detail-overlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (tg?.BackButton) tg.BackButton.show();
}

function closeDetail() {
  haptic("light");
  const overlay = document.getElementById("detail-overlay");
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  // Останавливаем видео детального экрана
  const detailVideo = document.querySelector(".detail-video");
  if (detailVideo) detailVideo.pause();

  if (tg?.BackButton) tg.BackButton.hide();
  setupVideoObserver();
}

// Открытие PDF в нативном браузере для удобной пересылки
function openExternalPdf(rawUrl) {
  const absoluteUrl = new URL(rawUrl, window.location.href).href;
  if (tg?.openLink) {
    tg.openLink(absoluteUrl, { try_instant_view: false });
  } else {
    window.open(absoluteUrl, "_blank", "noopener");
  }
}

// Открытие чата в Telegram с готовым текстом запроса
function contactManager(item) {
  const dealLabel = item.dealType === "rent" ? "Rent / Charter" : "Purchase";
  const message = `Hello! I'm interested in "${item.title}" (${dealLabel}, ${item.location} — ${item.price}). Please share availability and details.`;
  const tgUrl = `https://t.me/${CONFIG.MANAGER_TELEGRAM}?text=${encodeURIComponent(message)}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(tgUrl);
  } else {
    window.open(tgUrl, "_blank", "noopener");
  }
}

// Слушатели верхнего переключателя Rent / Sale
document.querySelectorAll(".deal-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const deal = tab.dataset.deal;
    if (state.activeDeal === deal) return;
    haptic("selection");
    state.activeDeal = deal;

    document.querySelectorAll(".deal-tab").forEach(t => t.classList.toggle("active", t === tab));
    renderFeed();
  });
});

document.getElementById("detail-close").addEventListener("click", closeDetail);

initTelegram();
loadCatalog();
