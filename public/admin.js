(() => {
"use strict";
const $ = (id) => document.getElementById(id), CFG = window.SITE_CONFIG || {}, API = CFG.API || "/api", TK = "db-adm";
const GAS = /script\.google(usercontent)?\.com/.test(API);        // Apps Script: login+parol har so'rovda; Netlify: token
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Math.round(+n || 0).toLocaleString("en-US").replace(/,/g, " ");
const fmtDate = (d) => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }); };
function toast(m) { const e = $("toast"); e.textContent = m; e.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove("show"), 3400); }
const imgSrc = (v) => { v = String(v || ""); return v.startsWith("drive:") ? "https://drive.google.com/thumbnail?id=" + v.slice(6) + "&sz=w200" : v.startsWith("blob:") ? API + "?img=" + v.slice(5) : v; };
const isFile = (v) => /^(drive:|blob:|data:)/.test(String(v));

let AUTH = null, ADM = null, INBOX = { requests: [], feedback: [], messages: [], chats: [] }, tab = "products", chatSid = "";
const A = (b) => ({ ...b, ...AUTH });
async function post(b, ms = 30000) {
  const c = new AbortController(), to = setTimeout(() => c.abort(), ms);
  try { const x = await (await fetch(API, { method: "POST", body: JSON.stringify(b), signal: c.signal })).json(); if (x.error === "auth" && AUTH && b.action !== "login") { logout(); toast("Sessiya tugadi. Qayta kiring."); } return x; }
  finally { clearTimeout(to); }
}
function logout() { AUTH = null; sessionStorage.removeItem(TK); $("app").hidden = true; $("login").hidden = false; }
$("out").onclick = logout;
$("lf").onsubmit = async (e) => {
  e.preventDefault(); $("l-err").textContent = ""; const b = $("l-btn"); b.disabled = true; b.innerHTML = '<span class="spin"></span> Kirilmoqda…';
  const login = $("l-u").value.trim(), password = $("l-p").value;
  try {
    const x = await post({ action: "login", login, password });
    if (!x.ok) { $("l-err").textContent = x.error === "rate" ? "Ko'p urinish. Birozdan keyin qayta urining." : x.error === "config" ? "Serverda login/parol sozlanmagan." : "Login yoki parol noto'g'ri"; return; }
    AUTH = x.token ? { token: x.token } : { login, password };
    if (x.token) sessionStorage.setItem(TK, x.token);
    boot();
  } catch { $("l-err").textContent = "Serverga ulanib bo'lmadi."; }
  finally { b.disabled = false; b.textContent = "Kirish"; }
};
async function boot() {
  $("login").hidden = true; $("app").hidden = false;
  $("mode").textContent = (GAS ? "Server: Google Apps Script" : "Server: Netlify") + ". Saqlangach o'zgarishlar hamma qurilmada ko'rinadi.";
  let d = null; try { d = await (await fetch(API, { cache: "no-store" })).json(); } catch {}
  const has = d && (d.exists !== undefined ? d.exists : !!(d.products && d.products.length));
  const src = has ? d : window.DEFAULT_DATA;
  const S = window.DEFAULT_DATA.settings, st = Object.assign({}, S, src.settings || {});
  ADM = { products: structuredClone(src.products || []).map((p) => ({ category_en: "", category_ru: "", desc_en: "", desc_ru: "", model: "", oldPrice: 0, tags: "", badge: "", ...p, featured: p.featured === true || p.featured === "true", oldPrice: +p.oldPrice || 0, price: +p.price || 0, id: +p.id })), branches: structuredClone(src.branches || []).map((b) => ({ name_en: "", name_ru: "", desc_en: "", desc_ru: "", hours_en: "", hours_ru: "", phone: "", hours: "", ...b, lat: +b.lat, lng: +b.lng })), settings: { m3: +st.m3, m6: +st.m6, m12: +st.m12, m24: +st.m24, phone: String(st.phone || ""), instagram: String(st.instagram || ""), youtube: String(st.youtube || ""), telegram: String(st.telegram || "") } };
  render(); loadInbox();
}
async function loadInbox() {
  const x = await post(A({ action: "adminData" }));
  if (x.ok) { INBOX = { requests: x.requests || [], feedback: x.feedback || [], messages: x.messages || [], chats: x.chats || [] }; render(); }
}
const ed = (list, i, k, v, num) => { ADM[list][i][k] = num ? Number(v) : v; };
const es = (k, v) => { ADM.settings[k] = ["phone", "instagram", "youtube", "telegram"].includes(k) ? v : Number(v); };
function add(list) { ADM[list].push(list === "products" ? { id: Math.max(0, ...ADM.products.map((p) => +p.id || 0)) + 1, name: "", category: "Smartfon", category_en: "", category_ru: "", price: 0, oldPrice: 0, featured: false, tags: "", badge: "", image: "", desc: "", desc_en: "", desc_ru: "", model: "" } : { name: "", name_en: "", name_ru: "", desc: "", desc_en: "", desc_ru: "", lat: 41.55, lng: 60.63, phone: "", hours: "", hours_en: "", hours_ru: "" }); render(); }
function del(list, i) { if (confirm("O'chirilsinmi?")) { ADM[list].splice(i, 1); render(); } }
function coord(i, e) { const m = (e.clipboardData || window.clipboardData).getData("text").match(/(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)/); if (m) { e.preventDefault(); ADM.branches[i].lat = +m[1]; ADM.branches[i].lng = +m[2]; render(); } }
function compress(file, max, q) { return new Promise((res, rej) => { const img = new Image(), u = URL.createObjectURL(file); img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); res(c.toDataURL("image/jpeg", q)); }; img.onerror = () => { URL.revokeObjectURL(u); rej(); }; img.src = u; }); }
async function upImg(i, input) {
  const f = input.files[0]; if (!f) return;
  if (!/^image\//.test(f.type)) { toast("Faqat rasm fayli tanlang"); input.value = ""; return; }
  toast("Yuklanmoqda…");
  try { const url = await compress(f, 1000, 0.82); const x = await post(A({ action: "uploadImage", filename: f.name.replace(/\.[^.]+$/, ""), data: url.split(",")[1] }), 60000); if (!x.ok) throw 0; ADM.products[i].image = (GAS ? "drive:" : "blob:") + x.id; render(); toast("Rasm yuklandi. Saqlashni bosing."); }
  catch { toast("Rasmni yuklab bo'lmadi"); }
}
function upModel(i, input) {
  const f = input.files[0]; if (!f) return; const max = GAS ? 15 : 3;
  if (f.size > max * 1024 * 1024) { toast(`Fayl ${max} MB dan kichik bo'lsin yoki URL kiriting`); input.value = ""; return; }
  toast("Yuklanmoqda…"); const r = new FileReader();
  r.onload = async () => { try { const x = await post(A({ action: "upload", filename: f.name, data: String(r.result).split(",")[1] }), 120000); if (!x.ok) throw 0; ADM.products[i].model = (GAS ? "drive:" : "blob:") + x.id; render(); toast("Model yuklandi. Saqlashni bosing."); } catch { toast("Yuklab bo'lmadi"); } };
  r.readAsDataURL(f);
}
$("save").onclick = async () => {
  for (const p of ADM.products) if (!String(p.name).trim() || !(+p.price > 0)) { toast("Har bir mahsulotga nom va narx kiriting"); return; }
  for (const b of ADM.branches) if (!String(b.name).trim() || !(Math.abs(b.lat) <= 90) || !(Math.abs(b.lng) <= 180)) { toast("Filial nomi va koordinatalarini tekshiring"); return; }
  const btn = $("save"); btn.disabled = true;
  try { const x = await post(A({ action: "save", products: ADM.products, branches: ADM.branches, settings: ADM.settings })); toast(x.ok ? "Saqlandi. Hamma qurilmalarda ko'rinadi." : "Saqlab bo'lmadi"); } catch { toast("Serverga ulanib bo'lmadi"); }
  btn.disabled = false;
};
const ST = { requests: [["new", "Yangi"], ["contacted", "Bog'lanildi"], ["done", "Yopildi"]], messages: [["new", "Yangi"], ["read", "O'qildi"], ["done", "Hal qilindi"]], feedback: [["pending", "Kutilmoqda"], ["approved", "Ko'rsatilsin"], ["hidden", "Yashirin"]] };
const TOPIC = { question: "Savol", suggestion: "Taklif", complaint: "Shikoyat", other: "Boshqa" };
async function setStatus(sheet, id, status) { const x = await post(A({ action: "update", sheet, id, status })); if (x.ok) { const r = INBOX[sheet].find((r) => r.id === id); if (r) r.status = status; toast("Yangilandi"); } else toast("Yangilab bo'lmadi"); render(); }
async function rm(sheet, id) { if (!confirm("O'chirilsinmi?")) return; const x = await post(A({ action: "remove", sheet, id })); if (x.ok) INBOX[sheet] = INBOX[sheet].filter((r) => r.id !== id); else toast("O'chirib bo'lmadi"); render(); }
async function tgTest() { toast("Yuborilmoqda…"); try { const x = await post(A({ action: "telegramTest" })); toast(x.ok ? "Telegramga test xabar yuborildi" : "Telegram: " + (x.message || x.error || "xato")); } catch { toast("Serverga ulanib bo'lmadi"); } }
const cnt = (s, v) => INBOX[s].filter((r) => r.status === v).length, lbl = (t, n) => t + (n ? " (" + n + ")" : "");
function setTab(k) { tab = k; render(); }
function render() {
  $("tabs").innerHTML = [["products", "Mahsulotlar"], ["branches", "Filiallar"], ["requests", lbl("So'rovlar", cnt("requests", "new"))], ["messages", lbl("Murojaatlar", cnt("messages", "new"))], ["chats", lbl("Chat", sessions().filter((x) => x.waiting).length)], ["feedback", lbl("Fikrlar", cnt("feedback", "pending"))], ["settings", "Sozlamalar"]].map(([k, l]) => `<button class="chip ${k === tab ? "on" : ""}" onclick="AD.setTab('${k}')">${l}</button>`).join("");
  const L = (t, inner, c = "s2") => `<label class="f ${c}">${t}${inner}</label>`;
  const I_ = (list, i, k, label, span = "s2", type = "text") => L(label, `<input type="${type}" value="${esc(ADM[list][i][k])}" oninput="AD.ed('${list}',${i},'${k}',this.value${type === "number" ? ",1" : ""})">`, span);
  const so = (arr, cur) => arr.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("");
  const head = (n) => `<div style="display:flex;justify-content:space-between;align-items:center"><span class="muted" style="font-size:.9rem">${n} ta</span><button class="btn ghost sm" onclick="AD.loadInbox()">Yangilash</button></div>`;
  const none = '<p class="muted">Hozircha hech narsa yo\'q.</p>', phoneLink = (p) => `<a href="tel:${esc(String(p).replace(/\s/g, ""))}" style="color:var(--accent);font-weight:700">${esc(p)}</a>`;
  let h = "";
  if (tab === "products") {
    h = `<datalist id="cats">${[...new Set(ADM.products.map((p) => p.category))].map((c) => `<option value="${esc(c)}">`).join("")}</datalist>` + ADM.products.map((p, i) => `<div class="panel pn ag">` +
      I_("products", i, "name", "Nomi", "s2") + L("Kategoriya", `<input list="cats" value="${esc(p.category)}" oninput="AD.ed('products',${i},'category',this.value)">`) + I_("products", i, "price", "Narx (so'm)", "s1", "number") +
      L("Rasm (URL yoki fayl)", `<div style="display:flex;gap:8px;align-items:center">${p.image ? `<img src="${esc(imgSrc(p.image))}" alt="" style="width:40px;height:40px;border-radius:10px;object-fit:cover;flex-shrink:0">` : ""}<input value="${isFile(p.image) ? "" : esc(p.image)}" placeholder="${isFile(p.image) ? "Yuklangan fayl" : "https://…"}" oninput="AD.ed('products',${i},'image',this.value)"><span class="btn ghost sm ftag" onclick="this.nextElementSibling.click()">Yuklash</span><input type="file" accept="image/*" hidden onchange="AD.upImg(${i},this)"></div>`, "s2") +
      I_("products", i, "oldPrice", "Eski narx (chegirma)", "s1", "number") + L("Belgi", `<select onchange="AD.ed('products',${i},'badge',this.value)">${[["", "—"], ["sale", "AKSIYA"], ["new", "YANGI"], ["hit", "OMMABOP"]].map(([v, l]) => `<option value="${v}" ${v === p.badge ? "selected" : ""}>${l}</option>`).join("")}</select>`, "s1") +
      I_("products", i, "tags", "Teglar: study, photo, work, sport", "s2") + L("Bosh sahifa bannerida", `<label style="display:flex;gap:8px;align-items:center;font-size:.9rem;color:var(--fg)"><input type="checkbox" style="width:auto" ${p.featured ? "checked" : ""} onchange="AD.ed('products',${i},'featured',this.checked)"> Ko'rsatilsin</label>`, "s2") +
      I_("products", i, "desc", "Tavsif", "s3") +
      L(`3D model (.glb URL yoki fayl ≤${GAS ? 15 : 3}MB)`, `<div style="display:flex;gap:8px"><input value="${esc(p.model)}" placeholder="https://… yoki yuklang" oninput="AD.ed('products',${i},'model',this.value)"><span class="btn ghost sm ftag" onclick="this.nextElementSibling.click()">Yuklash</span><input type="file" accept=".glb" hidden onchange="AD.upModel(${i},this)"></div>`, "s2") +
      `<button class="btn ghost" onclick="AD.del('products',${i})">O'chirish</button>` +
      `<details class="s6"><summary>Tarjimalar (EN / RU)</summary><div class="ag" style="margin-top:10px">${I_("products", i, "category_en", "Kategoriya EN", "s1") + I_("products", i, "category_ru", "Kategoriya RU", "s1") + I_("products", i, "desc_en", "Tavsif EN", "s2") + I_("products", i, "desc_ru", "Tavsif RU", "s2")}</div></details></div>`).join("") + `<button class="btn ghost" onclick="AD.add('products')">+ Mahsulot qo'shish</button>`;
  } else if (tab === "branches") {
    h = `<p class="muted" style="margin:0;font-size:.88rem">Koordinata: Google Maps'da joyni o'ng tugma bilan bosing, raqamlarni nusxalang va "Kenglik" maydoniga qo'ying: ikkalasi to'ladi.</p>` + ADM.branches.map((b, i) => `<div class="panel pn ag">` +
      I_("branches", i, "name", "Filial nomi", "s2") + I_("branches", i, "desc", "Tavsif", "s4") +
      L("Kenglik (lat)", `<input value="${b.lat}" onpaste="AD.coord(${i},event)" oninput="AD.ed('branches',${i},'lat',this.value,1)">`, "s1") + I_("branches", i, "lng", "Uzunlik (lng)", "s1", "number") + I_("branches", i, "phone", "Telefon", "s2") + I_("branches", i, "hours", "Ish vaqti", "s2") +
      `<div style="display:flex;gap:8px"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${b.lat},${b.lng}">Tekshirish</a><button class="btn ghost sm" onclick="AD.del('branches',${i})">O'chirish</button></div>` +
      `<details class="s6"><summary>Tarjimalar (EN / RU)</summary><div class="ag" style="margin-top:10px">${I_("branches", i, "name_en", "Nomi EN", "s2") + I_("branches", i, "name_ru", "Nomi RU", "s2") + I_("branches", i, "hours_en", "Ish vaqti EN", "s1") + I_("branches", i, "hours_ru", "Ish vaqti RU", "s1") + I_("branches", i, "desc_en", "Tavsif EN", "s3") + I_("branches", i, "desc_ru", "Tavsif RU", "s3")}</div></details></div>`).join("") + `<button class="btn ghost" onclick="AD.add('branches')">+ Filial qo'shish</button>`;
  } else if (tab === "requests") {
    h = head(INBOX.requests.length) + (INBOX.requests.map((r) => `<div class="panel pn ag"><div class="s2">${phoneLink(r.phone)}<div class="muted" style="font-size:.78rem">${fmtDate(r.date)}${r.lang ? " / " + esc(r.lang) : ""}</div></div><div class="s2"><b>${esc(r.product || "Umumiy so'rov")}</b>${r.price ? `<div class="muted" style="font-size:.85rem">${fmt(r.price)} so'm</div>` : ""}</div><select onchange="AD.setStatus('requests','${esc(r.id)}',this.value)">${so(ST.requests, r.status)}</select><button class="btn ghost sm" onclick="AD.rm('requests','${esc(r.id)}')">O'chirish</button></div>`).join("") || none);
  } else if (tab === "messages") {
    h = head(INBOX.messages.length) + (INBOX.messages.map((r) => `<div class="panel pn ag" style="align-items:start"><div class="s4"><div><b>${esc(r.name)}</b> ${phoneLink(r.phone)} <span class="muted" style="font-size:.78rem">${esc(TOPIC[r.topic] || "")}${r.lang ? " / " + esc(r.lang) : ""}</span></div><div class="muted" style="font-size:.78rem;margin-bottom:6px">${fmtDate(r.date)}</div><p style="margin:0;font-size:.92rem">${esc(r.text)}</p></div><select onchange="AD.setStatus('messages','${esc(r.id)}',this.value)">${so(ST.messages, r.status)}</select><button class="btn ghost sm" onclick="AD.rm('messages','${esc(r.id)}')">O'chirish</button></div>`).join("") || none);
  } else if (tab === "feedback") {
    h = head(INBOX.feedback.length) + (INBOX.feedback.map((r) => `<div class="panel pn ag" style="align-items:start"><div class="s4"><div><b>${esc(r.name)}</b> <span style="color:var(--tag)">${"★".repeat(+r.rating || 0)}${"☆".repeat(5 - (+r.rating || 0))}</span></div><div class="muted" style="font-size:.78rem;margin-bottom:6px">${fmtDate(r.date)}${r.device ? " / " + esc(r.device) : ""}</div><p style="margin:0;font-size:.92rem">${esc(r.text)}</p></div><select onchange="AD.setStatus('feedback','${esc(r.id)}',this.value)">${so(ST.feedback, r.status)}</select><button class="btn ghost sm" onclick="AD.rm('feedback','${esc(r.id)}')">O'chirish</button></div>`).join("") || none);
  } else if (tab === "chats") {
    h = chatShell();
  } else {
    const S = ADM.settings;
    h = `<div class="panel pn ag">` + [["phone", "Telefon (yuqori panel va chat)"], ["telegram", "Telegram (@kanal yoki havola)"], ["instagram", "Instagram (@nom yoki havola)"], ["youtube", "YouTube (@nom yoki havola)"]].map(([k, l]) => L(l, `<input value="${esc(S[k])}" oninput="AD.es('${k}',this.value)">`, "s3")).join("") + `</div><div class="panel pn ag">` + [3, 6, 12, 24].map((m) => L(`${m} oylik ustama (%)`, `<input type="number" value="${S["m" + m]}" oninput="AD.es('m${m}',this.value)">`, "s1")).join("") + `<p class="muted s6" style="margin:0;font-size:.88rem">Nasiyada narxga qo'shiladigan foiz. Masalan 12 oy uchun 38 bo'lsa, narx 1,38 baravar bo'ladi.</p></div>` +
      `<div class="panel pn"><h3 style="margin:0 0 .3rem">Telegram xabarnomasi</h3><p class="muted" style="margin:0 0 1rem;font-size:.9rem">Yangi so'rov, murojaat va fikrlar Telegram kanalga keladi. Bot tokeni va kanal ID si serverda sozlanadi (README ga qarang). Quyidagi tugma ulanishni tekshiradi.</p><button class="btn ghost" onclick="AD.tgTest()">Telegramni tekshirish</button></div>`;
  }
  $("body").innerHTML = h;
  if (tab === "chats") chatPanes();
}
// ---------- chat (operator) ----------
function sessions() {
  const by = {};
  INBOX.chats.forEach((r) => { (by[r.sid] = by[r.sid] || []).push(r); });
  return Object.entries(by).map(([sid, m]) => {
    m.sort((a, b) => (a.date < b.date ? -1 : 1));
    let esc = false; m.forEach((r) => { if (r.from === "system") esc = r.text === "handoff" ? true : r.text === "resume" ? false : esc; });
    const vis = m.filter((r) => r.from !== "system"), last = vis[vis.length - 1];
    return { sid, m, esc, last, waiting: esc && last && last.from === "user" };
  }).filter((x) => x.last).sort((a, b) => (a.last.date < b.last.date ? 1 : -1));
}
const who = { user: "Mijoz", bot: "Konsultant", operator: "Operator" };
function chatShell() {
  return `<div class="ag" style="grid-template-columns:minmax(220px,1fr) 2fr;align-items:start"><div class="stack" id="c-list"></div><div class="panel pn" id="c-box"></div></div>`;
}
function chatPanes() {
  const ss = sessions(); if (!chatSid && ss[0]) chatSid = ss[0].sid;
  const cl = $("c-list"), cb = $("c-box"); if (!cl || !cb) return;
  cl.innerHTML = ss.length ? ss.map((x) => `<button class="panel pn" style="text-align:left;${x.sid === chatSid ? "border-color:var(--accent)" : ""}" onclick="AD.openChat('${x.sid}')"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:.85rem">#${x.sid.slice(0, 6)}</b><span class="muted" style="font-size:.75rem">${fmtDate(x.last.date)}</span></div><div class="muted" style="font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.last.text)}</div>${x.waiting ? '<span style="color:var(--sale);font-weight:800;font-size:.75rem">● Javob kutmoqda</span>' : x.esc ? '<span style="color:var(--accent);font-size:.75rem">Operator rejimi</span>' : ""}</button>`).join("") : '<p class="muted">Hozircha suhbat yo\'q.</p>';
  const cur = ss.find((x) => x.sid === chatSid);
  if (!cur) { cb.innerHTML = '<p class="muted" style="margin:0">Suhbatni tanlang.</p>'; return; }
  const keep = $("c-in") ? $("c-in").value : "";
  cb.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><b>#${cur.sid.slice(0, 6)} ${cur.esc ? "· operator rejimi" : "· konsultant rejimi"}</b>${cur.esc ? '<button class="btn ghost sm" onclick="AD.chatResume()">Botga qaytarish</button>' : ""}</div><div id="c-msgs" style="display:grid;gap:8px;max-height:46vh;overflow:auto;margin-bottom:12px">${cur.m.filter((r) => r.from !== "system").map((r) => `<div style="justify-self:${r.from === "user" ? "start" : "end"};max-width:85%;padding:.55rem .8rem;border-radius:14px;background:${r.from === "user" ? "var(--surface)" : r.from === "operator" ? "var(--accent)" : "var(--card)"};color:${r.from === "operator" ? "var(--on-accent)" : "var(--fg)"};border:1px solid var(--line);white-space:pre-wrap;font-size:.9rem"><small style="display:block;opacity:.6;font-size:.7rem">${who[r.from] || r.from} · ${fmtDate(r.date)}</small>${esc(r.text)}</div>`).join("")}</div><form onsubmit="AD.chatSend(event)" style="display:flex;gap:8px"><input id="c-in" placeholder="Operator javobi…" value="${esc(keep)}" autocomplete="off"><button class="btn" type="submit">Yuborish</button></form>`;
  const m = $("c-msgs"); if (m) m.scrollTop = m.scrollHeight;
}
async function chatSend(e) { e.preventDefault(); const v = $("c-in").value.trim(); if (!v || !chatSid) return; $("c-in").value = ""; const x = await post(A({ action: "chatReply", sid: chatSid, text: v })); if (!x.ok) toast("Yuborib bo'lmadi"); await loadInbox(); }
async function chatResume() { const x = await post(A({ action: "chatReply", sid: chatSid, resume: true })); if (!x.ok) toast("Bajarib bo'lmadi"); await loadInbox(); }
function openChat(sid) { chatSid = sid; chatPanes(); }
setInterval(() => { if (AUTH && tab === "chats" && !document.hidden) loadInbox(); }, 8000);
window.AD = { openChat, chatSend, chatResume, ed, es, add, del, coord, upImg, upModel, setStatus, rm, loadInbox, setTab, tgTest };
try { const tk = sessionStorage.getItem(TK); if (tk && !GAS) { AUTH = { token: tk }; boot(); } } catch {}
})();
