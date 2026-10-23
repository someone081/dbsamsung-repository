// DEHKON db BOZOR — Netlify Function (Netlify Blobs storage)
// Env vars: ADMIN_USER, ADMIN_PASS, SESSION_SECRET (optional), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

export const config = { path: "/api" };

const S = (name) => getStore({ name, consistency: "strong" });
const env = (k) => process.env[k] || "";
const STATUSES = {
  requests: ["new", "contacted", "done"],
  feedback: ["pending", "approved", "hidden"],
  messages: ["new", "read", "done"],
};

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
const num = (v, f = 0) => (v !== "" && v != null && Number.isFinite(+v) ? +v : f);
const nine = (v) => String(v || "").replace(/\D/g, "").slice(-9);
const fmtPhone = (n) => "+998 " + n.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, "$1 $2 $3 $4");
const newId = () => crypto.randomBytes(5).toString("hex");
const safeKey = (v) => /^[\w-]{1,64}$/.test(String(v));

// ---------- auth ----------
const secret = () => env("SESSION_SECRET") || env("ADMIN_PASS");
const hmac = (p) => crypto.createHmac("sha256", secret()).update(p).digest("hex");
const sign = (exp) => `${exp}.${hmac(String(exp))}`;
function verify(token) {
  if (typeof token !== "string" || !secret()) return false;
  const [p, h] = token.split(".");
  if (!p || !h || Number(p) < Date.now()) return false;
  const a = Buffer.from(h), b = Buffer.from(hmac(p));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const same = (a, b) =>
  crypto.timingSafeEqual(
    crypto.createHash("sha256").update(String(a)).digest(),
    crypto.createHash("sha256").update(String(b)).digest()
  );

// ---------- helpers ----------
async function limited(ip, kind, max, windowSec) {
  const st = S("limits");
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${kind}-${String(ip).replace(/[^\w.:-]/g, "_")}-${bucket}`;
  const n = Number((await st.get(key)) || 0);
  if (n >= max) return true;
  await st.set(key, String(n + 1));
  return false;
}

async function notify(text) {
  const token = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID");
  if (!token || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
    });
  } catch {}
}

async function listAll(name, limit = 300) {
  const st = S(name);
  const { blobs } = await st.list();
  const rows = await Promise.all(blobs.map((b) => st.get(b.key, { type: "json" })));
  return rows.filter(Boolean).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit);
}

async function rebuildReviews() {
  const rows = (await listAll("feedback", 500))
    .filter((r) => r.status === "approved")
    .slice(0, 30)
    .map((r) => ({ name: r.name, rating: Number(r.rating), device: r.device, text: r.text }));
  await S("site").setJSON("reviews", rows);
}

function normCatalog(b) {
  const products = (Array.isArray(b.products) ? b.products : []).slice(0, 200).map((p, i) => ({
    id: num(p.id, i + 1),
    name: clean(p.name, 120),
    category: clean(p.category, 40), category_en: clean(p.category_en, 40), category_ru: clean(p.category_ru, 40),
    price: num(p.price),
    image: clean(p.image, 600),
    desc: clean(p.desc, 200), desc_en: clean(p.desc_en, 200), desc_ru: clean(p.desc_ru, 200),
    model: clean(p.model, 600),
  })).filter((p) => p.name && p.price > 0);
  const branches = (Array.isArray(b.branches) ? b.branches : []).slice(0, 50).map((x) => ({
    name: clean(x.name, 120), name_en: clean(x.name_en, 120), name_ru: clean(x.name_ru, 120),
    desc: clean(x.desc, 200), desc_en: clean(x.desc_en, 200), desc_ru: clean(x.desc_ru, 200),
    lat: num(x.lat, NaN), lng: num(x.lng, NaN),
    phone: clean(x.phone, 30),
    hours: clean(x.hours, 80), hours_en: clean(x.hours_en, 80), hours_ru: clean(x.hours_ru, 80),
  })).filter((x) => x.name && Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180);
  const s = b.settings || {};
  const settings = { m3: num(s.m3, 10), m6: num(s.m6, 20), m12: num(s.m12, 38), m24: num(s.m24, 65) };
  return { products, branches, settings };
}

async function serveFile(kind, id) {
  if (!safeKey(id)) return json({ error: "bad id" }, 400);
  const { data, metadata } = (await S("files").getWithMetadata(`${kind}-${id}`, { type: "arrayBuffer" })) || {};
  if (!data) return json({ error: "notfound" }, 404);
  return new Response(data, {
    headers: {
      "content-type": (metadata && metadata.type) || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

const toBuffer = (b64) => {
  const buf = Buffer.from(String(b64 || ""), "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
};

// ---------- handler ----------
export default async (req, context) => {
  const url = new URL(req.url);
  const ip = (context && context.ip) || req.headers.get("x-nf-client-connection-ip") || "0";

  if (req.method === "GET") {
    const img = url.searchParams.get("img"), mdl = url.searchParams.get("model");
    if (img) return serveFile("img", img);
    if (mdl) return serveFile("model", mdl);
    const site = S("site");
    const [cat, reviews] = await Promise.all([site.get("catalog", { type: "json" }), site.get("reviews", { type: "json" })]);
    return json({ exists: !!cat, ...(cat || { products: [], branches: [], settings: {} }), reviews: reviews || [] });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ ok: false, error: "json" }, 400); }

  // ----- public actions -----
  if (b.action === "request" || b.action === "message" || b.action === "feedback") {
    if (b.hp) return json({ ok: true });
    if (await limited(ip, b.action, 6, 600)) return json({ ok: false, error: "rate" }, 429);

    if (b.action === "request") {
      const n = nine(b.phone);
      if (n.length !== 9) return json({ ok: false, error: "phone" }, 400);
      const row = { id: newId(), date: new Date().toISOString(), phone: fmtPhone(n), product: clean(b.product, 120), price: clean(b.price, 20), lang: clean(b.lang, 3), status: "new" };
      await S("requests").setJSON(row.id, row);
      await notify(`Yangi so'rov\nTel: ${row.phone}\nMahsulot: ${row.product || "-"}`);
      return json({ ok: true });
    }
    if (b.action === "message") {
      const name = clean(b.name, 60), text = clean(b.text, 600), n = nine(b.phone);
      if (name.length < 2 || text.length < 10 || n.length !== 9) return json({ ok: false, error: "invalid" }, 400);
      const topic = ["question", "suggestion", "complaint", "other"].includes(b.topic) ? b.topic : "other";
      const row = { id: newId(), date: new Date().toISOString(), name, phone: fmtPhone(n), topic, text, lang: clean(b.lang, 3), status: "new" };
      await S("messages").setJSON(row.id, row);
      await notify(`Yangi murojaat (${topic})\n${name} ${row.phone}\n${text}`);
      return json({ ok: true });
    }
    const name = clean(b.name, 60), text = clean(b.text, 400), rating = Math.round(Number(b.rating));
    if (name.length < 2 || text.length < 10 || !(rating >= 1 && rating <= 5)) return json({ ok: false, error: "invalid" }, 400);
    const row = { id: newId(), date: new Date().toISOString(), name, rating, device: clean(b.device, 80), text, status: "pending" };
    await S("feedback").setJSON(row.id, row);
    await notify(`Yangi fikr (tasdiqlash kerak)\n${name} ${rating}/5\n${text}`);
    return json({ ok: true });
  }

  // ----- login -----
  if (b.action === "login") {
    if (!env("ADMIN_USER") || !env("ADMIN_PASS")) return json({ ok: false, error: "config" }, 500);
    if (await limited(ip, "login", 8, 600)) return json({ ok: false, error: "rate" }, 429);
    const ok = same(b.login, env("ADMIN_USER")) && same(b.password, env("ADMIN_PASS"));
    if (!ok) return json({ ok: false, error: "auth" }, 401);
    return json({ ok: true, token: sign(Date.now() + 12 * 3600 * 1000) });
  }

  // ----- admin actions (token required) -----
  if (!verify(b.token)) return json({ ok: false, error: "auth" }, 401);

  switch (b.action) {
    case "save": {
      await S("site").setJSON("catalog", normCatalog(b));
      return json({ ok: true });
    }
    case "telegramTest": {
      const token = env("TELEGRAM_BOT_TOKEN"), chat = env("TELEGRAM_CHAT_ID");
      if (!token || !chat) return json({ ok: false, message: "TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan" });
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, text: "✅ DEHKON db BOZOR: Telegram ulandi" }) });
      const j = await r.json().catch(() => ({}));
      return json({ ok: !!j.ok, message: j.ok ? "Yuborildi" : j.description || "Xato" });
    }
    case "adminData": {
      const [requests, feedback, messages] = await Promise.all([listAll("requests"), listAll("feedback"), listAll("messages")]);
      return json({ ok: true, requests, feedback, messages });
    }
    case "update": {
      const n = b.sheet;
      if (!STATUSES[n] || !STATUSES[n].includes(b.status) || !safeKey(b.id)) return json({ ok: false, error: "status" }, 400);
      const st = S(n), row = await st.get(b.id, { type: "json" });
      if (!row) return json({ ok: false, error: "notfound" }, 404);
      await st.setJSON(b.id, { ...row, status: b.status });
      if (n === "feedback") await rebuildReviews();
      return json({ ok: true });
    }
    case "remove": {
      const n = b.sheet;
      if (!STATUSES[n] || !safeKey(b.id)) return json({ ok: false, error: "sheet" }, 400);
      await S(n).delete(b.id);
      if (n === "feedback") await rebuildReviews();
      return json({ ok: true });
    }
    case "uploadImage": {
      const data = toBuffer(b.data);
      if (data.byteLength > 4 * 1024 * 1024 || data.byteLength < 100) return json({ ok: false, error: "size" }, 400);
      const id = newId();
      await S("files").set(`img-${id}`, data, { metadata: { type: "image/jpeg" } });
      return json({ ok: true, id });
    }
    case "upload": {
      const data = toBuffer(b.data);
      if (data.byteLength > 4 * 1024 * 1024 || data.byteLength < 100) return json({ ok: false, error: "size" }, 400);
      const id = newId();
      await S("files").set(`model-${id}`, data, { metadata: { type: "model/gltf-binary" } });
      return json({ ok: true, id });
    }
  }
  return json({ ok: false, error: "action" }, 400);
};
