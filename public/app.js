(() => {
"use strict";
const $ = (id) => document.getElementById(id);
const CFG = window.SITE_CONFIG || {}, API = CFG.API || "/api", KEY = "db-cache";
const GAS = /script\.google(usercontent)?\.com/.test(API);
const I = window.I18N, IC = window.ICONS;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

let DB = structuredClone(window.DEFAULT_DATA), lang = "uz", cat = "all", sel = null, selCart = false, pdP = null, calcM = 12, shown = 0;
let brCur = 0, rating = 0, tIdx = 0, mvCur = null, mvLoaded = "", reviewList = [], tagsDrawn = false, lastJson = "", hIdx = 0, hTimer = 0, hSig = "", pk = "study";
let cart = {}; try { cart = JSON.parse(localStorage.getItem("db-cart") || "{}"); } catch {}

const t = (k) => (I[lang] && I[lang][k]) ?? I.uz[k] ?? k;
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
const loc = (o, f) => (lang !== "uz" && o[f + "_" + lang]) || o[f];
const byId = (id) => DB.products.find((p) => p.id === id);
const mk = () => ({ 3: DB.settings.m3, 6: DB.settings.m6, 12: DB.settings.m12, 24: DB.settings.m24 });
const mon = (p, m) => (p.price * (1 + mk()[m] / 100)) / m;
const som = () => t("som");
const moTxt = (p, m = 24) => fmt(mon(p, m)) + " " + som() + "/" + t("mo");
const onSale = (p) => p.oldPrice > p.price;
const off = (p) => Math.round((1 - p.price / p.oldPrice) * 100);
const catLabel = (c) => { if (c === "__sale") return t("nav_sale"); const p = DB.products.find((x) => x.category === c); return p ? loc(p, "category") : c; };
function toast(m) { const e = $("toast"); e.textContent = m; e.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove("show"), 3000); }
const SVG = { ig: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></svg>', yt: '<svg class="i" viewBox="0 0 24 24"><rect x="2.5" y="6" width="19" height="12" rx="4"/><path d="M10 9.5v5l4.5-2.5z"/></svg>', tg: '<svg class="i" viewBox="0 0 24 24"><path d="M21 4L3 11l6 2 2 6 3-4 5 3z"/></svg>', chk: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', cart: '<svg class="i" viewBox="0 0 24 24"><path d="M6 8h12l-1 12H7z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>', chev: '<svg class="i" viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M6 9l6 6 6-6"/></svg>' };

const imgSrc = (v) => { v = String(v || ""); return v.startsWith("drive:") ? "https://drive.google.com/thumbnail?id=" + v.slice(6) + "&sz=w900" : v.startsWith("blob:") ? API + "?img=" + v.slice(5) : v; };
const modelCache = {};
async function modelSrc(v) {
  v = String(v);
  if (v.startsWith("blob:")) return API + "?model=" + v.slice(5);
  if (!v.startsWith("drive:")) return v;
  const id = v.slice(6); if (modelCache[id]) return modelCache[id];
  const d = await (await fetch(API + "?model=" + encodeURIComponent(id))).json(); if (!d.data) throw 0;
  return (modelCache[id] = URL.createObjectURL(new Blob([Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0))], { type: "model/gltf-binary" })));
}

// ---------- data ----------
function norm(d) {
  const S = window.DEFAULT_DATA.settings, st = Object.assign({}, S, d.settings || {});
  const n = (v, f) => (v !== "" && v != null && Number.isFinite(+v) ? +v : f), s = (v) => String(v == null ? "" : v), b = (v) => v === true || v === "true" || v === "TRUE" || v === 1 || v === "1";
  return {
    products: (d.products || []).map((p, i) => ({ id: n(p.id, i + 1), name: s(p.name), category: s(p.category), category_en: s(p.category_en), category_ru: s(p.category_ru), price: n(p.price, 0), oldPrice: n(p.oldPrice, 0), featured: b(p.featured), tags: s(p.tags), badge: s(p.badge), image: s(p.image), desc: s(p.desc), desc_en: s(p.desc_en), desc_ru: s(p.desc_ru), model: s(p.model) })).filter((p) => p.name),
    branches: (d.branches || []).map((x) => ({ name: s(x.name), name_en: s(x.name_en), name_ru: s(x.name_ru), desc: s(x.desc), desc_en: s(x.desc_en), desc_ru: s(x.desc_ru), lat: +x.lat, lng: +x.lng, phone: s(x.phone), hours: s(x.hours), hours_en: s(x.hours_en), hours_ru: s(x.hours_ru) })).filter((x) => isFinite(x.lat) && isFinite(x.lng) && x.name),
    settings: { m3: n(st.m3, S.m3), m6: n(st.m6, S.m6), m12: n(st.m12, S.m12), m24: n(st.m24, S.m24), phone: s(st.phone), instagram: s(st.instagram), youtube: s(st.youtube), telegram: s(st.telegram) },
    reviews: (d.reviews || []).map((r) => ({ name: s(r.name).slice(0, 60), device: s(r.device).slice(0, 80), text: s(r.text).slice(0, 400), rating: Math.min(5, Math.max(1, Math.round(+r.rating || 5))) })).filter((r) => r.name && r.text),
  };
}
async function loadRemote() {
  try {
    const r = await fetch(API, { cache: "no-store" }); if (!r.ok) return;
    const d = await r.json();
    const has = d.exists !== undefined ? d.exists : !!(d.products && d.products.length);
    const next = has ? norm(d) : { ...DB, reviews: norm({ reviews: d.reviews }).reviews };
    const j = JSON.stringify(next); if (j === lastJson) return;
    lastJson = j; DB = next;
    if (has) try { localStorage.setItem(KEY, j); } catch {}
    renderAll(false);
  } catch {}
}
async function post(b, ms = 20000) {
  const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
  try { return await (await fetch(API, { method: "POST", body: JSON.stringify(b), signal: c.signal })).json(); }
  finally { clearTimeout(to); }
}
async function send(action, data) { const x = await post({ action, ...data }); if (!x.ok) throw x.error || "err"; }
const errMsg = (e) => (e === "rate" ? t("err_rate") : t("err_send"));

