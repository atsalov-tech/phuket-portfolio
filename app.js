const tg = window.Telegram?.WebApp;

const CONFIG = {
  // Рабочий Telegram username без символа @
  MANAGER_TELEGRAM: "FAMILIAHOLIDAY",
  // Ссылка на ваш профиль Instagram (вставьте ваш @username вместо заглушки)
  INSTAGRAM_URL: "https://www.instagram.com/familiaholiday/",
  BOT_APP_URL: "https://t.me/PhuketVillasCondo_bot/catalog",
  LOCATIONS: [
    "All",
    "Nai Harn / Rawai",
    "Chalong / Central",
    "Surin / Bangthao",
    "Nai Yang",
    "Royal Phuket Marina",
    "Catamaran / Yachts"
  ]
};

const I18N = {
  en: {
    brandSubtitle: "PHUKET PRIVATE PORTFOLIO",
    brandTitle: "Villas & Yachts",
    rent: "Rent",
    sale: "Sale",
    dealRent: "RENT",
    dealSale: "SALE",
    empty: "No listings in this category right now.",
    loadError: "Unable to load catalog data. Please try again.",
    readPdf: "Read PDF",
    contactBtn: "Request Details in Telegram",
    shareProperty: "🔗 Share / Copy Client Link",
    copied: "✓ Link copied!",
    pdfBack: "← Back",
    pdfSave: "⬇ Save",
    pdfLoading: "Loading brochure...",
    pdfLoadingPages: "Loading presentation pages...",
    pdfError: "Could not load PDF inside viewer.",
    pdfFallback: "⬇ Download / Open PDF",
    pdfNoModule: "Preview module unavailable.",
    pdfOpenExt: "Open PDF Externally",
    igFooterTitle: "Instagram • @familiaholiday",
    igFooterSub: "Videos, stories & daily Phuket updates",
    igFooterCta: "Open ↗",
    locations: {
      "All": "All",
      "Nai Harn / Rawai": "Nai Harn / Rawai",
      "Chalong / Central": "Chalong / Central",
      "Surin / Bangthao": "Surin / Bangthao",
      "Nai Yang": "Nai Yang",
      "Royal Phuket Marina": "Royal Phuket Marina",
      "Catamaran / Yachts": "Catamaran / Yachts"
    }
  },
  ru: {
    brandSubtitle: "ЧАСТНАЯ КОЛЛЕКЦИЯ ПХУКЕТ",
    brandTitle: "Виллы и яхты",
    rent: "Аренда",
    sale: "Продажа",
    dealRent: "АРЕНДА",
    dealSale: "ПРОДАЖА",
    empty: "В этой категории пока нет объектов.",
    loadError: "Не удалось загрузить каталог. Попробуйте еще раз.",
    readPdf: "Открыть PDF",
    contactBtn: "Уточнить детали в Telegram",
    shareProperty: "🔗 Отправить / скопировать ссылку",
    copied: "✓ Ссылка скопирована!",
    pdfBack: "← Назад",
    pdfSave: "⬇ Скачать",
    pdfLoading: "Загрузка брошюры...",
    pdfLoadingPages: "Загрузка страниц презентации...",
    pdfError: "Не удалось открыть PDF во встроенном окне.",
    pdfFallback: "⬇ Скачать / Открыть PDF",
    pdfNoModule: "Модуль просмотра недоступен.",
    pdfOpenExt: "Открыть PDF в браузере",
    igFooterTitle: "Наш Instagram • @familiaholiday",
    igFooterSub: "Видеообзоры, сторис и новинки Пхукета",
    igFooterCta: "Открыть ↗",
    locations: {
      "All": "Все",
      "Nai Harn / Rawai": "Най Харн / Раваи",
      "Chalong / Central": "Чалонг / Центр",
      "Surin / Bangthao": "Сурин / Бангтао",
      "Nai Yang": "Най Янг",
      "Royal Phuket Marina": "Royal Phuket Marina",
      "Catamaran / Yachts": "Катамараны / Яхты"
    }
  }
};

