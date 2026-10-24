/* app.js — usado por index.html (data-page="home") e admin.html (data-page="admin").
   ACESSO DO PAINEL: usuário e senha NÃO ficam no banco — ficam camuflados em
   dados.js (usuario embaralhado, senha como hash SHA-256; a senha real nunca
   aparece no código). Isso afasta curiosos, mas não é segurança real: um
   bloqueio feito no navegador pode ser burlado por quem entende de código. */
const db = (() => {
  try {
    if (!window.supabase?.createClient || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
      console.warn("[v0] Supabase indisponível: usando dados.js como cópia local.");
      return null;
    }
    return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  } catch (error) {
    console.error("[v0] Falha ao iniciar Supabase:", error);
    return null;
  }
})();
const $ = (sel) => document.querySelector(sel);
const money = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const slugify = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const tituloProduto = (v) => String(v || "Produto sem nome").trim().slice(0, 80);
const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#2b2b30"/></svg>');
const imageUrlOf = (image) => typeof image === "string" ? image : (image?.url || image?.path || "");
const imageListOf = (p) => {
  const raw = Array.isArray(p?.images) ? p.images : [];
  const list = raw.map(imageUrlOf).filter(Boolean);
  if (list.length) return list;
  return p?.image_url ? [p.image_url] : [];
};
const mainImageOf = (p) => {
  const imgs = Array.isArray(p?.images) ? p.images : [];
  return imageUrlOf(imgs.find((i) => typeof i === "object" && i?.is_main)) || imageListOf(p)[0] || PLACEHOLDER;
};

let allProducts = [];
let allCategories = [];
let carouselIndex = 0;
let adminProducts = [];
let adminCategories = [];
let editingId = null;
let productImages = [];
let deletingCategory = null;
let usandoCopia = false;
let promoAutoTimer = null;
let modalImageTimer = null;
let modalGalleryState = [];

/* Desembaralha o usuário guardado em dados.js */
const desembrulhar = (codigos) => String.fromCharCode(...[...codigos].reverse());

