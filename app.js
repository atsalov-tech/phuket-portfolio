const tg = window.Telegram?.WebApp;

const CONFIG = {
  // Рабочий Telegram username без символа @
  MANAGER_TELEGRAM: "FAMILIAHOLIDAY",
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
  selectedItem: null,
  pdfOpen: false,
  activePdfUrl: "",
  activePdfName: ""
};

let videoObserver = null;
let activePdfRenderToken = 0;
let activeBlobUrls = [];
const ZOOM_LEVELS = [100, 160, 220];
let pdfZoomIdx = 0;

// Настройка воркера PDF.js через Blob для стабильной работы в iOS/Android WebView
if (window.pdfjsLib) {
  try {
    const workerBlob = new Blob(
      ['importScripts("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js");'],
      { type: "application/javascript" }
    );
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
  } catch (_) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
}

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
    if (state.pdfOpen) {
      closePdfViewer();
    } else {
      closeDetail();
    }
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
          src="${item.teaserVideo || ""}"
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
      <span class="pdf-tag">Read PDF</span>
    </button>
  `).join("");

  const videoSrc = item.overviewVideo || item.teaserVideo || "";
  const content = document.getElementById("detail-content");
  content.innerHTML = `
    <div class="detail-video-wrap" id="detail-media-wrap">
      <video
        class="detail-video"
        id="detail-video-el"
        src="${videoSrc}"
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

  // Скрываем пустой плеер с ошибкой на iOS, если видео и постер еще не загружены
  const detailVideoEl = document.getElementById("detail-video-el");
  if (detailVideoEl) {
    detailVideoEl.addEventListener("error", () => {
      if (item.poster) {
        detailVideoEl.removeAttribute("controls");
      } else {
        const wrap = document.getElementById("detail-media-wrap");
        if (wrap) wrap.style.display = "none";
      }
    });
  }

  // Открываем встроенный просмотрщик PDF без выхода из витрины
  content.querySelectorAll(".btn-pdf").forEach(btn => {
    btn.addEventListener("click", () => {
      haptic("light");
      const pdfObj = item.pdfs[Number(btn.dataset.pdfIdx)];
      openPdfViewer(pdfObj.url, pdfObj.label);
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
  if (state.pdfOpen) {
    closePdfViewer();
  }
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

function clearPdfBlobs() {
  activeBlobUrls.forEach(u => URL.revokeObjectURL(u));
  activeBlobUrls = [];
}

// Встроенный полноэкранный просмотр PDF внутри Mini App
async function openPdfViewer(rawUrl, titleLabel) {
  const absoluteUrl = new URL(rawUrl, window.location.href).href;
  const rawName = decodeURIComponent(absoluteUrl.split("/").pop() || "Presentation.pdf");

  state.pdfOpen = true;
  state.activePdfUrl = absoluteUrl;
  state.activePdfName = rawName.endsWith(".pdf") ? rawName : `${rawName}.pdf`;
  pdfZoomIdx = 0;

  const pdfOverlay = document.getElementById("pdf-overlay");
  const pagesInner = document.getElementById("pdf-pages-inner");
  const titleEl = document.getElementById("pdf-doc-title");
  const statusEl = document.getElementById("pdf-page-status");
  const zoomBtn = document.getElementById("pdf-zoom-btn");

  titleEl.textContent = titleLabel || "Presentation";
  statusEl.textContent = "Loading brochure...";
  zoomBtn.textContent = "1x";
  pagesInner.style.width = "100%";
  clearPdfBlobs();
  pagesInner.innerHTML = `<div class="pdf-loading-msg">Loading presentation pages...</div>`;

  pdfOverlay.classList.add("open");
  pdfOverlay.setAttribute("aria-hidden", "false");

  if (tg?.disableVerticalSwipes) tg.disableVerticalSwipes();
  if (tg?.BackButton) tg.BackButton.show();

  const currentToken = ++activePdfRenderToken;

  if (!window.pdfjsLib) {
    pagesInner.innerHTML = `
      <div class="pdf-loading-msg">
        Preview module unavailable.<br/><br/>
        <button type="button" class="pdf-nav-btn" id="pdf-fallback-open">Open PDF Externally</button>
      </div>
    `;
    document.getElementById("pdf-fallback-open")?.addEventListener("click", saveOrOpenPdf);
    return;
  }

  try {
    const loadingTask = window.pdfjsLib.getDocument({
      url: absoluteUrl,
      cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
      cMapPacked: true
    });
    const pdfDoc = await loadingTask.promise;
    if (currentToken !== activePdfRenderToken) return;

    const totalPages = pdfDoc.numPages;
    pagesInner.innerHTML = "";
    statusEl.textContent = `1 / ${totalPages} pages`;

    // Рендерим постранично в JPEG-картинки, чтобы не превышать лимит памяти Canvas на iPhone в длинных PDF
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (currentToken !== activePdfRenderToken) return;
      statusEl.textContent =
        pageNum < totalPages
          ? `Rendering ${pageNum} / ${totalPages}...`
          : `${totalPages} ${totalPages === 1 ? "page" : "pages"}`;

      const page = await pdfDoc.getPage(pageNum);
      if (currentToken !== activePdfRenderToken) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const targetWidth = Math.min(window.innerWidth * 2.2, 1600);
      const renderScale = Math.max(1.5, targetWidth / baseViewport.width);
      const viewport = page.getViewport({ scale: renderScale });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
      // Освобождаем память Canvas сразу после рендера страницы
      canvas.width = 0;
      canvas.height = 0;

      if (currentToken !== activePdfRenderToken) return;

      if (blob) {
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrls.push(blobUrl);

        const card = document.createElement("div");
        card.className = "pdf-page-card";
        const img = document.createElement("img");
        img.className = "pdf-page-img";
        img.src = blobUrl;
        img.alt = `Page ${pageNum}`;
        card.appendChild(img);
        pagesInner.appendChild(card);
      }
    }
  } catch (err) {
    console.error("PDF viewer error:", err);
    if (currentToken !== activePdfRenderToken) return;
    statusEl.textContent = "Tap Save to view";
    pagesInner.innerHTML = `
      <div class="pdf-loading-msg">
        Could not load PDF inside viewer.<br/><br/>
        <button type="button" class="pdf-nav-btn" id="pdf-fallback-open">⬇ Download / Open PDF</button>
      </div>
    `;
    document.getElementById("pdf-fallback-open")?.addEventListener("click", saveOrOpenPdf);
  }
}

function closePdfViewer() {
  if (!state.pdfOpen) return;
  haptic("light");
  state.pdfOpen = false;
  activePdfRenderToken++;

  const pdfOverlay = document.getElementById("pdf-overlay");
  pdfOverlay.classList.remove("open");
  pdfOverlay.setAttribute("aria-hidden", "true");

  document.getElementById("pdf-pages-inner").innerHTML = "";
  clearPdfBlobs();

  if (tg?.enableVerticalSwipes) tg.enableVerticalSwipes();

  // Если карточка объекта под низом открыта — оставляем кнопку Back активной для возврата в каталог
  if (state.selectedItem && document.getElementById("detail-overlay").classList.contains("open")) {
    if (tg?.BackButton) tg.BackButton.show();
  } else if (tg?.BackButton) {
    tg.BackButton.hide();
  }
}

function togglePdfZoom() {
  haptic("selection");
  pdfZoomIdx = (pdfZoomIdx + 1) % ZOOM_LEVELS.length;
  const pct = ZOOM_LEVELS[pdfZoomIdx];
  const inner = document.getElementById("pdf-pages-inner");
  const zoomBtn = document.getElementById("pdf-zoom-btn");

  inner.style.width = `${pct}%`;
  inner.style.maxWidth = pct === 100 ? "900px" : "none";
  zoomBtn.textContent = pct === 100 ? "1x" : pct === 160 ? "1.6x" : "2.2x";
}

function saveOrOpenPdf() {
  haptic("medium");
  if (!state.activePdfUrl) return;
  if (tg?.downloadFile) {
    tg.downloadFile({
      url: state.activePdfUrl,
      file_name: state.activePdfName
    });
  } else if (tg?.openLink) {
    tg.openLink(state.activePdfUrl, { try_instant_view: false });
  } else {
    window.open(state.activePdfUrl, "_blank", "noopener");
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
document.getElementById("pdf-back-btn").addEventListener("click", closePdfViewer);
document.getElementById("pdf-zoom-btn").addEventListener("click", togglePdfZoom);
document.getElementById("pdf-download-btn").addEventListener("click", saveOrOpenPdf);

initTelegram();
loadCatalog();
