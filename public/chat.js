/* Floating consultant chat. Talks to the Apps Script backend:
   bot answers instantly (rules, optional AI); "operator" handoff is relayed to Telegram and the admin panel. */
(() => {
"use strict";
const A = window.DBAPP, root = document.getElementById("chat");
if (!A || !A.GAS) { if (root) root.remove(); return; }       // chat needs the Apps Script backend
const $ = (id) => document.getElementById(id), KEY = "db-chat", t = A.t, esc = A.esc;
let S = { sid: "", msgs: [], since: "", esc: false, seenQR: false };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
if (!S.sid) { const b = new Uint8Array(12); crypto.getRandomValues(b); S.sid = [...b].map((x) => x.toString(16).padStart(2, "0")).join(""); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...S, msgs: S.msgs.slice(-60) })); } catch {} };
const seen = new Set(S.msgs.map((m) => m.id).filter(Boolean));
let open = false, busy = false, pollT = 0;

const hhmm = (d) => { const x = new Date(d); return isNaN(x) ? "" : x.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const QR = ["ch_q1", "ch_q2", "ch_q3", "ch_q4"];

function render(typing) {
  const box = $("ch-msgs");
  let h = `<div class="m b">${linkify(t("ch_greet"))}</div>`;
  if (!S.seenQR && !S.msgs.length) h += `<div class="qr">${QR.map((k) => `<button data-q="${k}">${esc(t(k))}</button>`).join("")}</div>`;
  h += S.msgs.map((m) => `<div class="m ${m.from === "u" ? "u" : m.from === "o" ? "o" : "b"}">${m.from === "o" ? `<span class="who">${esc(t("ch_op"))}</span>` : ""}${linkify(m.text)}<small>${hhmm(m.date)}</small></div>`).join("");
  if (S.esc && S.msgs.length && S.msgs[S.msgs.length - 1].from === "u" && !typing) h += `<div class="m b" style="opacity:.7;font-size:.8rem">${esc(t("ch_wait"))}</div>`;
  if (typing) h += `<div class="typing"><i></i><i></i><i></i></div>`;
  box.innerHTML = h; box.scrollTop = box.scrollHeight;
}
function add(from, text, date, id) { if (id) { if (seen.has(id)) return false; seen.add(id); } S.msgs.push({ from, text, date: date || new Date().toISOString(), id }); return true; }

async function sendMsg(text) {
  text = text.trim(); if (!text || busy) return;
  busy = true; S.seenQR = true; add("u", text); save(); render(true);
  const t0 = Date.now();
  try {
    const x = await A.post({ action: "chat", sid: S.sid, text, lang: A.getLang(), hp: "" }, 30000);
    if (!x.ok) throw x.error || "err";
    const wait = Math.max(0, 700 - (Date.now() - t0)); await new Promise((r) => setTimeout(r, wait));
    (x.replies || []).forEach((r) => { add(r.from === "operator" ? "o" : "b", r.text, r.date, r.id); S.since = r.date > S.since ? r.date : S.since; });
    S.esc = !!x.escalated;
  } catch (e) { add("b", e === "rate" ? t("err_rate") : t("ch_err")); }
  busy = false; save(); render(false); schedule();
}
async function poll() {
  if (!S.esc || busy) return;
  try {
    const x = await A.post({ action: "chatPoll", sid: S.sid, since: S.since }, 15000);
    if (!x.ok) return;
    let fresh = 0; (x.messages || []).forEach((r) => { if (add(r.from === "operator" ? "o" : "b", r.text, r.date, r.id)) fresh++; if (r.date > S.since) S.since = r.date; });
    S.esc = !!x.escalated;
    if (fresh) { save(); render(false); if (!open) $("ch-dot").classList.add("show"); }
  } catch {}
}
function schedule() { clearTimeout(pollT); if (!S.esc) return; pollT = setTimeout(async () => { if (!document.hidden) await poll(); schedule(); }, open ? 5000 : 30000); }

function setOpen(v) {
  open = v; root.classList.toggle("open", v);
  if (v) { $("ch-dot").classList.remove("show"); render(false); setTimeout(() => $("ch-in").focus(), 300); poll(); }
  schedule();
}
function links() {
  const s = A.getSettings(), ph = (s.phone || "").trim(), tg = (s.telegram || "").trim();
  const call = $("ch-call"); call.hidden = !ph; if (ph) call.href = "tel:" + ph.replace(/[^\d+]/g, "");
  const b = $("ch-tg"); b.hidden = !tg; if (tg) b.href = /^https?:/.test(tg) ? tg : "https://t.me/" + tg.replace(/^@/, "");
}
$("ch-toggle").onclick = () => setOpen(!open);
$("ch-form").onsubmit = (e) => { e.preventDefault(); const i = $("ch-in"), v = i.value; i.value = ""; sendMsg(v); };
$("ch-msgs").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (b) sendMsg(t(b.dataset.q)); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open && !document.querySelector("dialog[open]")) setOpen(false); });
document.addEventListener("db:lang", () => render(false));
document.addEventListener("db:data", links);
links(); render(false); schedule();
})();