function detectInitialLang() {
  try {
    const saved = localStorage.getItem("phuket_lang");
    if (saved === "ru" || saved === "en") return saved;
  } catch (_) {}
  const tgLang = tg?.initDataUnsafe?.user?.language_code || navigator.language || "en";
  return tgLang.toLowerCase().startsWith("ru") ? "ru" : "en";
}

const state = {
  lang: detectInitialLang(),
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

function t(key) {
  return I18N[state.lang]?.[key] ?? I18N.en[key] ?? key;
}

function tLoc(loc) {
  return I18N[state.lang]?.locations?.[loc] ?? loc;
}

function locField(item, field) {
  if (state.lang === "ru" && item[`${field}_ru`]) {
    return item[`${field}_ru`];
  }
  return item[field];
}

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

function applyLanguageUI() {
  document.documentElement.lang = state.lang;
  document.getElementById("brand-subtitle").textContent = t("brandSubtitle");
  document.getElementById("brand-title").textContent = t("brandTitle");
  document.getElementById("label-rent").textContent = t("rent");
  document.getElementById("label-sale").textContent = t("sale");
  document.getElementById("pdf-back-btn").textContent = t("pdfBack");
  document.getElementById("pdf-download-btn").textContent = t("pdfSave");
  document.getElementById("ig-footer-title").textContent = t("igFooterTitle");
  document.getElementById("ig-footer-sub").textContent = t("igFooterSub");
  document.getElementById("ig-footer-cta").textContent = t("igFooterCta");

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === state.lang);
  });

  renderFilters();
  renderFeed();

  if (state.selectedItem && document.getElementById("detail-overlay").classList.contains("open")) {
    openDetail(state.selectedItem, true);
  }
}

function setLanguage(lang) {
  if (state.lang === lang) return;
  haptic("selection");
  state.lang = lang;
  try {
    localStorage.setItem("phuket_lang", lang);
  } catch (_) {}
  applyLanguageUI();
}

