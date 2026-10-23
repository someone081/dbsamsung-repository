# DEHKON db BOZOR — sayt + Google Apps Script serveri

```
public/            ← saytning o'zi (shu papkani hostingga yuklang)
  index.html  style.css  app.js  chat.js  i18n.js  icons.js  defaults.js  config.js
  admin.html  admin.js       ← admin panel (footerdagi "db" ni 4 marta bosing yoki /admin.html)
apps-script.gs     ← server: Google Sheets bazasi, Telegram, chat-konsultant
netlify/ + netlify.toml + package.json   ← ixtiyoriy: Netlify funksiyasi (Apps Script o'rniga)
```

## 1. Serverni yangilash (Apps Script)
1. Google Sheet → **Extensions → Apps Script**. Eski kodni o'chirib, `apps-script.gs` ni to'liq joylang.
2. Yuqoridagi `ADMIN_PASS` ni **o'zgartiring**, `BOT_TOKEN` va `CHAT_ID` ni yozing (2-bo'limga qarang). Saqlang.
3. `setup` funksiyasini tanlab **Run** bosing (ruxsat so'raydi → Allow). Yangi varaqlar yaratiladi va katalog standart ma'lumot bilan to'ldiriladi.
4. **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy.** Web app manzili o'zgarmaydi, shuning uchun `public/config.js` dagi `API` tayyor.

> Kodni har o'zgartirganingizda 4-qadamni takrorlang, aks holda sayt eski versiya bilan ishlaydi.

## 2. Telegram kanalga xabar
1. @BotFather → `/newbot` → token oling → `BOT_TOKEN` ga yozing.
2. Botni **kanalga ADMIN** qilib qo'shing (xabar yuborish huquqi bilan).
3. `CHAT_ID`: ochiq kanal bo'lsa `'@kanal_nomi'`, yopiq bo'lsa `-100…` raqami.
4. Tekshirish: Apps Script'da `testTelegram` ni Run qiling yoki admin panel → **Sozlamalar → Telegramni tekshirish**. Xato bo'lsa Telegram sababini ko'rsatadi (masalan `chat not found`: bot kanalga qo'shilmagan yoki ID noto'g'ri).

Kanalga keladiganlar: yangi **so'rov**, **murojaat**, **fikr**, yangi **chat** va "operator kerak" signali.

> Token va parollarni hech qachon chatga, sayt fayllariga yoki GitHub'ga yozmang. Oldin biror joyda ochiq yozilgan bo'lsa, @BotFather'da tokenni qayta yarating (`/revoke`).

## 3. Chat-konsultant
- **Tayyor ishlaydi:** konsultant katalogdan (narx, eski narx, nasiya 3/6/12/24 oy, filiallar, yetkazib berish, kafolat, to'lov) javob beradi. Telefon raqam yozilsa o'zi **so'rov** yaratadi.
- **Operatorga ulash:** mijoz "operator" desa suhbat operatorga o'tadi. Javob berish: admin panel → **Chat** bo'limi (hamma joyda ishlaydi). **Botga qaytarish** tugmasi konsultantni yoqadi.
- **Ixtiyoriy AI:** `ANTHROPIC_API_KEY` ga kalit yozsangiz, javoblarni Claude beradi (katalog ma'lumotlari asosida, ixtiro qilmaydi). Xato bo'lsa avtomatik qoidalarga qaytadi. Pullik xizmat.
- **Telegramdan javob berish (ixtiyoriy):** kanalda "javob berish" yo'q, shuning uchun bu uchun **guruh** kerak: botni guruhga qo'shing, `CHAT_ID` ni guruh ID siga o'zgartiring, `WEBAPP_URL` ga `/exec` manzilini yozing va `setTelegramWebhook` ni bir marta Run qiling. Keyin botning xabariga **Reply** qilsangiz, javob mijoz chatiga tushadi. `/bot` deb yozsangiz konsultant qaytadi.

## 4. Hosting
`public/` papkasini istalgan statik hostingga yuklang (Netlify'ga papkani sudrab tashlash ham ishlaydi, funksiya shart emas). Rasm, 3D va ma'lumotlar Google Drive/Sheets'da turadi.

Netlify funksiyasi bilan ishlamoqchi bo'lsangiz: `config.js` da `API: "/api"` qiling va Netlify'da `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET` (+ ixtiyoriy `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) o'zgaruvchilarini kiriting. Chat-konsultant faqat Apps Script rejimida ishlaydi.

## 5. Admin panel
`admin.html` → login/parol (`apps-script.gs` dagi `ADMIN_USER`/`ADMIN_PASS`).
Mahsulotlar (narx, eski narx → chegirma belgisi, belgi, banner, teglar, rasm/3D fayl yuklash, EN/RU tarjima), filiallar (koordinata Google Maps'dan nusxalanadi), so'rovlar, murojaatlar, fikrlar (tasdiqlansa saytda chiqadi), chat va sozlamalar (telefon, ijtimoiy tarmoqlar, nasiya foizlari).
Jadvalni Google Sheets'ning o'zida ham tahrirlash mumkin; sayt o'zgarishni 2 daqiqagacha kechikish bilan oladi.

## Cheklovlar
Rasmlar brauzerda kichraytirilib yuklanadi; 3D modellar `.glb`, ≤15 MB. Saytga kelgan fikrlar ular yozgan tilda ko'rinadi.