/* ============ VITRINE PÚBLICA ============ */
async function initHome() {
  setupFilters();
  setupModal();
  await loadSettings();
  await loadCategories();
  await loadProducts();
  setupAnimations();
}
async function loadSettings() {
  const copia = window.dados?.configuracoes || {};
  try {
    const { data, error } = await db.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    aplicarIdentidade({ ...copia, ...(data || {}) });
  } catch (err) {
    usarCopia();
    aplicarIdentidade(copia);
  }
}
function aplicarIdentidade(cfg) {
  $("#siteName").textContent = cfg.site_name || "Vitrine de Ofertas";
  if (cfg.logo_url) {
    const logo = document.createElement("img");
    logo.className = "logo-img";
    logo.src = cfg.logo_url;
    logo.alt = "";
    const atual = document.querySelector(".logo .logo-img");
    if (atual) atual.replaceWith(logo);
    else document.querySelector(".logo .logo-dot")?.replaceWith(logo);
  }
  if (cfg.footer_text) $("#footerText").textContent = cfg.footer_text;
}
async function loadCategories() {
  const copia = (window.dados?.categorias || []).filter((c) => c.status === "ativa" || !c.status);
  try {
    const { data, error } = await db.from("categories").select("id,name,status").eq("status", "ativa").order("name");
    if (error) throw error;
    prepararCategorias(semDuplicados(copia, data || []).map((c) => ({ ...c, status: "ativa" })));
  } catch (err) {
    usarCopia();
    prepararCategorias(copia);
  }
}
function prepararCategorias(lista) {
  allCategories = lista;
  const select = $("#categorySelect");
  if (!select) return;
  select.querySelectorAll("option:not(:first-child)").forEach((option) => option.remove());
  const seen = new Set();
  lista.forEach((c) => {
    const key = String(c.id ?? c.name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name;
    select.appendChild(option);
  });
}
async function loadProducts() {
  const produtosLocais = (window.dados?.produtos || []).filter((p) => p.status === "ativo");
  prepararProdutos(produtosLocais);
  try {
    const { data, error } = await db.from("products").select("*").eq("status", "ativo").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    prepararProdutos(semDuplicados(produtosLocais, data || []));
  } catch (err) {
    usarCopia();
    prepararProdutos(produtosLocais);
  }
}
function chaveProduto(p) {
  return String(p.name || "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function semDuplicados(principal, complementar) {
  const chaves = new Set(principal.map(chaveProduto));
  return [...principal, ...complementar.filter((p) => !chaves.has(chaveProduto(p)))];
}
function prepararProdutos(lista) {
  allProducts = lista;
  renderProducts(true);
  renderPromoCarousel();
}
function filteredProducts() {
  const term = ($("#searchInput")?.value || "").trim().toLowerCase();
  const cat = $("#categorySelect")?.value || "";
  return allProducts.filter((p) => (!cat || p.category_id === cat) && (!term || (p.name || "").toLowerCase().includes(term) || (p.description || "").toLowerCase().includes(term)));
}
function cardHtml(p) {
  const image = escapeHtml(mainImageOf(p));
  const description = escapeHtml(p.description || "Confira os detalhes desta oferta especial.");
  return `
    <article class="product-card chunky-clay showcase-card" data-id="${escapeHtml(p.id)}">
      <div class="showcase-card-inner">
        <div class="showcase-face showcase-front">
          ${p.is_promo ? '<span class="badge-promo">Promoção</span>' : ""}
          <div class="showcase-image-wrap">
            <div class="showcase-image-overlay"></div>
            <img class="showcase-product-image" src="${image}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.onerror=null;this.src='${PLACEHOLDER}'" />
            <button class="showcase-heart" type="button" aria-label="Favoritar ${escapeHtml(p.name)}" aria-pressed="false">♡</button>
          </div>
          <div class="card-content showcase-content">
            <p class="card-category">${escapeHtml(p.category_name || "")}</p>
            <h3>${escapeHtml(tituloProduto(p.name))}</h3>
            <p class="card-price">${money(p.price)}</p>
            ${p.discount_percent ? `<p class="discount-copy">${escapeHtml(p.discount_percent)}% de desconto</p>` : ""}
            <button class="btn-primary card-btn flip-trigger" type="button">Ver detalhes</button>
            <span class="showcase-glow" aria-hidden="true"></span>
          </div>
        </div>
        <div class="showcase-face showcase-back">
          <button class="showcase-close flip-trigger" type="button" aria-label="Voltar">×</button>
          <p class="card-category">${escapeHtml(p.category_name || "Oferta especial")}</p>
          <h3>${escapeHtml(tituloProduto(p.name))}</h3>
          <p class="showcase-description">${description}</p>
          <p class="card-price">${money(p.price)}</p>
          ${p.discount_percent ? `<p class="discount-copy">${escapeHtml(p.discount_percent)}% de desconto</p>` : ""}
          ${p.coupon_code && p.coupon_discount ? `<p class="coupon-copy">Use o cupom ${escapeHtml(p.coupon_code)} para ${escapeHtml(p.coupon_discount)}% de desconto</p>` : ""}
          <button class="btn-primary card-btn open-product" type="button">Abrir produto</button>
        </div>
      </div>
    </article>`;
}
function renderProducts(fall = false) {
  const grid = $("#productsGrid");
  const list = filteredProducts();
  $("#emptyState").hidden = list.length > 0;
  const catId = $("#categorySelect")?.value || "";
  $("#sectionTitle").textContent = catId ? allCategories.find((c) => c.id === catId)?.name || "Ofertas" : "Todas as ofertas";
  grid.innerHTML = list.map(cardHtml).join("");
  const coupon = list.find((p) => p.coupon_code && Number(p.coupon_discount));
  let couponNotice = document.querySelector(".coupon-notice");
  if (coupon) {
    if (!couponNotice) { couponNotice = document.createElement("p"); couponNotice.className = "coupon-notice"; grid.parentElement.insertBefore(couponNotice, grid); }
    couponNotice.textContent = `Use o cupom ${coupon.coupon_code} para ter ${Number(coupon.coupon_discount)}% de desconto`;
    couponNotice.hidden = false;
  } else if (couponNotice) couponNotice.hidden = true;
  grid.querySelectorAll(".product-card").forEach((card) => {
  const product = allProducts.find((p) => String(p.id) === String(card.dataset.id));
  card.addEventListener("click", (event) => {
  if (event.target.closest("button, a")) return;
  openModal(product);
  });
    card.querySelectorAll(".flip-trigger").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      card.classList.toggle("is-flipped");
    }));
    card.querySelector(".showcase-heart")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = event.currentTarget;
      const active = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!active));
      button.textContent = active ? "♡" : "♥";
    });
    card.querySelector(".open-product")?.addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(product);
    });
  });
  if (window.gsap && list.length) {
    if (fall) {
      gsap.from(".product-card", { y: 36, opacity: 0, scale: 0.96, duration: 0.7, stagger: 0.09, ease: "power3.out" });
    } else {
      gsap.from(".product-card", { y: 24, opacity: 0, duration: 0.45, stagger: 0.04, ease: "power2.out" });
    }
  }
}
function renderPromoCarousel() {
  const track = $("#promoCarousel");
  if (promoAutoTimer) clearInterval(promoAutoTimer);
  const promos = allProducts.filter((p) => p.is_promo).slice(0, 5);
  if (!promos.length) {
    track.innerHTML = "";
    $("#carouselEmpty").hidden = false;
    return;
  }
  $("#carouselEmpty").hidden = true;
  track.innerHTML = promos.map((p) => `
  <article class="carousel-card promo-card liquid-glass clay-border" data-id="${escapeHtml(p.id)}" tabindex="0" role="button" aria-label="Ver oferta de ${escapeHtml(tituloProduto(p.name))}">
  <span class="promo-card-ribbon">Oferta especial</span>
  <button class="promo-card-heart" type="button" aria-label="Favoritar ${escapeHtml(tituloProduto(p.name))}" aria-pressed="false">♡</button>
  <div class="card-image" style="background-image:url('${escapeHtml(mainImageOf(p))}')"></div>
  <div class="card-info">
  <p class="promo-card-kicker">${escapeHtml(p.category_name || "Promoção")}</p>
  <h3>${escapeHtml(tituloProduto(p.name))}</h3>
  <div class="promo-card-price"><strong>${money(p.price)}</strong>${p.discount_percent ? `<span>${escapeHtml(p.discount_percent)}% OFF</span>` : ""}</div>
  <span class="promo-card-cta">Ver produto <span aria-hidden="true">↗</span></span>
  </div>
  </article>`).join("");
  const cards = track.querySelectorAll(".carousel-card");
  cards.forEach((card) => {
    const product = allProducts.find((p) => String(p.id) === String(card.dataset.id));
    const open = () => openModal(product);
    card.addEventListener("click", (event) => { if (!event.target.closest("button")) open(); });
    card.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    card.querySelector(".promo-card-heart")?.addEventListener("click", (event) => {
      event.stopPropagation();
      const button = event.currentTarget;
      const active = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!active));
      button.textContent = active ? "♡" : "♥";
    });
  });
  const apply = (instant) => {
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    cards.forEach((card, index) => {
      const rel = (index - carouselIndex + promos.length) % promos.length;
      let x = 0, z = -420, scale = 0.82, opacity = 0, zIndex = 0;
      if (rel === 0) { x = 0; z = 0; scale = 1; opacity = 1; zIndex = 10; }
      else if (rel === 1) { x = mobile ? -210 : -245; z = -120; scale = mobile ? 0.84 : 0.88; opacity = 0.72; zIndex = 5; }
      else if (rel === promos.length - 1) { x = mobile ? 210 : -410; z = -250; scale = mobile ? 0.76 : 0.78; opacity = 0.3; zIndex = 2; }
      else if (rel === 2) { x = mobile ? 210 : 245; z = -120; scale = mobile ? 0.84 : 0.88; opacity = 0.72; zIndex = 5; }
      else { x = mobile ? -210 : 410; z = -250; scale = mobile ? 0.76 : 0.78; opacity = 0.25; zIndex = 1; }
      gsap[instant ? "set" : "to"](card, { x, z, scale, opacity, zIndex, duration: 0.65, ease: "power3.out" });
    });
  };
  apply(true);
  let dragStartX = null;
  let dragMoved = false;
  const finishDrag = (delta) => {
    if (Math.abs(delta) < 45) return;
    carouselIndex = (carouselIndex + (delta < 0 ? 1 : promos.length - 1)) % promos.length;
    apply(false);
  };
  track.addEventListener("pointerdown", (event) => {
    dragStartX = event.clientX;
    dragMoved = false;
    track.classList.add("is-dragging");
    track.setPointerCapture?.(event.pointerId);
  });
  track.addEventListener("pointermove", (event) => {
    if (dragStartX === null) return;
    dragMoved = Math.abs(event.clientX - dragStartX) > 8;
  });
  track.addEventListener("pointerup", (event) => {
    if (dragStartX === null) return;
    finishDrag(event.clientX - dragStartX);
    dragStartX = null;
    track.classList.remove("is-dragging");
  });
  track.addEventListener("pointercancel", () => { dragStartX = null; track.classList.remove("is-dragging"); });
  track.addEventListener("click", (event) => { if (dragMoved) { event.preventDefault(); event.stopPropagation(); } }, true);
  if (promos.length > 1) {
    promoAutoTimer = setInterval(() => {
      if (document.hidden || track.matches(":hover") || dragStartX !== null) return;
      carouselIndex = (carouselIndex + 1) % promos.length;
      apply(false);
    }, 4200);
  }
}
function setupFilters() {
  $("#searchInput").addEventListener("input", () => renderProducts());
  $("#categorySelect").addEventListener("change", () => renderProducts());
}
function setupModal() {
  document.querySelectorAll("#productModal [data-close]").forEach((el) => el.addEventListener("click", closeModal));
}
function openModal(product) {
  if (!product) return;
  clearInterval(modalImageTimer);
  const gallery = imageListOf(product).length ? imageListOf(product) : [PLACEHOLDER];
  modalGalleryState = gallery;
  let imageIndex = 0;
  const showImage = (index) => {
    imageIndex = index;
    const main = $("#modalMain");
    main.classList.remove("image-transition");
    void main.offsetWidth;
    main.classList.add("image-transition");
    main.src = gallery[index];
    $("#modalThumbs").querySelectorAll("img").forEach((el) => el.classList.toggle("active", Number(el.dataset.thumb) === index));
  };
  $("#modalMain").src = gallery[0];
  $("#modalThumbs").innerHTML = gallery.length > 1 ? gallery.map((url, i) => `<img src="${escapeHtml(url)}" data-thumb="${i}" class="${i === 0 ? "active" : ""}" alt="Imagem ${i + 1} de ${escapeHtml(tituloProduto(product.name))}" onerror="this.style.display='none'" />`).join("") : "";
  $("#modalThumbs").querySelectorAll("[data-thumb]").forEach((thumb) => thumb.addEventListener("click", () => showImage(Number(thumb.dataset.thumb))));
  if (gallery.length > 1) modalImageTimer = setInterval(() => showImage((imageIndex + 1) % gallery.length), 3800);
  $("#modalCategory").textContent = product.category_name || "";
  $("#modalName").textContent = tituloProduto(product.name);
  const rating = Math.max(0, Math.min(5, Number(product.rating ?? product.stars ?? 5) || 0));
  $("#modalRating").textContent = `${"★".repeat(Math.round(rating))}${"☆".repeat(5 - Math.round(rating))} ${rating.toFixed(1)}`;
  $("#modalPrice").textContent = money(product.price);
  $("#modalDesc").textContent = product.description || "Descrição não informada.";
  const heart = $("#modalHeart");
  heart.textContent = "♡";
  heart.setAttribute("aria-pressed", "false");
  heart.onclick = () => { const active = heart.getAttribute("aria-pressed") === "true"; heart.setAttribute("aria-pressed", String(!active)); heart.textContent = active ? "♡" : "♥"; };
  const buy = $("#modalBuy");
  if (product.purchase_url) {
    buy.href = product.purchase_url;
    buy.hidden = false;
    buy.removeAttribute("aria-disabled");
  } else {
    buy.removeAttribute("href");
    buy.hidden = false;
    buy.setAttribute("aria-disabled", "true");
    buy.textContent = "Compra indisponível";
  }
  $("#productModal").hidden = false;
  document.body.style.overflow = "hidden";
  if (window.gsap) gsap.from(".modal-card", { y: 60, opacity: 0, duration: 0.5, ease: "power3.out" });
}
function closeModal() {
  clearInterval(modalImageTimer);
  modalImageTimer = null;
  $("#productModal").hidden = true;
  document.body.style.overflow = "";
}
function setupAnimations() {
  document.querySelectorAll(".gsap-reveal, .products-grid, .footer").forEach((el) => el.classList.add("scroll-reveal", "reveal-blur"));
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => entry.target.classList.toggle("is-visible", entry.isIntersecting)), { threshold: 0.12, rootMargin: "-10% 0px -10% 0px" });
  document.querySelectorAll(".scroll-reveal, .reveal-blur").forEach((el) => observer.observe(el));
  if (!window.gsap) return;
  gsap.registerPlugin(window.ScrollTrigger);
  gsap.from(".nav", { y: -30, opacity: 0, duration: 0.8, ease: "power3.out" });
  gsap.from(".hero-content > *", { y: 70, opacity: 0, duration: 0.9, stagger: 0.12, ease: "power3.out", delay: 0.2 });
  gsap.from(".carousel-container", { y: 90, opacity: 0, duration: 1, ease: "power3.out", delay: 0.35 });
  gsap.to("#parallaxText", { yPercent: 50, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
}

/* ============ PAINEL ============ */
async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function usarCopia() {
  usandoCopia = true;
  const aviso = $("#modoReserva");
  if (aviso) aviso.hidden = false;
}
async function initAdmin() {
  setupAdminForms();
  if (sessionStorage.getItem("painelLiberado") === "1") {
    await enterPanel();
    return;
  }
  $("#loginView").hidden = false;
  if (!window.dados || !window.dados.acesso) showLoginError("O arquivo dados.js não foi encontrado junto do site.");
}
function setupAdminForms() {
  $("#loginForm").addEventListener("submit", onLogin);
  $("#passwordToggle").addEventListener("click", () => {
    const input = $("#loginPassword");
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    $("#passwordToggle").textContent = visible ? "Ocultar" : "Mostrar";
    $("#passwordToggle").setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
    $("#passwordToggle").setAttribute("aria-pressed", String(visible));
  });
  $("#logoutBtn").addEventListener("click", () => {
    sessionStorage.removeItem("painelLiberado");
    $("#adminView").hidden = true;
    $("#loginView").hidden = false;
  });
  document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".tab-panel").forEach((p) => (p.hidden = p.id !== `tab-${btn.dataset.tab}`));
  }));
  setupProductForm();
  setupCategoryUI();
  setupStoreForm();
  setupBackup();
}
function showLoginError(message) {
  $("#loginError").textContent = message;
  $("#loginError").hidden = false;
}
async function onLogin(event) {
  event.preventDefault();
  $("#loginError").hidden = true;
  const acesso = window.dados && window.dados.acesso;
  if (!acesso) { showLoginError("O arquivo dados.js não foi encontrado junto do site."); return; }
  const email = $("#loginEmail").value.trim().toLowerCase();
  const senhaHash = await sha256($("#loginPassword").value);
  const usuarioCorreto = desembrulhar(acesso.usuario).toLowerCase();
  if (email !== usuarioCorreto || senhaHash !== acesso.senha) { showLoginError("E-mail ou senha inválidos."); return; }
  sessionStorage.setItem("painelLiberado", "1");
  await enterPanel();
}
async function enterPanel() {
  $("#loginView").hidden = true;
  $("#adminView").hidden = false;
  await Promise.all([loadAdminProducts(), loadAdminCategories()]);
  loadStore();
}
async function loadAdminProducts() {
  const produtosLocais = window.dados?.produtos || [];
  prepararAdminProdutos(produtosLocais);
  try {
    const { data, error } = await db.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    prepararAdminProdutos(semDuplicados(produtosLocais, data || []));
  } catch (err) {
    usarCopia();
  }
}
function prepararAdminProdutos(lista) {
  adminProducts = lista;
  $("#productsList").innerHTML = adminProducts.length ? adminProducts.map(productRow).join("") : '<p class="empty">Nenhum produto cadastrado ainda.</p>';
  document.querySelectorAll("#productsList [data-edit]").forEach((btn) => btn.addEventListener("click", () => openDrawer(adminProducts.find((p) => p.id === btn.dataset.edit))));
  document.querySelectorAll("#productsList [data-delete]").forEach((btn) => btn.addEventListener("click", async () => {
    const product = adminProducts.find((p) => p.id === btn.dataset.delete);
    if (!product || !confirm(`Excluir o produto "${product.name}"?`)) return;
    await db.from("products").delete().eq("id", product.id);
    await loadAdminProducts();
  }));
}
const productRow = (p) => `
  <div class="list-row">
    <img class="row-thumb" src="${escapeHtml(mainImageOf(p))}" alt="" />
    <div class="row-info"><strong>${escapeHtml(p.name)}</strong><span>${money(p.price)} · ${escapeHtml(p.category_name || "Sem categoria")}</span></div>
    <div class="row-badges">
      ${p.is_promo ? '<span class="badge-promo static">Promoção</span>' : ""}
      <span class="badge-status ${escapeHtml(p.status)}">${escapeHtml(p.status)}</span>
    </div>
    <div class="row-actions">
      <button class="btn-outline" data-edit="${p.id}" type="button">Editar</button>
      <button class="btn-danger" data-delete="${p.id}" type="button">Excluir</button>
    </div>
  </div>`;
