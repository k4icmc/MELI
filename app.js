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
  return (imgs.find((i) => i.is_main) || imgs[0] || {}).url || p.image_url || PLACEHOLDER;
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
    const { data, error } = await db.from("products").select("*").eq("status", "ativo").order("created_at", { ascending: false }).limit(200);
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