// ---------- language / theme ----------
function setLang(l) {
  lang = l; document.documentElement.lang = l;
  try { localStorage.setItem("db-lang", l); } catch {}
  document.querySelectorAll("[data-i]").forEach((e) => { const v = t(e.dataset.i); if (v) e.textContent = v; });
  document.querySelectorAll("[data-ph]").forEach((e) => (e.placeholder = t(e.dataset.ph)));
  document.querySelectorAll("[data-aria]").forEach((e) => e.setAttribute("aria-label", t(e.dataset.aria)));
  document.title = t("title");
  $("lang-cur").textContent = { uz: "O'zbek", en: "English", ru: "Русский" }[l];
  document.querySelectorAll(".langsel .menu button").forEach((b) => b.classList.toggle("on", b.dataset.lang === l));
  renderAll(false); document.dispatchEvent(new CustomEvent("db:lang"));
}
function setTheme(dark, ev) {
  const apply = () => { document.documentElement.classList.toggle("dark", dark); try { localStorage.setItem("db-theme", dark ? "dark" : "light"); } catch {} };
  if (!document.startViewTransition || reduce || !ev) return apply();
  const x = ev.clientX, y = ev.clientY, r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.documentElement.classList.add("theming");
  const tr = document.startViewTransition(apply);
  tr.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 700, easing: "cubic-bezier(.16,1,.3,1)", pseudoElement: "::view-transition-new(root)" }));
  tr.finished.finally(() => document.documentElement.classList.remove("theming"));
}

// ---------- render ----------
function renderAll(anim) { renderTop(); renderNav(); renderHero(); renderPicker(); renderShelf(); renderChips(); renderProducts(anim); renderReviews(); renderBranches(); renderFbDevices(); renderAr(); renderCart(); document.dispatchEvent(new CustomEvent("db:data")); }
const link = (kind, v) => { v = v.trim(); if (!v) return ""; if (/^https?:/.test(v)) return v; v = v.replace(/^@/, ""); return kind === "ig" ? "https://instagram.com/" + v : kind === "tg" ? "https://t.me/" + v : "https://youtube.com/@" + v; };
function renderTop() {
  const S = DB.settings, ph = S.phone.trim();
  [["tb-phone"], ["ft-phone"]].forEach(([id]) => { const a = $(id); a.hidden = !ph; if (ph) { a.textContent = ph; a.href = "tel:" + ph.replace(/[^\d+]/g, ""); } });
  const soc = [["ig", S.instagram], ["yt", S.youtube], ["tg", S.telegram]].filter(([, v]) => v.trim()).map(([k, v]) => `<a href="${esc(link(k, v))}" target="_blank" rel="noopener" aria-label="${k}">${SVG[k]}</a>`).join("");
  $("tb-soc").innerHTML = soc; $("ft-soc").innerHTML = soc;
}
function renderNav() {
  const cats = [...new Set(DB.products.map((p) => p.category))], sale = DB.products.some(onSale);
  $("cn").innerHTML = `<button id="mega-btn" aria-expanded="false">${t("nav_all")}${SVG.chev}</button>` +
    cats.slice(0, 6).map((c) => `<a href="#catalog" data-navcat="${esc(c)}">${esc(catLabel(c))}</a>`).join("") +
    (sale ? `<a href="#catalog" class="sale" data-navcat="__sale">${t("nav_sale")}</a>` : "") +
    `<a href="#picker" class="grad" data-nasiya>${t("nav_inst")}</a><a href="#ar">3D</a><a href="#branches">${t("nav_branches")}</a><a href="#contact">${t("nav_contact")}</a>`;
  $("mega-in").innerHTML = `<button data-navcat="all">${t("cat_all")}<small>${DB.products.length}</small></button>` + cats.map((c) => `<button data-navcat="${esc(c)}">${esc(catLabel(c))}<small>${DB.products.filter((p) => p.category === c).length}</small></button>`).join("") + (sale ? `<button data-navcat="__sale" style="color:var(--sale)">${t("nav_sale")}<small>${DB.products.filter(onSale).length}</small></button>` : "");
}
const bdText = (p) => (p.badge ? t("bd_" + p.badge) : onSale(p) ? t("bd_sale") : "");