function parseMoeda(value) {
  const normalized = String(value || "").replace(/\s/g, "").replace(/R\$/gi, "").replace(/\./g, "").replace(",", ".");
  return Number(normalized) || 0;
}
function formatarMoeda(value) {
  return Number(value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function setupProductForm() {
  $("#newProductBtn").addEventListener("click", () => openDrawer(null));
  $("#pPrice").addEventListener("input", (event) => { const digits = event.target.value.replace(/\D/g, ""); event.target.value = digits ? formatarMoeda(Number(digits) / 100) : ""; });
  $("#newCategoryInlineBtn").addEventListener("click", async () => {
    const name = prompt("Nome da nova categoria:");
    if (!name?.trim()) return;
    await criarCategoria(name.trim(), true);
  });
  document.querySelectorAll("[data-close-drawer]").forEach((el) => el.addEventListener("click", closeDrawer));
  $("#pImages").addEventListener("change", onImagesSelected);
  $("#addImageUrlBtn").addEventListener("click", addImageUrl);
  $("#pImageUrl").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.nativeEvent?.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      addImageUrl();
    }
  });
  $("#productForm").addEventListener("submit", onSaveProduct);
  $("#sLogo").addEventListener("input", previewStoreLogo);
  $("#sLogoFile").addEventListener("change", previewStoreLogoFile);
}
function openDrawer(product) {
  editingId = product?.id || null;
  $("#drawerTitle").textContent = product ? "Editar produto" : "Adicionar produto";
  $("#pName").value = product?.name || "";
  $("#pDesc").value = product?.description || "";
  $("#pPrice").value = product?.price ? formatarMoeda(product.price) : "";
  $("#pStatus").value = product?.status || "ativo";
  $("#pPromo").checked = Boolean(product?.is_promo);
  $("#pDiscount").value = product?.discount_percent ?? "";
  $("#pCoupon").value = product?.coupon_code || "";
  $("#pCouponDiscount").value = product?.coupon_discount ?? "";
  $("#pUrl").value = product?.purchase_url || "";
  atualizarSelectCategorias();
  $("#pCategory").value = product?.category_id || "";
  productImages = (Array.isArray(product?.images) ? product.images : []).map((img, index) => typeof img === "string" ? { url: img, is_main: index === 0 } : { ...img, url: imageUrlOf(img), is_main: img.is_main ?? index === 0 });
  if (!productImages.length && product?.image_url) productImages = [{ url: product.image_url, is_main: true }];
  $("#pImageUrl").value = productImages[0]?.url && !productImages[0]?.path ? productImages[0].url : "";
  renderImages();
  $("#formError").hidden = true;
  $("#productDrawer").hidden = false;
}
function closeDrawer() {
  $("#productDrawer").hidden = true;
  editingId = null;
  productImages = [];
}
function showFormError(message) {
  $("#formError").textContent = message;
  $("#formError").hidden = false;
}
async function onImagesSelected(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;
  try {
    for (const file of files) {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      productImages.push({ url, is_main: false, name: file.name });
    }
    if (!productImages.some((i) => i.is_main)) productImages[0].is_main = true;
    renderImages();
  } catch (err) {
    showFormError("Não foi possível pré-visualizar a imagem: " + err.message);
  }
}
function addImageUrl() {
  const input = $("#pImageUrl");
  const url = input.value.trim();
  if (!url) return;
  if (!productImages.some((img) => img.url === url)) productImages.push({ url, is_main: productImages.length === 0 });
  input.value = "";
  renderImages();
}
function renderImages() {
  const grid = $("#imagesGrid");
  grid.innerHTML = productImages.map((img, i) => `
    <figure class="image-item ${img.is_main ? "is-main" : ""}">
        <img src="${escapeHtml(imageUrlOf(img) || PLACEHOLDER)}" alt="Prévia da imagem ${i + 1}" onerror="this.onerror=null;this.src='${PLACEHOLDER}'" />
      ${img.is_main ? '<figcaption>Principal</figcaption>' : ""}
      <div class="image-actions">
        ${img.is_main ? "" : `<button type="button" data-main="${i}">Principal</button>`}
        <button type="button" data-left="${i}" ${i === 0 ? "disabled" : ""}>←</button>
        <button type="button" data-right="${i}" ${i === productImages.length - 1 ? "disabled" : ""}>→</button>
        <button type="button" data-remove="${i}">Remover</button>
      </div>
    </figure>`).join("");
  grid.querySelectorAll("[data-main]").forEach((btn) => btn.addEventListener("click", () => {
    const index = Number(btn.dataset.main);
    productImages = productImages.map((img, i) => ({ ...img, is_main: i === index }));
    renderImages();
  }));
  grid.querySelectorAll("[data-left]").forEach((btn) => btn.addEventListener("click", () => swapImages(Number(btn.dataset.left), -1)));
  grid.querySelectorAll("[data-right]").forEach((btn) => btn.addEventListener("click", () => swapImages(Number(btn.dataset.right), 1)));
  grid.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
    const index = Number(btn.dataset.remove);
    const removed = productImages.splice(index, 1)[0];
    if (removed?.is_main && productImages.length) productImages[0].is_main = true;
    renderImages();
  }));
}
function swapImages(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= productImages.length) return;
  [productImages[index], productImages[target]] = [productImages[target], productImages[index]];
  renderImages();
}
async function onSaveProduct(event) {
  event.preventDefault();
  const categoryId = $("#pCategory").value || null;
  const category = adminCategories.find((c) => c.id === categoryId);
  const payload = {
    name: $("#pName").value.trim(),
    description: $("#pDesc").value.trim() || null,
    price: parseMoeda($("#pPrice").value),
    status: $("#pStatus").value,
    is_promo: $("#pPromo").checked,
    discount_percent: Number($("#pDiscount").value.replace(",", ".")) || 0,
    coupon_code: $("#pCoupon").value.trim().toUpperCase() || null,
    coupon_discount: Number($("#pCouponDiscount").value.replace(",", ".")) || 0,
    category_id: categoryId,
    category_name: category?.name || null,
    purchase_url: $("#pUrl").value.trim() || null,
    images: productImages.map((img, i) => ({ ...img, order: i })),
    image_url: productImages[0]?.url || null,
  };
  if (!payload.name || !(payload.price > 0)) { showFormError("Informe o nome e um preço maior que zero."); return; }
  try {
    let result = editingId ? await db.from("products").update(payload).eq("id", editingId) : await db.from("products").insert(payload);

    // Compatibilidade com bancos criados antes dos campos de promoção/cupom.
    // Se o Supabase informar que uma coluna opcional não existe, salva usando
    // somente as colunas presentes no SQL original, sem perder as imagens.
    if (result.error && /column .* does not exist|schema cache/i.test(result.error.message || "")) {
      const payloadCompat = {
        name: payload.name,
        description: payload.description,
        price: payload.price,
        status: payload.status,
        is_promo: payload.is_promo,
        category_id: payload.category_id,
        category_name: payload.category_name,
        purchase_url: payload.purchase_url,
        images: payload.images,
      };
      result = editingId ? await db.from("products").update(payloadCompat).eq("id", editingId) : await db.from("products").insert(payloadCompat);
    }
    if (result.error) throw result.error;
    closeDrawer();
    await loadAdminProducts();
  } catch (err) {
    showFormError("Erro ao salvar: " + err.message);
  }
}
async function loadAdminCategories() {
  try {
    const { data, error } = await db.from("categories").select("*").order("name");
    if (error) throw error;
    prepararAdminCategorias(data || []);
  } catch (err) {
    usarCopia();
    prepararAdminCategorias(window.dados?.categorias || []);
  }
}
function prepararAdminCategorias(lista) {
  adminCategories = lista;
  $("#categoriesList").innerHTML = adminCategories.length ? adminCategories.map((c) => `
    <div class="list-row">
      <div class="row-info"><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.status)}</span></div>
      <div class="row-actions">
        <button class="btn-outline" data-rename="${c.id}" type="button">Renomear</button>
        <button class="btn-outline" data-toggle="${c.id}" type="button">${c.status === "ativa" ? "Desativar" : "Ativar"}</button>
        <button class="btn-danger" data-cat-delete="${c.id}" type="button">Excluir</button>
      </div>
    </div>`).join("") : '<p class="empty">Nenhuma categoria criada ainda.</p>';
  document.querySelectorAll("[data-rename]").forEach((btn) => btn.addEventListener("click", async () => {
    const category = adminCategories.find((c) => c.id === btn.dataset.rename);
    const name = prompt("Novo nome da categoria:", category.name);
    if (!name || !name.trim()) return;
    await db.from("categories").update({ name: name.trim(), slug: slugify(name) }).eq("id", category.id);
    await db.from("products").update({ category_name: name.trim() }).eq("category_id", category.id);
    await Promise.all([loadAdminCategories(), loadAdminProducts()]);
  }));
  document.querySelectorAll("[data-toggle]").forEach((btn) => btn.addEventListener("click", async () => {
    const category = adminCategories.find((c) => c.id === btn.dataset.toggle);
    const status = category.status === "ativa" ? "inativa" : "ativa";
    await db.from("categories").update({ status }).eq("id", category.id);
    await loadAdminCategories();
  }));
  document.querySelectorAll("[data-cat-delete]").forEach((btn) => btn.addEventListener("click", () => openCategoryModal(adminCategories.find((c) => c.id === btn.dataset.catDelete))));
}
async function criarCategoria(name, selecionar = false) {
  const categoriaLocal = { id: `local-${slugify(name)}-${Date.now()}`, name, slug: slugify(name), status: "ativa" };
  try {
    const result = await db.from("categories").insert({ name, slug: slugify(name), status: "ativa" }).select().single();
    if (result.error) throw result.error;
    await loadAdminCategories();
    if (selecionar) $("#pCategory").value = result.data.id;
  } catch (err) {
    usandoCopia = true;
    adminCategories = [...adminCategories.filter((c) => c.name.toLowerCase() !== name.toLowerCase()), categoriaLocal];
    prepararAdminCategorias(adminCategories);
    atualizarSelectCategorias(categoriaLocal.id);
    if (selecionar) $("#pCategory").value = categoriaLocal.id;
  }
}
function atualizarSelectCategorias(selectedId = "") {
  $("#pCategory").innerHTML = '<option value="">Sem categoria</option>' + adminCategories.filter((c) => c.status !== "inativa").map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  if (selectedId) $("#pCategory").value = selectedId;
}
async function addCategory(event) {
  event.preventDefault();
  const name = $("#categoryName").value.trim();
  if (!name) return;
  await criarCategoria(name);
  $("#categoryName").value = "";
}
function setupCategoryUI() {
  $("#categoryAddForm").addEventListener("submit", addCategory);
  document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", () => { $("#categoryModal").hidden = true; deletingCategory = null; }));
  $("#categoryDeleteConfirm").addEventListener("click", confirmDeleteCategory);
}
async function openCategoryModal(category) {
  if (!category) return;
  deletingCategory = category;
  const { count } = await db.from("products").select("id", { count: "exact", head: true }).eq("category_id", category.id);
  const total = Number(count) || 0;
  $("#categoryModalText").textContent = total ? `Esta categoria tem ${total} produto(s). Escolha para onde movê-los antes de excluir.` : `Excluir a categoria "${category.name}"?`;
  const wrap = $("#categoryMoveWrap");
  if (total) {
    $("#categoryMoveSelect").innerHTML = '<option value="">— sem categoria —</option>' + adminCategories.filter((c) => c.id !== category.id).map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    wrap.hidden = false;
  } else {
    wrap.hidden = true;
  }
  $("#categoryModal").hidden = false;
}
async function confirmDeleteCategory() {
  if (!deletingCategory) return;
  const moveTo = $("#categoryMoveSelect").value || null;
  if (!$("#categoryMoveWrap").hidden) {
    await db.from("products").update({ category_id: moveTo, category_name: adminCategories.find((c) => c.id === moveTo)?.name || null }).eq("category_id", deletingCategory.id);
  }
  await db.from("categories").delete().eq("id", deletingCategory.id);
  $("#categoryModal").hidden = true;
  deletingCategory = null;
  await Promise.all([loadAdminCategories(), loadAdminProducts()]);
}
async function loadStore() {
  try {
    const { data, error } = await db.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    preencherLoja(data || {});
  } catch (err) {
    usarCopia();
    preencherLoja(window.dados?.configuracoes || {});
  }
}
function preencherLoja(cfg) {
  $("#sName").value = cfg.site_name || "";
  $("#sLogo").value = cfg.logo_url?.startsWith("data:") ? "" : (cfg.logo_url || "");
  $("#sLogo").dataset.currentLogo = cfg.logo_url || "";
  $("#sFooter").value = cfg.footer_text || "";
  previewStoreLogo();
}
function previewStoreLogo() {
  const url = $("#sLogo").value.trim() || $("#sLogo").dataset.currentLogo || "";
  const preview = $("#sLogoPreview");
  preview.src = url;
  preview.hidden = !url;
}
function previewStoreLogoFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { $("#sLogo").dataset.currentLogo = reader.result; previewStoreLogo(); };
  reader.readAsDataURL(file);
}
function setupStoreForm() {
  $("#storeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await db.from("site_settings").update({
        site_name: $("#sName").value.trim(),
        logo_url: $("#sLogo").value.trim() || $("#sLogo").dataset.currentLogo || null,
        footer_text: $("#sFooter").value.trim(),
      }).eq("id", 1);
      alert("Loja atualizada!");
    } catch (err) {
      alert("Banco indisponível — não foi possível salvar. Use a cópia local (dados.js) como apoio.");
    }
  });
}

