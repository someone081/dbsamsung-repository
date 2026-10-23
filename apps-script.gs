/**
 * DEHKON db BOZOR: Google Sheets serveri.
 *
 * Jadval varaqlari (setup() o'zi yaratadi):
 *   products  : mahsulotlar (admin paneldan tahrirlanadi)
 *   branches  : filiallar va koordinatalar
 *   settings  : sozlamalar. key = nomi, value = qiymati:
 *               m3, m6, m12, m24 = 3, 6, 12, 24 oylik nasiyada narxga qo'shiladigan ustama foiz
 *   requests  : mijozlardan kelgan SO'ROVLAR (telefon, mahsulot, holati)
 *   feedback  : mijozlarning FIKRLARI (status: pending, approved, hidden)
 *   messages  : mijozlarning MUROJAATLARI (ism, telefon, mavzu, matn)
 *   chats     : sayt chatidagi suhbatlar (mijoz, konsultant, operator)
 *
 * O'rnatish:
 *  1. Google Sheet > Extensions > Apps Script, shu kodni to'liq joylang
 *  2. "setup" funksiyasini tanlab Run bosing (ruxsat so'raydi: Allow)
 *  3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 *  4. Web app URL ni dehkon-bozor.html ichidagi API_URL ga yozing
 *  Kodni keyin o'zgartirsangiz: Deploy > Manage deployments > Edit > New version
 */

// Admin login/parol (faqat shu serverda turadi, sayt kodida emas). Almashtiring!
const ADMIN_USER = 'redkill';
const ADMIN_PASS = 'redkill12';

// Telegram xabarnomasi: yangi so'rov, murojaat va fikr kanalga keladi.
//  BOT_TOKEN : @BotFather dan olingan token.
//  CHAT_ID   : ochiq kanal bo'lsa '@kanal_nomi', yopiq kanal/guruh bo'lsa '-100...' raqami.
//  MUHIM     : botni kanalga ADMIN qilib qo'shing (xabar yuborish huquqi bilan).
// Tekshirish: pastdagi testTelegram funksiyasini Run qiling yoki admin paneldan "Telegramni tekshirish" ni bosing.
const BOT_TOKEN = '';
const CHAT_ID = '';

// Chat-konsultant (ixtiyoriy AI). Kalit bo'sh bo'lsa konsultant qoidalar asosida katalogdan javob beradi.
//  ANTHROPIC_API_KEY: console.anthropic.com dan olingan kalit. AI_MODEL: ishlatiladigan model.
const ANTHROPIC_API_KEY = '';
const AI_MODEL = 'claude-haiku-5-5';
// Telegram webhook (operator javobi guruhdan chatga qaytishi uchun). /exec bilan tugaydigan web app URL:
const WEBAPP_URL = '';

const FOLDER_NAME = 'dehkon-models';
const IMG_FOLDER = 'dehkon-images';

const SHEETS = {
  products: ['id', 'name', 'category', 'price', 'image', 'desc', 'model', 'category_en', 'category_ru', 'desc_en', 'desc_ru', 'oldPrice', 'featured', 'tags', 'badge'],
  branches: ['name', 'desc', 'lat', 'lng', 'phone', 'hours', 'name_en', 'name_ru', 'desc_en', 'desc_ru', 'hours_en', 'hours_ru'],
  settings: ['key', 'value'],
  requests: ['id', 'date', 'phone', 'product', 'price', 'lang', 'status'],
  feedback: ['id', 'date', 'name', 'rating', 'device', 'text', 'status'],
  messages: ['id', 'date', 'name', 'phone', 'topic', 'text', 'lang', 'status'],
  chats: ['id', 'date', 'sid', 'from', 'text', 'lang', 'tgid']
};
const STATUSES = {
  requests: ['new', 'contacted', 'done'],
  feedback: ['pending', 'approved', 'hidden'],
  messages: ['new', 'read', 'done']
};

function setup() {
  Object.keys(SHEETS).forEach(sheet_);
  seedIfEmpty_();
  folder_();
  imgFolder_();
}

// ---------- yordamchi funksiyalar ----------
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(SHEETS[name]);
  }
  return s;
}