// hero carousel built from featured products
function renderHero() {
  const list = (DB.products.filter((p) => p.featured).length ? DB.products.filter((p) => p.featured) : DB.products).slice(0, 5);
  const sig = lang + JSON.stringify(list.map((p) => [p.id, p.price, p.oldPrice, p.badge, p.image, p.name])) + JSON.stringify(mk());
  if (sig === hSig) return; hSig = sig;
  $("hero").hidden = !list.length; if (!list.length) return;
  $("slides").innerHTML = list.map((p, i) => { const bd = bdText(p);
    return `<article class="slide s${i % 3}">${bd ? `<span class="ribbon ${p.badge === "new" ? "new" : ""}">${esc(bd)}</span>` : ""}<div><h2 class="sl-t">${esc(p.name.replace("Samsung ", ""))}</h2><p class="sl-s">${esc(loc(p, "desc"))}</p><div class="sl-pill"><span>${t("hs_monthly")}</span><strong>${fmt(mon(p, 24))}<small>${som()}/${t("mo")}</small></strong></div><ul class="sl-ul"><li>${SVG.chk}${t("hs_b1")}</li><li>${SVG.chk}${t("hs_b2")}</li></ul><div class="sl-full">${fmt(p.price)} ${som()}<small>${t("hs_full")}${onSale(p) ? " · -" + off(p) + "%" : ""}</small></div><div class="sl-cta"><button class="btn dark" data-pd="${p.id}">${t("hs_more")}</button><button class="btn" data-req="${p.id}">${t("req_btn")}</button></div></div><div class="sl-img"><img src="${esc(imgSrc(p.image))}" alt="${esc(p.name)}"></div></article>`; }).join("");
  $("dots").innerHTML = list.map((_, i) => `<button data-dot="${i}" aria-label="${i + 1}"></button>`).join("");
  goH(Math.min(hIdx, list.length - 1), true);
}
function goH(i, keep) {
  const n = $("slides").children.length || 1; hIdx = (i + n) % n;
  $("slides").style.transform = `translateX(-${hIdx * 100}%)`;
  document.querySelectorAll("#dots button").forEach((d, k) => d.classList.toggle("on", k === hIdx));
  if (!keep) startAuto();
}
function startAuto() { clearInterval(hTimer); if (reduce) return; hTimer = setInterval(() => { if (!document.hidden && !$("hero").matches(":hover") && !$("hero").contains(document.activeElement)) goH(hIdx + 1, true); }, 6500); }

// use-case picker
const PK = ["study", "photo", "work", "sport"];
function renderPicker() {
  $("pk-tabs").innerHTML = PK.map((k) => `<button class="${k === pk ? "on" : ""}" data-pk="${k}">${t("pk_" + k)}</button>`).join("");
  $("pk-h").textContent = t("pk_" + pk + "_t"); $("pk-p").textContent = t("pk_" + pk + "_d");
  let list = DB.products.filter((p) => p.tags.split(",").map((x) => x.trim()).includes(pk)); if (!list.length) list = DB.products.slice(0, 4);
  $("pk-grid").innerHTML = list.slice(0, 4).map((p) => card(p, false)).join("");
}