/* ============ BACKUP — botão "Copiar dados do banco" ============ */
function setupBackup() {
  $("#backupBtn").addEventListener("click", abrirBackup);
  document.querySelectorAll("[data-close-backup]").forEach((el) => el.addEventListener("click", () => {
    $("#backupModal").hidden = true;
    $("#backupCopyBtn").textContent = "Copiar";
  }));
  $("#backupCopyBtn").addEventListener("click", async () => {
    const ok = await copiarTexto($("#backupText").value);
    $("#backupCopyBtn").textContent = ok ? "Copiado!" : "Selecione o texto e use Ctrl+C";
  });
}
async function abrirBackup() {
  let produtos, categorias, configuracoes;
  try {
    const [p, c, s] = await Promise.all([
      db.from("products").select("*").order("created_at", { ascending: false }),
      db.from("categories").select("*").order("name"),
      db.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    if (p.error || c.error) throw p.error || c.error;
    produtos = p.data || [];
    categorias = c.data || [];
    configuracoes = s.data || {};
    $("#backupFonte").textContent = "Dados copiados direto do banco.";
  } catch (err) {
    produtos = window.dados?.produtos || [];
    categorias = window.dados?.categorias || [];
    configuracoes = window.dados?.configuracoes || {};
    $("#backupFonte").textContent = "Banco indisponível — mostrando a cópia local (dados.js).";
  }
  const conteudo = {
    gerado_em: new Date().toISOString(),
    produtos,
    categorias,
    configuracoes,
    acesso: window.dados?.acesso || null,
  };
  $("#backupText").value = "// Cole TODO este conteúdo em dados.js (substituindo tudo)\nconst dados = " + JSON.stringify(conteudo, null, 2) + ";";
  $("#backupModal").hidden = false;
}
async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (err) {
    const area = $("#backupText");
    area.focus();
    area.select();
    try { return document.execCommand("copy"); } catch (e) { return false; }
  }
}

if (document.body.dataset.page === "home") initHome();
if (document.body.dataset.page === "admin") initAdmin();