// Загрузка базы объектов
async function loadCatalog() {
  try {
    const res = await fetch(`./data.json?v=${[invalid URL]()}`);
    const data = await res.json();
    state.items = data.items || [];
    updateDealCounts();
    const startParam = tg?.initDataUnsafe?.start_param || new URLSearchParams([invalid URL]).get("startapp");
    if (startParam) {
      const target = state.items.find(i => [invalid URL] === startParam);
      if (target) {
        state.activeDeal = target.dealType;
        document.querySelectorAll(".deal-tab").forEach(tab => {
          tab.classList.toggle("active", [invalid URL] === target.dealType);
        });
      }
    }
    applyLanguageUI();
    if (startParam) {
      const target = state.items.find(i => [invalid URL] === startParam);
      if (target) openDetail(target, true);
    }
  } catch (err) {
    document.getElementById("catalog-feed").innerHTML =
      `<div class="empty-state">${t("loadError")}</div>`;
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
  container.innerHTML = [invalid URL](loc => `
    <button
      type="button"
      class="filter-chip ${state.activeLocation === loc ? "active" : ""}"
      data-location="${loc}"
    >${tLoc(loc)}</button>
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
      const video = [invalid URL];
      if (entry.isIntersecting) {
        video.muted = true;
        [invalid URL]().catch(() => {});
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
    feed.innerHTML = `<div class="empty-state">${t("empty")}</div>`;
    return;
  }

  feed.innerHTML = [invalid URL](item => `
    <article class="property-card" data-id="${[invalid URL]}">
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
        <span class="location-badge">${tLoc(item.location)}</span>
      </div>
      <div class="card-body">
        <div class="card-header-row">
          <h2 class="card-title">${locField(item, "title")}</h2>
          <span class="card-price">${locField(item, "price")}</span>
        </div>
        <p class="card-tagline">${locField(item, "tagline")}</p>
      </div>
    </article>
  `).join("");

  feed.querySelectorAll(".property-card").forEach(card => {
    card.addEventListener("click", () => {
      const selected = state.items.find(i => [invalid URL] === [invalid URL]);
      if (selected) openDetail(selected);
    });
  });

  setupVideoObserver();
}

// Экран детальной карточки
function openDetail(item, skipHaptic = false) {
  if (!skipHaptic) haptic("medium");
  state.selectedItem = item;

  // Ставим фоновую ленту на паузу
  document.querySelectorAll(".card-video").forEach(v => v.pause());

  const specsList = (state.lang === "ru" && item.specs_ru) ? item.specs_ru : (item.specs || []);
  const specsHtml = [invalid URL](spec => `
    <div class="spec-box">
      <span class="spec-label">${spec.label}</span>
      <span class="spec-value">${spec.value}</span>
    </div>
  `).join("");

  const pdfsHtml = (item.pdfs || []).map((pdf, idx) => `
    <button type="button" class="btn-pdf" data-pdf-idx="${idx}">
      <span>📄 ${(state.lang === "ru" && pdf.label_ru) ? pdf.label_ru : pdf.label}</span>
      <span class="pdf-tag">${t("readPdf")}</span>
    </button>
  `).join("");

  const videoSrc = item.overviewVideo || item.teaserVideo || "";
  const dealText = item.dealType === "rent" ? t("dealRent") : t("dealSale");
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
      <div class="detail-location">${tLoc(item.location)} • ${dealText}</div>
      <h2 class="detail-title">${locField(item, "title")}</h2>
      <div class="detail-price">${locField(item, "price")}</div>
      <p class="detail-summary">${locField(item, "summary")}</p>

      <div class="specs-grid">${specsHtml}</div>

      <div class="actions-stack">
        ${pdfsHtml}
        <button type="button" class="btn-share" id="btn-share-item">
          ${t("shareProperty")}
        </button>
        <button type="button" class="btn-contact" id="btn-direct-tg">
          ${t("contactBtn")}
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
      const label = (state.lang === "ru" && pdfObj.label_ru) ? pdfObj.label_ru : pdfObj.label;
      openPdfViewer(pdfObj.url, label);
    });
  });

  // Кнопка «Поделиться / Скопировать ссылку» для клиента
  const shareBtn = document.getElementById("btn-share-item");
  if (shareBtn) {
    shareBtn.addEventListener("click", () => {
      const shareUrl = `${[invalid URL]_APP_URL}?startapp=${encodeURIComponent([invalid URL])}`;
      shareOrCopyLink(shareUrl, locField(item, "title"), shareBtn);
    });
  }

  // Прямая связь с автоподстановкой названия объекта
  document.getElementById("btn-direct-tg").addEventListener("click", () => {
    haptic("medium");
    contactManager(item);
  });

  const overlay = document.getElementById("detail-overlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  if (tg?.BackButton) [invalid URL]();
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
  statusEl.textContent = t("pdfLoading");
  zoomBtn.textContent = "1x";
  pagesInner.style.width = "100%";
  clearPdfBlobs();
  pagesInner.innerHTML = `<div class="pdf-loading-msg">${t("pdfLoadingPages")}</div>`;

  pdfOverlay.classList.add("open");
  pdfOverlay.setAttribute("aria-hidden", "false");

  if (tg?.disableVerticalSwipes) tg.disableVerticalSwipes();
  if (tg?.BackButton) [invalid URL]();

  const currentToken = ++activePdfRenderToken;

  if (!window.pdfjsLib) {
    pagesInner.innerHTML = `
      <div class="pdf-loading-msg">
        ${t("pdfNoModule")}<br/><br/>
        <button type="button" class="pdf-nav-btn" id="pdf-fallback-open">${t("pdfOpenExt")}</button>
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
    statusEl.textContent = `1 / ${totalPages}`;

    // Рендерим постранично в JPEG-картинки, чтобы не превышать лимит памяти Canvas на iPhone в длинных PDF
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      if (currentToken !== activePdfRenderToken) return;
      statusEl.textContent =
        pageNum < totalPages
          ? `${pageNum} / ${totalPages}...`
          : (state.lang === "ru" ? `${totalPages} стр.` : `${totalPages} ${totalPages === 1 ? "page" : "pages"}`);

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
    statusEl.textContent = state.lang === "ru" ? "Нажмите Скачать" : "Tap Save to view";
    pagesInner.innerHTML = `
      <div class="pdf-loading-msg">
        ${t("pdfError")}<br/><br/>
        <button type="button" class="pdf-nav-btn" id="pdf-fallback-open">${t("pdfFallback")}</button>
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
    if (tg?.BackButton) [invalid URL]();
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

async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {}
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

async function shareOrCopyLink(url, title, btnEl) {
  if (!url) return;
  haptic("medium");
  const copied = await copyToClipboard(url);
  if (copied && btnEl) {
    const prev = btnEl.textContent;
    btnEl.textContent = [invalid URL] === "pdf-share-btn" ? "✓" : t("copied");
    btnEl.classList.add("copied");
    setTimeout(() => {
      btnEl.textContent = prev;
      btnEl.classList.remove("copied");
    }, 2000);
  }
  if (navigator.share) {
    try {
      await navigator.share({ title: title || document.title, url });
    } catch (_) {}
  }
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
    [invalid URL](state.activePdfUrl, "_blank", "noopener");
  }
}

function openInstagram() {
  haptic("light");
  if (tg?.openLink) {
    tg.openLink(CONFIG.INSTAGRAM_URL, { try_instant_view: false });
  } else {
    [invalid URL](CONFIG.INSTAGRAM_URL, "_blank", "noopener");
  }
}

// Открытие чата в Telegram с готовым текстом запроса
function contactManager(item) {
  const title = locField(item, "title");
  const price = locField(item, "price");
  const loc = tLoc(item.location);

  let message;
  if (state.lang === "ru") {
    const dealLabel = [invalid URL]Type === "rent" ? "Аренда / Чартер" : "Покупка";
    message = `Здравствуйте! Интересует объект "${title}" (${dealLabel}, ${loc} — ${price}). Подскажите, пожалуйста, доступность и детали.`;
  } else {
    const dealLabel = item.dealType === "rent" ? "Rent / Charter" : "Purchase";
    message = `Hello! I'm interested in "${title}" (${dealLabel}, ${loc} — ${price}). Please share availability and details.`;
  }

  const tgUrl = `[invalid URL]`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(tgUrl);
  } else {
    [invalid URL](tgUrl, "_blank", "noopener");
  }
}

// Слушатели верхнего переключателя Rent / Sale
document.querySelectorAll(".deal-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    const deal = [invalid URL];
    if (state.activeDeal === deal) return;
    haptic("selection");
    state.activeDeal = deal;

    document.querySelectorAll(".deal-tab").forEach(t => t.classList.toggle("active", t === tab));
    renderFeed();
  });
});

document.querySelectorAll(".lang-btn").forEach(btn => {
  btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
});

document.getElementById("btn-instagram").addEventListener("click", openInstagram);
document.getElementById("ig-footer-card").addEventListener("click", openInstagram);
document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("pdf-back-btn").addEventListener("click", closePdfViewer);
document.getElementById("pdf-share-btn").addEventListener("click", (e) => {
  shareOrCopyLink(state.activePdfUrl, state.activePdfName, e.currentTarget);
});
document.getElementById("pdf-zoom-btn").addEventListener("click", togglePdfZoom);
document.getElementById("pdf-download-btn").addEventListener("click", saveOrOpenPdf);

initTelegram();
loadCatalog();