const DEV_H = { phone: 230, fold: 200, tablet: 190, watch: 190, earbuds: 150, laptop: 170, tv: 170, headphones: 180 };
const devKey = (p) => { const n = (p.name + " " + p.category).toLowerCase(); return /fold|flip/.test(n) ? "fold" : /watch/.test(n) ? "watch" : /buds|earbud|airpod/.test(n) ? "earbuds" : /tab|planshet/.test(n) ? "tablet" : /laptop|book/.test(n) ? "laptop" : /\btv\b|monitor/.test(n) ? "tv" : /head/.test(n) ? "headphones" : "phone"; };
function renderShelf() {
  const st = $("stage"); st.style.gridTemplateColumns = `repeat(${Math.max(DB.products.length, 1)},minmax(150px,1fr))`;
  st.innerHTML = DB.products.map((p, i) => { const k = devKey(p); return `<button class="dev" data-pd="${p.id}" aria-label="${esc(p.name)}"><span class="fig" style="--i:${i};--h:${DEV_H[k]}px"><svg viewBox="0 0 64 64" aria-hidden="true">${IC[k]}</svg></span><span class="dl"><b>${esc(p.name.replace("Samsung ", "").replace("Galaxy ", ""))}</b><small>${fmt(p.price)} ${som()}</small></span></button>`; }).join("");
}
function renderChips() {
  const cats = ["all", ...new Set(DB.products.map((p) => p.category)), ...(DB.products.some(onSale) ? ["__sale"] : [])];
  if (!cats.includes(cat)) cat = "all";
  $("chips").innerHTML = cats.map((c) => `<button class="chip ${c === cat ? "on" : ""}" data-cat="${esc(c)}">${c === "all" ? t("cat_all") : esc(catLabel(c))}</button>`).join("");
}
function card(p, anim, i = 0) {
  const bd = bdText(p), inCart = !!cart[p.id];
  return `<article class="card ${anim ? "enter" : ""}" style="--i:${Math.min(i, 8)}"><div class="ph" data-pd="${p.id}"><img loading="lazy" src="${esc(imgSrc(p.image))}" alt="${esc(p.name)}">${bd ? `<span class="tg ${p.badge === "new" ? "new" : p.badge === "hit" ? "hit" : ""}">${esc(bd)}</span>` : ""}</div><span class="cat" style="margin-top:12px">${esc(loc(p, "category"))}</span><h3 data-pd="${p.id}" style="margin-top:2px">${esc(p.name)}</h3><p class="d">${esc(loc(p, "desc"))}</p><div class="pr"><b>${fmt(p.price)} ${som()}</b>${onSale(p) ? `<s>${fmt(p.oldPrice)}</s><em>${t("sale_off").replace("{n}", off(p))}</em>` : ""}</div><span class="mo">${moTxt(p)} · 24 ${t("mo")}</span><div class="row"><button class="btn" data-req="${p.id}">${t("req_btn")}</button>${p.model ? `<button class="btn ghost" data-3d="${p.id}" aria-label="3D">3D</button>` : ""}<button class="btn ghost ${inCart ? "on" : ""}" data-add="${p.id}" aria-label="${esc(t("add_cart"))}" title="${esc(t(inCart ? "in_cart" : "add_cart"))}">${inCart ? SVG.chk : SVG.cart}</button></div></article>`;
}
function renderProducts(anim) {
  const q = $("q").value.trim().toLowerCase(), s = $("sort").value;
  let list = DB.products.filter((p) => (cat === "all" || (cat === "__sale" ? onSale(p) : p.category === cat)) && (p.name + " " + loc(p, "category") + " " + loc(p, "desc")).toLowerCase().includes(q));
  if (s !== "def") list = [...list].sort((a, b) => (s === "asc" ? a.price - b.price : b.price - a.price));
  $("count").textContent = t("count").replace("{n}", list.length);
  $("empty").hidden = list.length > 0;
  $("grid").innerHTML = list.map((p, i) => card(p, anim, i)).join("");
}
function renderReviews() {
  reviewList = DB.reviews; $("reviews").hidden = !reviewList.length;
  if (!reviewList.length) return;
  $("t-track").innerHTML = reviewList.map((r) => `<figure><div class="stars" role="img" aria-label="${r.rating}/5">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</div><blockquote>${esc(r.text)}</blockquote><figcaption><b>${esc(r.name)}</b>${r.device ? `<small>${esc(r.device)}</small>` : ""}</figcaption></figure>`).join("");
  $("t-ctl").hidden = reviewList.length < 2; goT(Math.min(tIdx, reviewList.length - 1));
}
function goT(i) { const n = reviewList.length || 1; tIdx = (i + n) % n; $("t-track").style.transform = `translateX(-${tIdx * 100}%)`; $("t-count").textContent = `${tIdx + 1} / ${n}`; }
function renderBranches() {
  const B = DB.branches; if (brCur >= B.length) brCur = 0;
  $("brl").innerHTML = B.map((b, i) => `<div class="br ${i === brCur ? "on" : ""}"><button data-br="${i}"><b>${esc(loc(b, "name"))}</b><small>${esc(loc(b, "desc"))}</small>${loc(b, "hours") ? `<small>${esc(loc(b, "hours"))}</small>` : ""}</button><div class="lk"><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}">${t("br_route")}</a>${b.phone ? `<a href="tel:${esc(b.phone.replace(/\s/g, ""))}">${esc(b.phone)}</a>` : ""}</div></div>`).join("");
  const b = B[brCur], f = $("map");
  if (b) { const u = `https://maps.google.com/maps?q=${b.lat},${b.lng}&z=16&output=embed`; if (f.dataset.u !== u) { f.dataset.u = u; f.src = u; } }
}
function renderFbDevices() { const el = $("fb-device"), cur = el.value; el.innerHTML = `<option value="">${esc(t("fb_general"))}</option>` + DB.products.map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join(""); el.value = cur; }
// 3D: the sample model always stays; admin models are added next to it
const SAMPLE_GLB = "https://modelviewer.dev/shared-assets/models/Astronaut.glb";
let arList = [];
function renderAr() {
  arList = [...DB.products.filter((p) => p.model), { id: 0, name: t("ar_sample"), model: SAMPLE_GLB }];
  $("ar-chips").innerHTML = arList.map((p) => `<button class="chip" data-model="${p.id}">${esc(p.name.replace("Samsung ", ""))}</button>`).join("");
  setModel(arList.some((p) => p.id === mvCur) ? mvCur : arList[0].id);
}
async function setModel(id) {
  mvCur = id; const p = arList.find((x) => x.id === id); if (!p) return;
  document.querySelectorAll("#ar-chips .chip").forEach((c) => c.classList.toggle("on", +c.dataset.model === id));
  if (mvLoaded === id + "|" + p.model) return;
  const st = $("mv-status"); st.hidden = false; st.textContent = "…";
  try { const src = await modelSrc(p.model); if (mvCur === id) { $("mv").setAttribute("src", src); mvLoaded = id + "|" + p.model; st.hidden = true; } }
  catch { st.textContent = t("ar_err"); }
}