function read_(name) {
  const v = sheet_(name).getDataRange().getValues();
  const head = v.shift();
  return v
    .filter(r => r.some(c => c !== ''))
    .map(r => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

function write_(name, rows) {
  const cols = SHEETS[name], s = sheet_(name);
  s.clearContents();
  s.getRange(1, 1, 1, cols.length).setValues([cols]);
  if (!rows.length) return;
  const range = s.getRange(2, 1, rows.length, cols.length);
  range.setNumberFormat('@'); // hammasi matn: "+998..." yoki "=..." formulaga aylanmasin
  range.setValues(rows.map(r => cols.map(k => (r[k] == null ? '' : String(r[k])))));
}

function append_(name, obj) {
  const cols = SHEETS[name], s = sheet_(name);
  const range = s.getRange(s.getLastRow() + 1, 1, 1, cols.length);
  range.setNumberFormat('@');
  range.setValues([cols.map(k => (obj[k] == null ? '' : String(obj[k])))]);
}

function rowOf_(name, id) {
  const s = sheet_(name), last = s.getLastRow();
  if (last < 2) return 0;
  const ids = s.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

function lock_(fn) {
  const l = LockService.getScriptLock();
  l.waitLock(8000);
  try { return fn(); } finally { l.releaseLock(); }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

const id_ = () => Utilities.getUuid().replace(/-/g, '').slice(0, 10);
const clean_ = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);

// Bir xil kalit bo'yicha urinishlarni cheklash (spamdan himoya)
function limited_(key, max, seconds) {
  const c = CacheService.getScriptCache();
  const n = Number(c.get(key) || 0);
  if (n >= max) return true;
  c.put(key, String(n + 1), seconds);
  return false;
}

const TZ = 'Asia/Tashkent';
const now_ = () => Utilities.formatDate(new Date(), TZ, 'dd.MM.yyyy HH:mm');
const money_ = (v) => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Telegramga yuborish. Natija: {ok, error}. Xatolar Executions logiga yoziladi.
function tg_(text) {
  if (!BOT_TOKEN || !CHAT_ID) return { ok: false, error: 'BOT_TOKEN yoki CHAT_ID bo\'sh' };
  try {
    const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: CHAT_ID, text: text, disable_web_page_preview: true }),
      muteHttpExceptions: true
    });
    const j = JSON.parse(r.getContentText());
    if (!j.ok) console.error('Telegram xatosi: ' + j.description);
    return { ok: !!j.ok, error: j.description || '', id: j.result && j.result.message_id ? String(j.result.message_id) : '' };
  } catch (e) {
    console.error('Telegram: ' + e);
    return { ok: false, error: String(e) };
  }
}
const notify_ = (text) => tg_(text);

