/* app.js — usado por index.html (data-page="home") e admin.html (data-page="admin").
   ACESSO DO PAINEL: usuário e senha NÃO ficam no banco — ficam camuflados em
   dados.js (usuario embaralhado, senha como hash SHA-256; a senha real nunca
   aparece no código). Isso afasta curiosos, mas não é segurança real: um
   bloqueio feito no navegador pode ser burlado por quem entende de código. */
const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
const $ = (sel) => document.querySelector(sel);
const money = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);
const slugify = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const escapeHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#2b2b30"/></svg>');
const mainImageOf = (p) => {
  const imgs = p.images || [];
  return (imgs.find((i) => i.is_main) || imgs[0] || {}).url || PLACEHOLDER;
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
  try {
    const { data, error } = await db.from("site_settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    aplicarIdentidade(data || {});
  } catch (err) {
    usarCopia();
    aplicarIdentidade(window.dados?.configuracoes || {});
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
  try {
    const { data, error } = await db.from("categories").select("id,name").eq("status", "ativa").order("name");
    if (error) throw error;
    prepararCategorias(data || []);
  } catch (err) {
    usarCopia();
    prepararCategorias((window.dados?.categorias || []).filter((c) => c.status === "ativa"));
  }
}
function prepararCategorias(lista) {
  allCategories = lista;
  lista.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name;
    $("#categorySelect").appendChild(option);
  });
}
async function loadProducts() {
  const produtosLocais = (window.dados?.produtos || []).filter((p) => p.status === "ativo");
  prepararProdutos(produtosLocais);
  try {
    const { data, error } = await db.from("products").select("id,name,description,price,purchase_url,images,is_promo,category_id,category_name").eq("status", "ativo").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    prepararProdutos(semDuplicados(produtosLocais, data || []));
  } catch (err) {
    usarCopia();
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
  return `
    <article class="product-card chunky-clay" data-id="${p.id}">
      ${p.is_promo ? '<span class="badge-promo">Promoção</span>' : ""}
      <img src="${escapeHtml(mainImageOf(p))}" alt="${escapeHtml(p.name)}" loading="lazy" />
      <div class="card-content">
        <p class="card-category">${escapeHtml(p.category_name || "")}</p>
        <h3>${escapeHtml(p.name)}</h3>
        <p class="card-price">${money(p.price)}</p>
        <span class="btn-primary card-btn">Ver oferta</span>
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
  grid.querySelectorAll(".product-card").forEach((card) => card.addEventListener("click", () => openModal(allProducts.find((p) => p.id === card.dataset.id))));
  if (window.gsap && list.length) {
    if (fall) {
      gsap.from(".product-card", { y: -700, opacity: 0, scale: 0.8, rotation: (i) => (i % 2 ? 8 : -8), duration: 1.1, stagger: 0.07, from: "center", ease: "back.out(1.4)" });
    } else {
      gsap.from(".product-card", { y: 24, opacity: 0, duration: 0.45, stagger: 0.04, ease: "power2.out" });
    }
  }
}
function renderPromoCarousel() {
  const track = $("#promoCarousel");
  const promos = allProducts.filter((p) => p.is_promo).slice(0, 5);
  if (!promos.length) {
    track.innerHTML = "";
    $("#carouselEmpty").hidden = false;
    return;
  }
  $("#carouselEmpty").hidden = true;
  track.innerHTML = promos.map((p) => `
    <div class="carousel-card liquid-glass clay-border" data-id="${p.id}">
      <div class="card-image" style="background-image:url('${escapeHtml(mainImageOf(p))}')"></div>
      <div class="card-info">
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.category_name || "")}</p>
        <strong>${money(p.price)}</strong>
      </div>
    </div>`).join("");
  const cards = track.querySelectorAll(".carousel-card");
  cards.forEach((card) => card.addEventListener("click", () => openModal(allProducts.find((p) => p.id === card.dataset.id))));
  const apply = (instant) => {
    cards.forEach((card, index) => {
      const rel = (index - carouselIndex + promos.length) % promos.length;
      let x = -100, z = -500, scale = 0.8, opacity = 0, zIndex = 0;
      if (rel === 0) { x = 0; z = 0; scale = 1; opacity = 1; zIndex = 10; }
      else if (rel === 1) { x = -240; z = -150; scale = 0.9; opacity = 0.7; zIndex = 5; }
      else if (rel === 2) { x = -430; z = -300; scale = 0.8; opacity = 0.3; zIndex = 1; }
      gsap[instant ? "set" : "to"](card, { x, z, scale, opacity, zIndex, duration: 1, ease: "power3.out" });
    });
  };
  apply(true);
  setInterval(() => { carouselIndex = (carouselIndex + 1) % promos.length; apply(false); }, 4000);
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
  const images = (product.images || []).map((i) => i.url).filter(Boolean);
  const gallery = images.length ? images : [PLACEHOLDER];
  $("#modalMain").src = gallery[0];
  $("#modalThumbs").innerHTML = gallery.length > 1 ? gallery.map((url, i) => `<img src="${escapeHtml(url)}" data-thumb="${i}" class="${i === 0 ? "active" : ""}" alt="" />`).join("") : "";
  $("#modalThumbs").querySelectorAll("[data-thumb]").forEach((thumb) => thumb.addEventListener("click", () => {
    $("#modalMain").src = gallery[Number(thumb.dataset.thumb)];
    $("#modalThumbs").querySelectorAll("img").forEach((el) => el.classList.toggle("active", el === thumb));
  }));
  $("#modalCategory").textContent = product.category_name || "";
  $("#modalName").textContent = product.name;
  $("#modalPrice").textContent = money(product.price);
  $("#modalDesc").textContent = product.description || "";
  const buy = $("#modalBuy");
  if (product.purchase_url) { buy.href = product.purchase_url; buy.hidden = false; }
  else buy.hidden = true;
  $("#productModal").hidden = false;
  document.body.style.overflow = "hidden";
  if (window.gsap) gsap.from(".modal-card", { y: 60, opacity: 0, duration: 0.5, ease: "power3.out" });
}
function closeModal() {
  $("#productModal").hidden = true;
  document.body.style.overflow = "";
}
function setupAnimations() {
  if (!window.gsap) return;
  gsap.registerPlugin(window.ScrollTrigger);
  gsap.from(".nav", { y: -30, opacity: 0, duration: 0.8, ease: "power3.out" });
  gsap.from(".hero-content > *", { y: 70, opacity: 0, duration: 0.9, stagger: 0.12, ease: "power3.out", delay: 0.2 });
  gsap.from(".carousel-container", { y: 90, opacity: 0, duration: 1, ease: "power3.out", delay: 0.35 });
  gsap.to("#parallaxText", { yPercent: 50, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  gsap.from(".gsap-reveal", { y: 40, opacity: 0, duration: 1, stagger: 0.15, ease: "power2.out", scrollTrigger: { trigger: ".products-section", start: "top 80%" } });
  gsap.from(".footer", { opacity: 0, y: 30, duration: 1, ease: "power2.out", scrollTrigger: { trigger: ".footer", start: "top 95%" } });
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
function setupProductForm() {
  $("#newProductBtn").addEventListener("click", () => openDrawer(null));
  document.querySelectorAll("[data-close-drawer]").forEach((el) => el.addEventListener("click", closeDrawer));
  $("#pImages").addEventListener("change", onImagesSelected);
  $("#productForm").addEventListener("submit", onSaveProduct);
}
function openDrawer(product) {
  editingId = product?.id || null;
  $("#drawerTitle").textContent = product ? "Editar produto" : "Adicionar produto";
  $("#pName").value = product?.name || "";
  $("#pDesc").value = product?.description || "";
  $("#pPrice").value = product?.price ?? "";
  $("#pStatus").value = product?.status || "ativo";
  $("#pPromo").checked = Boolean(product?.is_promo);
  $("#pUrl").value = product?.purchase_url || "";
  $("#pCategory").innerHTML = '<option value="">Sem categoria</option>' + adminCategories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  $("#pCategory").value = product?.category_id || "";
  productImages = [...(product?.images || [])];
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
  const btn = $("#saveProductBtn");
  btn.disabled = true;
  try {
    for (const file of files) {
      const uploaded = await uploadImage(file);
      productImages.push({ ...uploaded, is_main: false });
    }
    if (!productImages.some((i) => i.is_main)) productImages[0].is_main = true;
    renderImages();
  } catch (err) {
    showFormError("Não foi possível enviar a imagem: " + err.message);
  } finally {
    btn.disabled = false;
  }
}
async function uploadImage(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `produtos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await db.storage.from("product-images").upload(path, file);
  if (error) throw error;
  return { url: db.storage.from("product-images").getPublicUrl(path).data.publicUrl, path };
}
function renderImages() {
  const grid = $("#imagesGrid");
  grid.innerHTML = productImages.map((img, i) => `
    <figure class="image-item ${img.is_main ? "is-main" : ""}">
      <img src="${escapeHtml(img.url)}" alt="" />
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
    price: Number($("#pPrice").value),
    status: $("#pStatus").value,
    is_promo: $("#pPromo").checked,
    category_id: categoryId,
    category_name: category?.name || null,
    purchase_url: $("#pUrl").value.trim() || null,
    images: productImages.map((img, i) => ({ ...img, order: i })),
  };
  if (!payload.name || !(payload.price > 0)) { showFormError("Informe o nome e um preço maior que zero."); return; }
  try {
    if (editingId) await db.from("products").update(payload).eq("id", editingId);
    else await db.from("products").insert(payload);
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
async function addCategory(event) {
  event.preventDefault();
  const name = $("#categoryName").value.trim();
  if (!name) return;
  await db.from("categories").insert({ name, slug: slugify(name) });
  $("#categoryName").value = "";
  await loadAdminCategories();
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
  $("#sLogo").value = cfg.logo_url || "";
  $("#sFooter").value = cfg.footer_text || "";
}
function setupStoreForm() {
  $("#storeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await db.from("site_settings").update({
        site_name: $("#sName").value.trim(),
        logo_url: $("#sLogo").value.trim(),
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