// ---------- cart ("selected devices") ----------
const cartItems = () => Object.entries(cart).map(([id, q]) => ({ p: byId(+id), q })).filter((x) => x.p);
function saveCart() { try { localStorage.setItem("db-cart", JSON.stringify(cart)); } catch {} renderCart(); renderProducts(false); renderPicker(); }
function addCart(id) { cart[id] = (cart[id] || 0) + 1; saveCart(); const b = $("cart-n"); b.classList.add("bump"); setTimeout(() => b.classList.remove("bump"), 300); toast(t("in_cart") + " ✓"); }
function renderCart() {
  const it = cartItems(), n = it.reduce((a, x) => a + x.q, 0), sum = it.reduce((a, x) => a + x.q * x.p.price, 0);
  const b = $("cart-n"); b.textContent = n; b.hidden = !n;
  $("cart-list").innerHTML = it.length ? it.map(({ p, q }) => `<div class="ci"><img src="${esc(imgSrc(p.image))}" alt=""><div><b>${esc(p.name)}</b><small>${fmt(p.price)} ${som()}</small></div><div class="qty"><button data-qty="${p.id}:-1">−</button><b>${q}</b><button data-qty="${p.id}:1">+</button></div></div>`).join("") : `<p class="muted" style="text-align:center;padding:2rem 0">${t("cart_empty")}</p>`;
  $("cart-sum").textContent = fmt(sum) + " " + som(); $("cart-send").disabled = !it.length;
}