// Editor'dan ishga tushiring: View > Logs yoki Executions'da natijani ko'rasiz
function testTelegram() {
  const r = tg_('✅ DEHKON db BOZOR: Telegram ulandi (' + now_() + ')');
  console.log(JSON.stringify(r));
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function imgFolder_() {
  const it = DriveApp.getFoldersByName(IMG_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(IMG_FOLDER);
}

// Faqat shu papkadagi fayllarni berish: Drive'dagi boshqa fayllarni o'qib bo'lmaydi.
function model_(id) {
  try {
    const f = DriveApp.getFileById(id), root = folder_().getId();
    const ps = f.getParents();
    let ok = false;
    while (ps.hasNext()) if (ps.next().getId() === root) ok = true;
    if (!ok) return { error: 'forbidden' };
    return { data: Utilities.base64Encode(f.getBlob().getBytes()) };
  } catch (e) {
    return { error: 'notfound' };
  }
}

// ---------- ochiq amallar (parol kerak emas) ----------
function submitRequest_(b) {
  if (b.hp) return { ok: true }; // bot tuzog'i
  const nine = String(b.phone || '').replace(/\D/g, '').slice(-9);
  if (nine.length !== 9) return { ok: false, error: 'phone' };
  if (limited_('rq-all', 40, 300) || limited_('rq-' + nine, 3, 600)) return { ok: false, error: 'rate' };
  const row = {
    id: id_(),
    date: new Date().toISOString(),
    phone: '+998 ' + nine.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4'),
    product: clean_(b.product, 120),
    price: clean_(b.price, 20),
    lang: clean_(b.lang, 3),
    status: 'new'
  };
  lock_(() => append_('requests', row));
  notify_("🔔 Yangi so'rov\n📞 " + row.phone + '\n📱 ' + (row.product ? row.product + (row.price ? ' — ' + money_(row.price) + " so'm" : '') : "Umumiy so'rov") + '\n🌐 ' + (row.lang || '-') + '\n🕒 ' + now_());
  return { ok: true };
}

function submitMessage_(b) {
  if (b.hp) return { ok: true };
  const name = clean_(b.name, 60), text = clean_(b.text, 600);
  const nine = String(b.phone || '').replace(/\D/g, '').slice(-9);
  const topics = ['question', 'suggestion', 'complaint', 'other'];
  if (name.length < 2 || text.length < 10 || nine.length !== 9) return { ok: false, error: 'invalid' };
  if (limited_('ms-all', 20, 600) || limited_('ms-' + nine, 3, 600)) return { ok: false, error: 'rate' };
  const row = {
    id: id_(), date: new Date().toISOString(), name: name,
    phone: '+998 ' + nine.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4'),
    topic: topics.indexOf(b.topic) >= 0 ? b.topic : 'other', text: text, lang: clean_(b.lang, 3), status: 'new'
  };
  lock_(() => append_('messages', row));
  notify_('✉️ Yangi murojaat (' + row.topic + ')\n👤 ' + name + '\n📞 ' + row.phone + '\n\n' + text + '\n\n🕒 ' + now_());
  return { ok: true };
}

function submitFeedback_(b) {
  if (b.hp) return { ok: true };
  const name = clean_(b.name, 60), text = clean_(b.text, 400), rating = Math.round(Number(b.rating));
  if (name.length < 2 || text.length < 10 || !(rating >= 1 && rating <= 5)) return { ok: false, error: 'invalid' };
  if (limited_('fb-all', 10, 600)) return { ok: false, error: 'rate' };
  lock_(() => append_('feedback', {
    id: id_(), date: new Date().toISOString(), name: name, rating: rating,
    device: clean_(b.device, 80), text: text, status: 'pending'
  }));
  notify_('⭐ Yangi fikr (tasdiqlash kerak)\n👤 ' + name + ' — ' + rating + '/5' + (b.device ? '\n📱 ' + clean_(b.device, 80) : '') + '\n\n' + text);
  return { ok: true };
}

// ---------- o'qish: hamma mijoz shu orqali katalogni oladi ----------
// Standart katalog: jadval bo'sh bo'lsa avtomatik yoziladi (keyin admin paneldan yoki jadvalning o'zidan tahrirlanadi)
const SEED = {"products": [{"id": 1, "name": "Samsung Galaxy S26 Ultra", "category": "Flagman", "category_en": "Flagship", "category_ru": "Флагман", "price": 15200000, "image": "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=700&q=80", "desc": "256GB, Titan kulrang, sun'iy intellektli kamera", "desc_en": "256GB, Titanium Gray, AI Camera", "desc_ru": "256 ГБ, титановый серый, камера с ИИ", "model": "", "oldPrice": 16500000, "featured": true, "tags": "photo,work", "badge": "sale"}, {"id": 2, "name": "Samsung Galaxy Z Fold7", "category": "Buklanadigan", "category_en": "Foldable", "category_ru": "Складной", "price": 21500000, "image": "https://images.unsplash.com/photo-1580910051074-3eb694886505?auto=format&fit=crop&w=700&q=80", "desc": "512GB, ikki dinamik ekran", "desc_en": "512GB, Dual Dynamic Screen", "desc_ru": "512 ГБ, два динамических экрана", "model": "", "oldPrice": 0, "featured": true, "tags": "work,photo", "badge": "new"}, {"id": 3, "name": "Samsung Galaxy A56 5G", "category": "Smartfon", "category_en": "Smartphone", "category_ru": "Смартфон", "price": 5400000, "image": "https://images.unsplash.com/photo-1533228876829-61c94e7ef50a?auto=format&fit=crop&w=700&q=80", "desc": "128GB, Super AMOLED ekran", "desc_en": "128GB, Super AMOLED display", "desc_ru": "128 ГБ, дисплей Super AMOLED", "model": "", "oldPrice": 5900000, "featured": true, "tags": "study", "badge": "sale"}, {"id": 4, "name": "Samsung Galaxy Tab S11", "category": "Planshet", "category_en": "Tablet", "category_ru": "Планшет", "price": 11800000, "image": "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=700&q=80", "desc": "11 dyuymli, S Pen bilan", "desc_en": "11-inch, S Pen included", "desc_ru": "11 дюймов, S Pen в комплекте", "model": "", "oldPrice": 0, "featured": false, "tags": "study,work", "badge": ""}, {"id": 5, "name": "Samsung Galaxy Watch 8", "category": "Aksesuar", "category_en": "Accessory", "category_ru": "Аксессуар", "price": 3500000, "image": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=700&q=80", "desc": "Salomatlik monitoringi, AMOLED", "desc_en": "Health monitoring, AMOLED", "desc_ru": "Контроль здоровья, AMOLED", "model": "", "oldPrice": 3900000, "featured": false, "tags": "sport", "badge": "sale"}, {"id": 6, "name": "Samsung Galaxy Buds 4 Pro", "category": "Aksesuar", "category_en": "Accessory", "category_ru": "Аксессуар", "price": 2100000, "image": "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?auto=format&fit=crop&w=700&q=80", "desc": "Faol shovqinni yo'qotish (ANC)", "desc_en": "Active Noise Cancelling (ANC)", "desc_ru": "Активное шумоподавление (ANC)", "model": "", "oldPrice": 0, "featured": false, "tags": "study,sport", "badge": ""}], "branches": [{"name": "DEHKON db BOZOR — Markaziy filial", "name_en": "DEHKON db BOZOR — Main branch", "name_ru": "DEHKON db BOZOR — Центральный филиал", "desc": "Asosiy shourum va servis xizmati", "desc_en": "Main showroom and service center", "desc_ru": "Главный шоурум и сервисный центр", "lat": 41.551, "lng": 60.635, "phone": "", "hours": "", "hours_en": "", "hours_ru": ""}, {"name": "DEHKON db BOZOR — 2-pavilyon", "name_en": "DEHKON db BOZOR — Pavilion 2", "name_ru": "DEHKON db BOZOR — Павильон 2", "desc": "Aksesuarlar va smartfonlar bo'limi", "desc_en": "Accessories and smartphones section", "desc_ru": "Отдел аксессуаров и смартфонов", "lat": 41.548, "lng": 60.63, "phone": "", "hours": "", "hours_en": "", "hours_ru": ""}], "settings": {"m3": 10, "m6": 20, "m12": 38, "m24": 65, "phone": "", "instagram": "", "youtube": "", "telegram": ""}};
function seedIfEmpty_() {
  if (read_('products').length) return false;
  lock_(() => {
    if (read_('products').length) return;
    write_('products', SEED.products);
    if (!read_('branches').length) write_('branches', SEED.branches);
    if (!read_('settings').length) write_('settings', Object.entries(SEED.settings).map(([key, value]) => ({ key: key, value: value })));
  });
  return true;
}

function catalog_() {
  seedIfEmpty_();
  const settings = {};
  read_('settings').forEach(r => (settings[r.key] = r.value));
  const reviews = read_('feedback')
    .filter(r => r.status === 'approved')
    .reverse().slice(0, 30)
    .map(r => ({ name: r.name, rating: Number(r.rating), device: r.device, text: r.text }));
  return { products: read_('products'), branches: read_('branches'), settings: settings, reviews: reviews };
}
function dropCache_() { CacheService.getScriptCache().remove('catalog'); }

function catalogJson_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('catalog');
  if (hit) return hit;
  const data = JSON.stringify(catalog_());
  try { cache.put('catalog', data, 120); } catch (_) { /* 100 KB dan katta bo'lsa keshlanmaydi */ }
  return data;
}

function doGet(e) {
  if (e.parameter.model) return out_(model_(e.parameter.model));
  return ContentService.createTextOutput(catalogJson_()).setMimeType(ContentService.MimeType.JSON);
}

// ---------- yozish ----------
function doPost(e) {
  if (e.parameter && e.parameter.tg) return out_(telegramUpdate_(e)); // Telegram webhook
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (_) { return out_({ ok: false }); }

  if (b.action === 'request') return out_(submitRequest_(b));
  if (b.action === 'feedback') return out_(submitFeedback_(b));
  if (b.action === 'message') return out_(submitMessage_(b));
  if (b.action === 'chat') return out_(chat_(b));
  if (b.action === 'chatPoll') return out_(chatPoll_(b));

  // Quyidagilar faqat login va parol to'g'ri bo'lsa
  if (b.login !== ADMIN_USER || b.password !== ADMIN_PASS) {
    Utilities.sleep(1200); // taxminlashni sekinlashtirish
    return out_({ ok: false, error: 'auth' });
  }
  switch (b.action) {
    case 'login':
      return out_({ ok: true });
    case 'save':
      lock_(() => {
        write_('products', b.products || []);
        write_('branches', b.branches || []);
        write_('settings', Object.entries(b.settings || {}).map(([key, value]) => ({ key: key, value: value })));
      });
      dropCache_();
      return out_({ ok: true });
    case 'upload': {
      const name = String(b.filename || 'model.glb').replace(/[^\w.\-]/g, '_');
      const blob = Utilities.newBlob(Utilities.base64Decode(b.data), 'model/gltf-binary', name);
      return out_({ ok: true, id: folder_().createFile(blob).getId() });
    }
    case 'uploadImage': {
      const bytes = Utilities.base64Decode(b.data);
      if (bytes.length > 3 * 1024 * 1024) return out_({ ok: false, error: 'size' });
      if (!((bytes[0] & 255) === 255 && (bytes[1] & 255) === 216)) return out_({ ok: false, error: 'type' }); // faqat JPEG
      const name = String(b.filename || 'image').replace(/[^\w\-]/g, '_').slice(0, 40) + '.jpg';
      const f = imgFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', name));
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return out_({ ok: true, id: f.getId() });
    }
    case 'chatReply': {
      const sid = String(b.sid || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
      if (!sid) return out_({ ok: false });
      lock_(() => {
        if (b.resume) {
          append_('chats', { id: id_(), date: new Date().toISOString(), sid: sid, from: 'system', text: 'resume', lang: '', tgid: '' });
        } else {
          const text = clean_(b.text, 800);
          if (!text) return;
          if (!escalated_(chatRows_(sid))) append_('chats', { id: id_(), date: new Date().toISOString(), sid: sid, from: 'system', text: 'handoff', lang: '', tgid: '' });
          append_('chats', { id: id_(), date: new Date(Date.now() + 1).toISOString(), sid: sid, from: 'operator', text: text, lang: '', tgid: '' });
        }
      });
      return out_({ ok: true });
    }
    case 'telegramTest': {
      const r = tg_('✅ DEHKON db BOZOR: Telegram ulandi (' + now_() + ')');
      return out_({ ok: r.ok, message: r.ok ? 'Yuborildi' : r.error });
    }
    case 'adminData':
      return out_({
        ok: true,
        requests: read_('requests').reverse().slice(0, 300),
        feedback: read_('feedback').reverse().slice(0, 300),
        messages: read_('messages').reverse().slice(0, 300),
        chats: chatRows_('')
      });
    case 'update': {
      const n = b.sheet;
      if (!STATUSES[n] || STATUSES[n].indexOf(b.status) < 0) return out_({ ok: false });
      const upd = lock_(() => {
        const row = rowOf_(n, b.id);
        if (!row) return { ok: false, error: 'notfound' };
        sheet_(n).getRange(row, SHEETS[n].indexOf('status') + 1).setValue(b.status);
        return { ok: true };
      });
      if (n === 'feedback') dropCache_();
      return out_(upd);
      // eslatma: feedback holati o'zgarsa kesh pastda tozalanadi
    }
    case 'remove': {
      const n = b.sheet;
      if (!STATUSES[n]) return out_({ ok: false });
      const rem = lock_(() => {
        const row = rowOf_(n, b.id);
        if (!row) return { ok: false, error: 'notfound' };
        sheet_(n).deleteRow(row);
        return { ok: true };
      });
      if (n === 'feedback') dropCache_();
      return out_(rem);
    }
  }
  return out_({ ok: false });
}


// =====================================================================
//  CHAT-KONSULTANT
//  Mijoz saytdagi chatga yozadi: konsultant (qoidalar yoki AI) katalog asosida javob beradi,
//  telefon raqam yozsa so'rov yaratiladi, "operator" desa suhbat operatorga uzatiladi.
// =====================================================================
const TX = {
  uz: {
    som: "so'm", mo: 'oy', cash: 'Naqd narx', was: 'avval',
    hello: "Assalomu alaykum! Qaysi qurilma qiziqtiryapti? Narx, nasiya, filiallar yoki yetkazib berish haqida so'rang.",
    list: 'Qurilmalarimiz va narxlar:', askModel: "Qaysi qurilma uchun nasiya hisoblab beray? Nomini yozing (masalan: S26 Ultra).",
    instIntro: "Nasiya 3, 6, 12 va 24 oyga. Oylik to'lov narxga ustama qo'shilgan holda hisoblanadi.",
    branches: 'Filiallarimiz:', route: "Yo'nalish", hours: 'Ish vaqti',
    delivery: "Toshkent bo'ylab yetkazib berish mavjud. Viloyatlarga operator bilan kelishilgan holda jo'natamiz.",
    warranty: "Barcha qurilmalar Samsung rasmiy kafolati bilan sotiladi (mahsulotga qarab 12 oygacha).",
    payment: "To'lov: naqd, plastik karta yoki nasiya (3, 6, 12, 24 oy).",
    thanks: "Marhamat! Yana savol bo'lsa, yozing.",
    handoff: "Operatorga ulandim. Yozgan xabarlaringiz unga yetadi, javobni shu yerning o'zida olasiz. Tezroq bog'lanishi uchun telefon raqamingizni ham yozing.",
    relay: 'Xabaringiz operatorga yuborildi.',
    leadAsk: "Telefon raqamingizni yozing, operator mavjudlikni tasdiqlab bog'lanadi.",
    lead: (ph, pr) => 'Rahmat! ' + ph + ' raqamiga operator tez orada qo\'ng\'iroq qiladi.' + (pr ? ' So\'rov: ' + pr + '.' : ''),
    fallback: "Savolingizni to'liq tushunmadim. Qurilma nomini yozing (narx va nasiyani aytaman) yoki «operator» deb yozing.",
    none: 'Bunday qurilmani topa olmadim. Mavjudlari:'
  },
  en: {
    som: 'UZS', mo: 'mo', cash: 'Cash price', was: 'was',
    hello: 'Hello! Which device are you interested in? Ask about prices, installments, branches or delivery.',
    list: 'Our devices and prices:', askModel: 'Which device should I calculate installments for? Type its name (e.g. S26 Ultra).',
    instIntro: 'Installments for 3, 6, 12 and 24 months. The monthly payment includes a markup on the price.',
    branches: 'Our branches:', route: 'Directions', hours: 'Hours',
    delivery: 'We deliver across Tashkent. Shipping to other regions is arranged with an operator.',
    warranty: 'Every device is sold with the official Samsung warranty (up to 12 months depending on the product).',
    payment: 'Payment: cash, bank card or installments (3, 6, 12, 24 months).',
    thanks: "You're welcome! Write again if you have more questions.",
    handoff: "I've connected you to an operator. Your messages reach them and you'll get the reply right here. Leave your phone number so they can reach you faster.",
    relay: 'Your message was sent to the operator.',
    leadAsk: 'Leave your phone number and an operator will confirm availability.',
    lead: (ph, pr) => 'Thank you! An operator will call ' + ph + ' shortly.' + (pr ? ' Request: ' + pr + '.' : ''),
    fallback: 'I did not fully understand. Type a device name (I will give price and installments) or write "operator".',
    none: "I couldn't find that device. Available:"
  },
  ru: {
    som: 'сум', mo: 'мес', cash: 'Цена наличными', was: 'было',
    hello: 'Здравствуйте! Какое устройство вас интересует? Спросите о ценах, рассрочке, филиалах или доставке.',
    list: 'Наши устройства и цены:', askModel: 'Для какого устройства рассчитать рассрочку? Напишите название (например, S26 Ultra).',
    instIntro: 'Рассрочка на 3, 6, 12 и 24 месяца. В ежемесячный платёж входит наценка на цену.',
    branches: 'Наши филиалы:', route: 'Маршрут', hours: 'Время работы',
    delivery: 'Доставка по Ташкенту доступна. В регионы отправляем по согласованию с оператором.',
    warranty: 'Все устройства продаются с официальной гарантией Samsung (до 12 месяцев в зависимости от товара).',
    payment: 'Оплата: наличные, карта или рассрочка (3, 6, 12, 24 месяца).',
    thanks: 'Пожалуйста! Пишите, если будут вопросы.',
    handoff: 'Подключил оператора. Ваши сообщения дойдут до него, ответ придёт здесь же. Оставьте номер телефона, чтобы связаться быстрее.',
    relay: 'Ваше сообщение отправлено оператору.',
    leadAsk: 'Оставьте номер телефона, оператор подтвердит наличие и свяжется с вами.',
    lead: (ph, pr) => 'Спасибо! Оператор скоро позвонит на ' + ph + '.' + (pr ? ' Запрос: ' + pr + '.' : ''),
    fallback: 'Не совсем понял вопрос. Напишите название устройства (назову цену и рассрочку) или слово «оператор».',
    none: 'Такое устройство не нашёл. Есть в наличии:'
  }
};
const RX = {
  handoff: /operator|odam bilan|menejer|manager|human|real person|live agent|оператор|менеджер|человек|живой|позвон|перезвон|qo'ng'iroq qil|qongiroq|call me/,
  greet: /^(salom|assalom|hello|hi|hey|привет|здравств|добрый|xayrli)\b|^(salom|assalom|привет|здравств)/,
  thanks: /rahmat|raxmat|thank|спасиб/,
  inst: /nasiya|bo'lib|oylik|oyiga|muddatli|rassroch|рассроч|в месяц|installment|monthly|credit/,
  price: /narx|qancha|necha pul|nech pul|price|cost|how much|цена|сколько|стоит|стоим/,
  branch: /manzil|filial|qayerda|qayer|joylash|lokatsiya|adres|address|where|location|адрес|где|филиал|как добраться/,
  hours: /ish vaqti|necha(da|gacha)|ochiq|hours|open|график|время работы|работаете|режим/,
  delivery: /yetkaz|dostavka|delivery|ship|достав/,
  warranty: /kafolat|warranty|guarantee|гарант/,
  payment: /to'lov|tolov|karta|naqd|payment|cash|оплат|наличн|click|payme/
};
const CATW = [
  [/smartfon|telefon|phone|смартфон|телефон|flagman|флагман/, /flagman|smartfon|buklan|phone|foldable|смартфон|складн|флагман/i],
  [/planshet|tablet|планшет/, /planshet|tablet|планшет/i],
  [/soat|watch|часы/, /watch/i],
  [/quloqchin|buds|earbud|наушник/, /buds|earbud/i]
];
const normText_ = (s) => String(s).toLowerCase().replace(/[ʻʼ’`´]/g, "'").replace(/[^a-z0-9а-яё'\s+]/g, ' ').replace(/\s+/g, ' ').trim();

function chatRows_(sid) {
  const s = sheet_('chats'), last = s.getLastRow();
  if (last < 2) return [];
  const from = Math.max(2, last - 399);
  return s.getRange(from, 1, last - from + 1, 7).getValues()
    .map(r => ({ id: String(r[0]), date: String(r[1]), sid: String(r[2]), from: String(r[3]), text: String(r[4]), lang: String(r[5]), tgid: String(r[6]) }))
    .filter(r => r.id && (!sid || r.sid === sid));
}
function escalated_(rows) {
  let e = false;
  rows.forEach(r => { if (r.from === 'system') { if (r.text === 'handoff') e = true; else if (r.text === 'resume') e = false; } });
  return e;
}
function pushChat_(sid, from, text, lang, tgid, offsetMs) {
  const row = { id: id_(), date: new Date(Date.now() + (offsetMs || 0)).toISOString(), sid: sid, from: from, text: text, lang: lang || '', tgid: tgid || '' };
  lock_(() => append_('chats', row));
  return row;
}
const money2_ = (n) => money_(n);

function findProducts_(text, products) {
  const words = normText_(text).split(' ');
  let best = 0, res = [];
  products.forEach(p => {
    const toks = normText_(p.name).split(' ').filter(w => w && w !== 'samsung' && w !== 'galaxy');
    let sc = 0;
    toks.forEach(w => { if (words.indexOf(w) >= 0) sc += w.length > 2 ? 2 : 1; });
    if (sc > best) { best = sc; res = [p]; } else if (sc === best && sc > 0) res.push(p);
  });
  return best >= 2 ? res.slice(0, 3) : [];
}
function lastProduct_(rows, products) {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].from !== 'user') continue;
    const f = findProducts_(rows[i].text, products);
    if (f.length) return f[0];
  }
  return null;
}
function phoneIn_(text) {
  const m = String(text).match(/(?:\+?998)?[\s\-()]*(\d{2})[\s\-()]*(\d{3})[\s\-]*(\d{2})[\s\-]*(\d{2})(?!\d)/);
  return m ? m[1] + m[2] + m[3] + m[4] : '';
}

// Qoidalar asosidagi konsultant: katalog (narx, nasiya, filiallar) dan javob beradi
function reply_(text, lang, cat, rows) {
  const W = TX[lang] || TX.uz, S = cat.settings || {};
  const P = (cat.products || []).filter(p => p.name), B = cat.branches || [];
  const mk = { 3: Number(S.m3) || 0, 6: Number(S.m6) || 0, 12: Number(S.m12) || 0, 24: Number(S.m24) || 0 };
  const money = (n) => money2_(n) + ' ' + W.som;
  const prodLine = (p) => '📱 ' + p.name + '\n' + W.cash + ': ' + money(Number(p.price)) + (Number(p.oldPrice) > Number(p.price) ? ' (' + W.was + ' ' + money(Number(p.oldPrice)) + ')' : '');
  const inst = (p) => [3, 6, 12, 24].map(m => m + ' ' + W.mo + ': ' + money(Number(p.price) * (1 + mk[m] / 100) / m) + '/' + W.mo).join('\n');
  const q = normText_(text);
  const found = findProducts_(text, P);
  if (RX.thanks.test(q) && q.length < 40) return W.thanks;
  if (found.length) return found.map(p => prodLine(p) + '\n' + inst(p)).join('\n\n') + '\n\n' + W.leadAsk;
  if (RX.inst.test(q)) { const lp = lastProduct_(rows, P); return lp ? W.instIntro + '\n\n' + prodLine(lp) + '\n' + inst(lp) + '\n\n' + W.leadAsk : W.instIntro + '\n' + W.askModel; }
  if (RX.branch.test(q) || RX.hours.test(q)) {
    if (!B.length) return W.fallback;
    return W.branches + '\n' + B.map(b => {
      const nm = (lang !== 'uz' && b['name_' + lang]) || b.name, hr = (lang !== 'uz' && b['hours_' + lang]) || b.hours;
      return '📍 ' + nm + (hr ? '\n' + W.hours + ': ' + hr : '') + '\n' + W.route + ': https://www.google.com/maps/dir/?api=1&destination=' + b.lat + ',' + b.lng;
    }).join('\n\n');
  }
  if (RX.delivery.test(q)) return W.delivery;
  if (RX.warranty.test(q)) return W.warranty;
  if (RX.payment.test(q)) return W.payment;
  for (let i = 0; i < CATW.length; i++) {
    if (CATW[i][0].test(q)) {
      const list = P.filter(p => CATW[i][1].test(p.name + ' ' + p.category));
      if (list.length) return W.list + '\n' + list.slice(0, 6).map(p => '• ' + p.name + ' — ' + money(Number(p.price))).join('\n') + '\n\n' + W.leadAsk;
    }
  }
  if (RX.price.test(q)) return W.list + '\n' + P.slice(0, 8).map(p => '• ' + p.name + ' — ' + money(Number(p.price))).join('\n') + '\n\n' + W.askModel;
  if (RX.greet.test(q) && q.length < 30) return W.hello;
  return W.fallback;
}

// Ixtiyoriy AI konsultant (ANTHROPIC_API_KEY kerak). Xato bo'lsa null qaytaradi, qoidalarga o'tiladi.
function ai_(text, lang, cat, rows) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const S = cat.settings || {}, W = TX[lang] || TX.uz;
    const names = { uz: "o'zbek", en: 'English', ru: 'русский' };
    const sys = 'You are the sales consultant of DEHKON db BOZOR, an official Samsung dealer in Uzbekistan. Reply in ' + names[lang] + '. ' +
      'Use ONLY the facts below for prices, availability and branches; never invent anything. Prices are in UZS (so\'m). ' +
      'Installment monthly payment = price * (1 + markup%/100) / months; markups: 3mo ' + S.m3 + '%, 6mo ' + S.m6 + '%, 12mo ' + S.m12 + '%, 24mo ' + S.m24 + '%. ' +
      'Delivery: ' + TX.en.delivery + ' Warranty: ' + TX.en.warranty + ' ' + 'Payment: ' + TX.en.payment + ' ' +
      'Keep answers under 80 words, plain text, no markdown. If the customer wants to order, ask for their phone number so an operator can call. If you do not know, say an operator will help.\n\nPRODUCTS:\n' +
      (cat.products || []).map(p => '- ' + p.name + ' | ' + p.category + ' | ' + p.price + (Number(p.oldPrice) > Number(p.price) ? ' (was ' + p.oldPrice + ')' : '') + ' | ' + p.desc_en).join('\n') +
      '\n\nBRANCHES:\n' + (cat.branches || []).map(b => '- ' + b.name_en + ' | ' + b.desc_en + ' | ' + (b.hours_en || b.hours || '') + ' | https://www.google.com/maps/dir/?api=1&destination=' + b.lat + ',' + b.lng).join('\n');
    const msgs = [];
    rows.filter(r => r.from === 'user' || r.from === 'bot' || r.from === 'operator').slice(-10).forEach(r => {
      const role = r.from === 'user' ? 'user' : 'assistant';
      if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + r.text; else msgs.push({ role: role, content: r.text });
    });
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') msgs.push({ role: 'user', content: text });
    const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: AI_MODEL, max_tokens: 400, system: sys, messages: msgs })
    });
    const j = JSON.parse(r.getContentText());
    const out = j.content && j.content[0] && j.content[0].text;
    if (!out) console.error('AI javobi yo\'q: ' + r.getContentText().slice(0, 300));
    return out ? String(out).trim() : null;
  } catch (e) { console.error('AI: ' + e); return null; }
}

function chat_(b) {
  if (b.hp) return { ok: true, replies: [] };
  const sid = String(b.sid || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
  const text = clean_(b.text, 500), lang = ['uz', 'en', 'ru'].indexOf(b.lang) >= 0 ? b.lang : 'uz';
  if (sid.length < 16 || !text) return { ok: false, error: 'invalid' };
  if (limited_('ch-' + sid, 15, 60) || limited_('ch-all', 400, 300)) return { ok: false, error: 'rate' };
  const W = TX[lang] || TX.uz, rows = chatRows_(sid), esc = escalated_(rows), cat = JSON.parse(catalogJson_());
  const out = [], tag = '[' + sid.slice(0, 6) + '] ';
  const botSay = (msg) => { const r = pushChat_(sid, 'bot', msg, lang, '', 2 + out.length); out.push({ id: r.id, from: 'bot', text: r.text, date: r.date }); };

  // 1) operator rejimi: xabar Telegramga uzatiladi
  if (esc) {
    const tgr = tg_('💬 ' + tag + text + '\n(javob berish: shu xabarga Reply qiling yoki admin paneldagi Chat bo\'limi)');
    pushChat_(sid, 'user', text, lang, tgr.id || '');
  } else {
    pushChat_(sid, 'user', text, lang, '');
    if (rows.length === 0) notify_('💬 Yangi suhbat ' + tag + '\n' + text + '\n🕒 ' + now_());
  }
  const ph = phoneIn_(text);
  const lp = lastProduct_(rows.concat([{ from: 'user', text: text }]), cat.products || []);
  // 2) telefon raqam: so'rov yaratiladi
  if (ph) {
    const r = submitRequest_({ phone: ph, product: lp ? lp.name : '', price: lp ? lp.price : '', lang: lang });
    if (r.ok) { if (!esc) botSay(W.lead('+998 ' + ph.replace(/(\d{2})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4'), lp ? lp.name : '')); return { ok: true, replies: out, escalated: esc }; }
  }
  if (esc) { botSay(W.relay); return { ok: true, replies: out, escalated: true }; }
  // 3) operatorni so'rash
  if (RX.handoff.test(normText_(text))) {
    const tgr = tg_('🆘 Operator kerak ' + tag + '\n' + rows.concat([{ from: 'user', text: text }]).filter(r => r.from === 'user' || r.from === 'bot').slice(-6).map(r => (r.from === 'user' ? '👤 ' : '🤖 ') + r.text.slice(0, 160)).join('\n') + '\n\n🕒 ' + now_());
    pushChat_(sid, 'system', 'handoff', '', tgr.id || '', 1);
    botSay(W.handoff);
    return { ok: true, replies: out, escalated: true };
  }
  // 4) konsultant javobi: AI (agar yoqilgan bo'lsa), aks holda qoidalar
  const ans = ai_(text, lang, cat, rows.concat([{ from: 'user', text: text }])) || reply_(text, lang, cat, rows.concat([{ from: 'user', text: text }]));
  botSay(ans);
  return { ok: true, replies: out, escalated: false };
}

function chatPoll_(b) {
  const sid = String(b.sid || '').replace(/[^a-f0-9]/gi, '').slice(0, 40), since = String(b.since || '');
  if (sid.length < 16) return { ok: false };
  if (limited_('cp-' + sid, 40, 60)) return { ok: false, error: 'rate' };
  const rows = chatRows_(sid);
  return {
    ok: true, escalated: escalated_(rows),
    messages: rows.filter(r => (r.from === 'operator' || r.from === 'bot') && r.date > since).map(r => ({ id: r.id, from: r.from, text: r.text, date: r.date }))
  };
}

// ---------- Telegram webhook: guruhda botning xabariga Reply qilingan javob chatga qaytadi ----------
function telegramUpdate_(e) {
  const secret = PropertiesService.getScriptProperties().getProperty('TG_SECRET');
  if (!secret || e.parameter.tg !== secret) return { ok: false };
  let u; try { u = JSON.parse(e.postData.contents); } catch (_) { return { ok: false }; }
  const cache = CacheService.getScriptCache();
  if (cache.get('tgu-' + u.update_id)) return { ok: true }; // Telegram qayta yuborsa takrorlanmasin
  cache.put('tgu-' + u.update_id, '1', 21600);
  const m = u.message || u.edited_message;
  if (!m || !m.text || !m.reply_to_message) return { ok: true };
  if (/^-?\d+$/.test(String(CHAT_ID)) && String(m.chat.id) !== String(CHAT_ID)) return { ok: true };
  const ref = String(m.reply_to_message.message_id);
  const hit = chatRows_('').filter(r => r.tgid === ref)[0];
  if (!hit) return { ok: true };
  if (m.text.trim().toLowerCase() === '/bot') { pushChat_(hit.sid, 'system', 'resume', '', ''); return { ok: true }; }
  pushChat_(hit.sid, 'operator', clean_(m.text, 800), '', '');
  return { ok: true };
}
// Bir marta ishga tushiring (BOT_TOKEN va, kerak bo'lsa, WEBAPP_URL ni yozgandan keyin)
function setTelegramWebhook() {
  const props = PropertiesService.getScriptProperties();
  let sec = props.getProperty('TG_SECRET');
  if (!sec) { sec = Utilities.getUuid().replace(/-/g, ''); props.setProperty('TG_SECRET', sec); }
  const base = WEBAPP_URL || ScriptApp.getService().getUrl();
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/setWebhook?drop_pending_updates=true&url=' + encodeURIComponent(base + '?tg=' + sec), { muteHttpExceptions: true });
  console.log(r.getContentText());
}