// ---------- dialogs ----------
function tween(el, from, to, ms = 450) {
  if (reduce) { el.textContent = fmt(to) + " " + som(); return; }
  const t0 = performance.now(); const step = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(from + (to - from) * e) + " " + som(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function openPd(id) {
  pdP = byId(id); if (!pdP) return; const p = pdP;
  $("pd-img").src = imgSrc(p.image); $("pd-cat").textContent = loc(p, "category"); $("pd-name").textContent = p.name; $("pd-desc").textContent = loc(p, "desc");
  $("pd-price").textContent = fmt(p.price) + " " + som(); $("pd-old").textContent = onSale(p) ? fmt(p.oldPrice) : ""; $("pd-off").textContent = onSale(p) ? t("sale_off").replace("{n}", off(p)) : ""; $("pd-off").hidden = !onSale(p);
  $("pd-3d").hidden = !p.model;
  $("c-months").innerHTML = Object.keys(mk()).map((m) => `<button class="chip ${+m === calcM ? "on" : ""}" data-m="${m}">${m} ${t("mo")}</button>`).join("");
  shown = 0; updateCalc(); const d = $("pd-dlg"); if (!d.open) d.showModal();
}
function updateCalc() {
  const p = pdP, total = p.price * (1 + mk()[calcM] / 100), m = total / calcM;
  tween($("c-mo"), shown, m); shown = m; $("c-total").textContent = fmt(total) + " " + som();
  document.querySelectorAll("#c-months .chip").forEach((b) => b.classList.toggle("on", +b.dataset.m === calcM));
}
function openReq(p, fromCart) {
  selCart = !!fromCart; sel = p || null;
  if (fromCart) { const it = cartItems(); sel = { name: it.map((x) => x.p.name + (x.q > 1 ? " ×" + x.q : "")).join("; "), price: it.reduce((a, x) => a + x.q * x.p.price, 0) }; }
  $("rq-form").hidden = false; $("rq-ok").hidden = true; $("rq-err").textContent = ""; $("rq-phone").value = "";
  const fp = $("rq-prod"); fp.hidden = !sel; if (sel) { fp.firstElementChild.textContent = sel.name; fp.lastElementChild.textContent = fmt(sel.price) + " " + som(); }
  const b = $("rq-btn"); b.disabled = false; b.textContent = t("modal_btn");
  document.querySelectorAll("dialog[open]").forEach((d) => d.id !== "rq-dlg" && d.close());
  $("rq-dlg").showModal(); $("rq-phone").focus();
}
const mask = (e) => { const d = e.target.value.replace(/\D/g, "").slice(0, 9); e.target.value = d.replace(/(\d{2})(\d{0,3})(\d{0,2})(\d{0,2})/, (_, a, b, c, f) => [a, b, c, f].filter(Boolean).join(" ")); };
async function submitReq(e) {
  e.preventDefault();
  const phone = $("rq-phone").value;
  if (phone.replace(/\D/g, "").length !== 9) { $("rq-err").textContent = t("phone_err"); $("rq-phone").focus(); return; }
  const b = $("rq-btn"); b.disabled = true; b.innerHTML = `<span class="spin"></span> ${t("sending")}`;
  try {
    await send("request", { phone: "+998 " + phone, product: sel ? sel.name : "", price: sel ? sel.price : "", lang, hp: $("rq-hp").value });
    $("rq-msg").textContent = (sel ? t("sms_p") : t("sms_l")).replace("{phone}", phone).replace("{name}", sel ? sel.name : "");
    $("rq-form").hidden = true; $("rq-ok").hidden = false;
    if (selCart) { cart = {}; saveCart(); }
  } catch (x) { $("rq-err").textContent = errMsg(x); b.disabled = false; b.textContent = t("modal_btn"); }
}
async function submitContact(e) {
  e.preventDefault(); const err = $("ct-err"); err.textContent = "";
  const name = $("ct-name").value.trim(), phone = $("ct-phone").value, text = $("ct-text").value.trim();
  if (name.length < 2) { err.textContent = t("ct_e_name"); $("ct-name").focus(); return; }
  if (phone.replace(/\D/g, "").length !== 9) { err.textContent = t("phone_err"); $("ct-phone").focus(); return; }
  if (text.length < 10) { err.textContent = t("ct_e_text"); $("ct-text").focus(); return; }
  const b = $("ct-btn"); b.disabled = true; b.innerHTML = `<span class="spin"></span> ${t("sending")}`;
  try { await send("message", { name, phone: "+998 " + phone, topic: $("ct-topic").value, text, lang, hp: $("ct-hp").value }); $("ct-form").hidden = true; $("ct-done").hidden = false; }
  catch (x) { err.textContent = errMsg(x); }
  b.disabled = false; b.textContent = t("ct_send");
}
function setStars(n, preview) { document.querySelectorAll("#stars .star").forEach((b, i) => { b.classList.toggle("on", i < n); b.setAttribute("aria-checked", String(!preview && i + 1 === rating)); }); }
async function submitFeedback(e) {
  e.preventDefault(); const err = $("fb-err"); err.textContent = "";
  const name = $("fb-name").value.trim(), text = $("fb-text").value.trim();
  if (name.length < 2) { err.textContent = t("fb_e_name"); $("fb-name").focus(); return; }
  if (!rating) { err.textContent = t("fb_e_rating"); return; }
  if (text.length < 10) { err.textContent = t("fb_e_text"); $("fb-text").focus(); return; }
  let last = 0; try { last = +localStorage.getItem("db-fb-last") || 0; } catch {}
  if (Date.now() - last < 60000) { err.textContent = t("err_rate"); return; }
  const b = $("fb-btn"); b.disabled = true; b.innerHTML = `<span class="spin"></span> ${t("sending")}`;
  try { await send("feedback", { name, rating, device: $("fb-device").value, text, hp: $("fb-hp").value }); try { localStorage.setItem("db-fb-last", Date.now()); } catch {} $("fb-form").hidden = true; $("fb-done").hidden = false; }
  catch (x) { err.textContent = errMsg(x); }
  b.disabled = false; b.textContent = t("fb_send");
}
function openSearch() { const d = $("sr-dlg"); $("sr-q").value = ""; $("sr-res").innerHTML = ""; d.showModal(); $("sr-q").focus(); }
function runSearch() {
  const q = $("sr-q").value.trim().toLowerCase(); if (!q) { $("sr-res").innerHTML = ""; return; }
  const list = DB.products.filter((p) => (p.name + " " + loc(p, "category") + " " + loc(p, "desc")).toLowerCase().includes(q)).slice(0, 8);
  $("sr-res").innerHTML = list.length ? list.map((p) => `<button class="sr-it" data-pd="${p.id}"><img src="${esc(imgSrc(p.image))}" alt=""><span><b>${esc(p.name)}</b><small>${esc(loc(p, "category"))}</small></span><b>${fmt(p.price)} ${som()}</b></button>`).join("") : `<p class="muted" style="padding:1rem">${t("sr_none")}</p>`;
}
function toCatalog(c) { cat = c; renderChips(); renderProducts(true); $("catalog").scrollIntoView({ behavior: "smooth" }); }

// ---------- background: orbits carrying device icons ----------
function initOrbits() {
  const ns = "http://www.w3.org/2000/svg", g = $("rings"), svg = document.querySelector("#bg svg");
  const ORDER = ["phone", "watch", "earbuds", "tablet", "headphones", "camera", "drone", "keyboard", "speaker", "router", "gamepad", "mic", "monitor", "mouse", "usb", "printer", "camcorder", "radio", "webcam", "fold", "pc", "tv", "laptop", "handheld", "actioncam", "phonetab"];
  const N = 9, rings = [], orbs = [];
  for (let i = 0; i < N; i++) { const e = document.createElementNS(ns, "ellipse"); e.setAttribute("pathLength", 1); e.style.setProperty("--i", i); e.style.opacity = 1 - i * 0.07; g.appendChild(e); rings.push(e); }
  ORDER.forEach((k, n) => { const i = 1 + (n % (N - 1)), o = document.createElementNS(ns, "g"); o.setAttribute("class", "oi"); o.innerHTML = `<g class="oic">${IC[k]}</g>`; g.appendChild(o); orbs.push({ el: o, ring: i, a: (n * 2.399) % (Math.PI * 2), w: (i % 2 ? 1 : -1) * (0.05 - 0.004 * i), s: 0.62 }); });
  let W, H, BASE, tx = 0, ty = 0, px = -9999, py = -9999, ox = 0, oy = 0;
  const radius = (i) => BASE * (0.14 + i * 0.085);
  function layout() { W = innerWidth; H = innerHeight; BASE = Math.max(W, 900); svg.setAttribute("viewBox", `0 0 ${W} ${H}`); g.setAttribute("transform", `translate(${W * 0.64} ${H * 0.5}) rotate(-22)`); rings.forEach((e, i) => { e.setAttribute("rx", radius(i)); e.setAttribute("ry", radius(i) * 0.42); }); }
  layout(); addEventListener("resize", layout);
  addEventListener("pointermove", (e) => { tx = (e.clientX / W - 0.5) * 34; ty = (e.clientY / H - 0.5) * 22; if (e.pointerType === "mouse") { px = e.clientX; py = e.clientY; } });
  document.documentElement.addEventListener("pointerleave", () => { px = py = -9999; });
  const R = 150, GROW = 1.9, t0 = performance.now(); let last = t0;
  (function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    ox += (tx - ox) * 0.06; oy += (ty - oy) * 0.06;
    svg.style.transform = `translate(${ox}px,${oy}px) rotate(${scrollY * 0.01}deg)`;
    const counter = 22 - scrollY * 0.01, intro = Math.min(1, Math.max(0, (now - t0 - 1200) / 1400)), near = px > -9000;
    orbs.forEach((o) => {
      if (!reduce) o.a += o.w * dt;
      const rx = radius(o.ring), x = rx * Math.cos(o.a), y = rx * 0.42 * Math.sin(o.a);
      let k = 0;
      if (near) { const r = o.el.getBoundingClientRect(); k = Math.max(0, 1 - Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2)) / R); }
      o.s += (0.62 * (1 + (GROW - 1) * k * k) - o.s) * 0.18;
      o.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${counter.toFixed(2)}) scale(${o.s.toFixed(3)}) translate(-32 -32)`);
      o.el.style.opacity = ((0.3 + 0.7 * k) * intro).toFixed(2);
      o.el.classList.toggle("hot", k > 0.4);
    });
    requestAnimationFrame(frame);
  })(t0);
}
function initStage() {
  const st = $("stage"), R = 260, MAX = 0.16; let px = -9999, py = -9999, busy = false;
  const magnify = () => { const sr = st.getBoundingClientRect(); st.querySelectorAll(".fig").forEach((f) => { const cx = sr.left + f.offsetLeft + f.offsetWidth / 2 - st.scrollLeft, cy = sr.top + f.offsetTop + f.offsetHeight / 2, k = Math.max(0, 1 - Math.hypot(px - cx, py - cy) / R); f.style.setProperty("--s", (1 + MAX * k * k).toFixed(3)); }); };
  addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; px = e.clientX; py = e.clientY; if (!busy) { busy = true; requestAnimationFrame(() => { busy = false; magnify(); }); } });
  document.documentElement.addEventListener("pointerleave", () => { px = py = -9999; magnify(); });
  new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { st.classList.add("in"); io.disconnect(); } }, { threshold: 0.2 }).observe(st);
}

// ---------- events ----------
const closeMega = () => { $("mega").classList.remove("open"); const b = $("mega-btn"); if (b) b.setAttribute("aria-expanded", "false"); };
document.addEventListener("click", (e) => {
  const q = (s) => e.target.closest(s); let el;
  if (!q("#langsel")) $("langsel").classList.remove("open");
  if (!q("#mega") && !q("#mega-btn")) closeMega();
  if ((el = q("#mega-btn"))) { const o = $("mega").classList.toggle("open"); el.setAttribute("aria-expanded", String(o)); return; }
  if ((el = q("[data-navcat]"))) { closeMega(); $("cn").classList.remove("open"); toCatalog(el.dataset.navcat); e.preventDefault(); return; }
  if ((el = q("[data-nasiya]"))) { e.preventDefault(); const p = DB.products.find((x) => x.featured) || DB.products[0]; if (p) openPd(p.id); return; }
  if ((el = q("[data-req]"))) return openReq(byId(+el.dataset.req));
  if ((el = q("[data-pd]"))) { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); return openPd(+el.dataset.pd); }
  if ((el = q("[data-add]"))) return addCart(+el.dataset.add);
  if ((el = q("[data-qty]"))) { const [id, d] = el.dataset.qty.split(":"); cart[id] = (cart[id] || 0) + +d; if (cart[id] <= 0) delete cart[id]; return saveCart(); }
  if ((el = q("[data-3d]"))) { setModel(+el.dataset["3d"]); return $("ar").scrollIntoView({ behavior: "smooth" }); }
  if ((el = q("[data-model]"))) return setModel(+el.dataset.model);
  if ((el = q("[data-cat]"))) { cat = el.dataset.cat; renderChips(); return renderProducts(true); }
  if ((el = q("[data-pk]"))) { pk = el.dataset.pk; return renderPicker(); }
  if ((el = q("[data-br]"))) { brCur = +el.dataset.br; return renderBranches(); }
  if ((el = q("[data-m]"))) { calcM = +el.dataset.m; return updateCalc(); }
  if ((el = q("[data-sl]"))) return goH(hIdx + +el.dataset.sl);
  if ((el = q("[data-dot]"))) return goH(+el.dataset.dot);
  if ((el = q("[data-lang]"))) { $("langsel").classList.remove("open"); return setLang(el.dataset.lang); }
  if ((el = q("[data-t]"))) return goT(tIdx + +el.dataset.t);
  if ((el = q("[data-faq]"))) { const it = el.parentElement, open = !it.classList.contains("open"); document.querySelectorAll(".faq-item").forEach((i) => { i.classList.remove("open"); i.firstElementChild.setAttribute("aria-expanded", "false"); }); if (open) { it.classList.add("open"); el.setAttribute("aria-expanded", "true"); } return; }
  if (q("[data-close]")) return q("dialog").close();
  if (e.target.tagName === "DIALOG") e.target.close();
});
document.addEventListener("DOMContentLoaded", () => {
  $("lang-btn").onclick = () => $("langsel").classList.toggle("open");
  $("burger").onclick = () => $("cn").classList.toggle("open");
  $("theme").onclick = (e) => setTheme(!document.documentElement.classList.contains("dark"), e);
  $("call").onclick = () => openReq(null);
  $("b-search").onclick = openSearch; $("sr-q").oninput = runSearch;
  $("sr-q").onkeydown = (e) => { if (e.key === "Enter") { const v = $("sr-q").value; $("sr-dlg").close(); $("q").value = v; cat = "all"; renderChips(); renderProducts(true); $("catalog").scrollIntoView({ behavior: "smooth" }); } };
  $("b-cart").onclick = () => { renderCart(); $("cart-dlg").showModal(); };
  $("cart-send").onclick = () => openReq(null, true);
  $("cart-clear").onclick = () => { cart = {}; saveCart(); };
  $("pd-req").onclick = () => { const p = pdP; $("pd-dlg").close(); openReq(p); };
  $("pd-add").onclick = () => addCart(pdP.id);
  $("pd-3d").onclick = () => { const id = pdP.id; $("pd-dlg").close(); setModel(id); $("ar").scrollIntoView({ behavior: "smooth" }); };
  $("q").oninput = () => renderProducts(true); $("sort").onchange = () => renderProducts(true);
  $("reset").onclick = () => { cat = "all"; $("q").value = ""; $("sort").value = "def"; renderChips(); renderProducts(true); };
  $("rq").onsubmit = submitReq; $("ct-form").onsubmit = submitContact; $("fb-form").onsubmit = submitFeedback;
  $("ct-again").onclick = () => { ["ct-name", "ct-phone", "ct-text"].forEach((i) => ($(i).value = "")); $("ct-count").textContent = "0 / 600"; $("ct-form").hidden = false; $("ct-done").hidden = true; };
  ["rq-phone", "ct-phone"].forEach((i) => $(i).addEventListener("input", mask));
  [["ct-text", "ct-count", 600], ["fb-text", "fb-count", 400]].forEach(([a, b, n]) => $(a).addEventListener("input", (e) => ($(b).textContent = e.target.value.length + " / " + n)));
  $("stars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="star" role="radio" aria-checked="false" aria-label="${n}" data-star="${n}">★</button>`).join("");
  $("stars").addEventListener("click", (e) => { const b = e.target.closest("[data-star]"); if (b) { rating = +b.dataset.star; setStars(rating); } });
  $("stars").addEventListener("mouseover", (e) => { const b = e.target.closest("[data-star]"); if (b) setStars(+b.dataset.star, true); });
  $("stars").addEventListener("mouseleave", () => setStars(rating));
  addEventListener("keydown", (e) => { if (e.key === "/" && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "") && !document.querySelector("dialog[open]")) { e.preventDefault(); openSearch(); } });
  // swipe on the hero
  let sx = null; $("hero").addEventListener("pointerdown", (e) => { sx = e.clientX; }); $("hero").addEventListener("pointerup", (e) => { if (sx != null && Math.abs(e.clientX - sx) > 50) goH(hIdx + (e.clientX < sx ? 1 : -1)); sx = null; });
  // header hides while scrolling down, returns when scrolling up
  let lastY = 0; addEventListener("scroll", () => { const y = scrollY, h = y > lastY + 6 && y > 200 && !$("cn").classList.contains("open"); if (h || y < lastY - 6) { $("hdr").classList.toggle("hide", h); document.documentElement.classList.toggle("nav-hidden", h); } lastY = y; }, { passive: true });
  // secret entry: tap the "db" in the footer 4 times
  let taps = 0, tapT; $("secret").addEventListener("click", () => { taps++; clearTimeout(tapT); tapT = setTimeout(() => (taps = 0), 1500); if (taps >= 4) { taps = 0; location.href = "admin.html"; } });

  let sl = null, st = null;
  try { sl = localStorage.getItem("db-lang"); st = localStorage.getItem("db-theme"); const c = localStorage.getItem(KEY); if (c) DB = norm(JSON.parse(c)); } catch {}
  document.documentElement.classList.toggle("dark", st === "dark");
  initOrbits(); initStage();
  const nv = (navigator.language || "").slice(0, 2);
  setLang(["uz", "en", "ru"].includes(sl) ? sl : ["en", "ru"].includes(nv) ? nv : "uz");
  renderProducts(true); startAuto(); loadRemote();
  setInterval(loadRemote, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadRemote(); });
});
window.DBAPP = { t, esc, post, API, GAS, getLang: () => lang, getSettings: () => DB.settings, toast };
})();
