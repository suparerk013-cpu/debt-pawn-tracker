# หนี้สิน & ตั๋วจำนำ — Debt & Pawn Tracker

โค้ดทั้งหมดตามสเปกใน `debt-pawn-tracker-system-prompt.md` พร้อมใช้งาน แบ่งเป็น 2 ส่วน:

```
debt-pawn-tracker/
  app/       ← Capacitor app (HTML/CSS/JS) — ห่อเป็น Android APK
  backend/   ← PHP REST API + MySQL schema
```

สิ่งที่ผมทำให้เสร็จแล้ว: โค้ด backend ทั้งหมด (auth/JWT, CRUD หนี้+งวด+ตั๋วจำนำ, dashboard, settings, cron+FCM sender), และแอป frontend ที่ต่อกับ API จริง (ไม่ใช่ mock data แล้ว) พร้อม PIN lock ที่ตรวจสอบกับ backend จริง

สิ่งที่ **ต้องทำเอง** (บัญชี/บริการภายนอกที่ผมสมัครแทนไม่ได้): สมัคร hosting, สมัคร cron-job.org, สร้าง Firebase project — ทำตามขั้นตอนด้านล่าง

---

## 1. ตั้งค่า Backend (PHP + MySQL บน InfinityFree)

1. สมัครบัญชีที่ [infinityfree.com](https://infinityfree.com) แล้วสร้างเว็บไซต์ใหม่ (จะได้โดเมนแบบ `yourname.infinityfreeapp.com`)
2. ไปที่ **MySQL Databases** ในควบคุมพาเนล สร้างฐานข้อมูลใหม่ จดค่า: hostname, database name, username, password
3. เปิด **phpMyAdmin** จากพาเนล → เลือกฐานข้อมูล → แท็บ **Import** → อัปโหลดไฟล์ [`backend/schema.sql`](backend/schema.sql) → Go
4. คัดลอก `backend/config/config.example.php` เป็น `backend/config/config.php` (ไฟล์นี้ถูก gitignore ไว้ ไม่มีทางหลุดขึ้น git repo โดยไม่ตั้งใจ) แล้วแก้ไข `backend/config/config.php`:
   - ใส่ `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS` จากขั้นตอนที่ 2
   - สร้างค่าสุ่มสำหรับ `JWT_SECRET` และ `CRON_SECRET` ด้วยคำสั่ง:
     ```bash
     php -r "echo bin2hex(random_bytes(32));"
     ```
     (รันบนเครื่องไหนก็ได้ที่มี PHP หรือใช้เว็บ random string generator ก็ได้ ขอแค่เป็นสตริงยาวสุ่มไม่ซ้ำใคร)
5. อัปโหลดทั้งโฟลเดอร์ `backend/` ขึ้นไปที่ `htdocs/` ผ่าน FTP (FileZilla) หรือ File Manager ในพาเนล ให้โครงสร้างเป็น `htdocs/backend/api/...`, `htdocs/backend/config/...` เป็นต้น
6. ทดสอบว่า backend ทำงาน: เปิด `https://yourname.infinityfreeapp.com/backend/api/auth/login.php` ด้วย POST (ใช้ Postman หรือ curl) ส่ง `{"pin":"1234"}` — ควรได้ JWT token กลับมา

> **หมายเหตุสำคัญ**: hosting ฟรีอย่าง InfinityFree บาง instance **บล็อกการเชื่อมต่อออก (outbound cURL)** ไปยังเซิร์ฟเวอร์ภายนอก ซึ่งจำเป็นสำหรับการยิง push notification ไป Firebase (`backend/lib/FcmSender.php` ใช้ cURL เรียก `oauth2.googleapis.com` และ `fcm.googleapis.com`) ถ้าทดสอบแล้วส่ง push ไม่ได้ (endpoint cron คืนค่า `sent:0` ตลอด) ให้ลอง hosting ฟรีทางเลือกที่อนุญาต outbound request เช่น **000webhost**, **Byet.host**, หรือย้าย endpoint cron ไปรันบน Render.com free tier (รองรับ PHP ผ่าน Docker) — โค้ดใช้ได้เหมือนเดิมไม่ต้องแก้

---

## 2. ตั้งค่า Cron (cron-job.org)

1. สมัครบัญชีฟรีที่ [cron-job.org](https://cron-job.org)
2. สร้าง cronjob ใหม่:
   - URL: `https://yourname.infinityfreeapp.com/backend/api/cron/check-due.php`
   - Method: `POST`
   - Schedule: ทุกวัน เวลา 08:00 (ตามต้องการ)
   - Headers: เพิ่ม `X-Cron-Secret: <ค่า CRON_SECRET ที่ตั้งไว้ในขั้นตอนที่แล้ว>`
3. บันทึกและกด "Test run" เพื่อดูว่าได้ `{"ok":true,...}` กลับมา

---

## 3. ตั้งค่า Firebase Cloud Messaging (push notification)

1. ไปที่ [Firebase Console](https://console.firebase.google.com) → สร้างโปรเจกต์ใหม่ (ฟรี, Spark plan)
2. เพิ่มแอป Android: package name ต้องตรงกับ `appId` ใน [`app/capacitor.config.json`](app/capacitor.config.json) คือ `com.debtpawn.tracker`
3. ดาวน์โหลดไฟล์ `google-services.json` — เก็บไว้ก่อน จะใช้ตอน build APK (ขั้นตอนที่ 4)
4. ไปที่ **Project Settings > Service Accounts** → กด **Generate new private key** → จะได้ไฟล์ JSON
5. อัปโหลดไฟล์นั้นไปที่ `backend/config/firebase-service-account.json` บน hosting (**อย่า** เผยแพร่ไฟล์นี้ที่ไหนที่เข้าถึงได้สาธารณะ)
6. แก้ `FCM_PROJECT_ID` ใน `backend/config/config.php` ให้ตรงกับ Project ID ใน Firebase

---

## 3.5 ตั้งค่า Google Sign-In (หน้าล็อกอิน)

ใช้ Firebase project เดียวกับข้อ 3 ได้เลย ไม่ต้องสร้างใหม่

1. ไปที่ [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials) (โปรเจกต์เดียวกับ Firebase — เลือกจาก dropdown บนสุด)
2. จะเห็น OAuth 2.0 Client ID ที่ Firebase สร้างให้อัตโนมัติเมื่อเปิดใช้ Authentication (ถ้ายังไม่มี ให้ไปเปิด **Authentication > Sign-in method > Google** ใน Firebase Console ก่อน)
3. คัดลอกค่า **Web client ID** (รูปแบบ `xxxxx.apps.googleusercontent.com`) มาใส่ 2 ที่:
   - `backend/config/config.php` → `GOOGLE_CLIENT_ID`
   - `app/capacitor.config.json` → `plugins.GoogleAuth.serverClientId`
4. สร้าง **Android** OAuth client ID เพิ่มอีกตัว (จำเป็นสำหรับ native sign-in บน Android): ใส่ package name `com.debtpawn.tracker` และ SHA-1 fingerprint ของ keystore ที่จะใช้ sign APK (ดูวิธีหา SHA-1 ในขั้นตอนที่ 4 ด้านล่าง หลัง build ครั้งแรก) — Android client ID นี้ไม่ต้องเอาไปใส่ในโค้ดที่ไหน แค่ต้องมีอยู่ในโปรเจกต์เดียวกับ Web client ID

> ถ้ายังไม่ได้ตั้งค่านี้ ปุ่ม "เข้าสู่ระบบด้วย Google" จะยังกดได้ (ไม่ error) แต่ระบบจะขึ้นข้อความแจ้งว่ายืนยันไม่สำเร็จ — ผู้ใช้ยังตั้ง PIN ปกติแล้วใช้งานต่อได้เหมือนเดิม ไม่ใช่ฟีเจอร์ที่บังคับต้องมี

---

## 4. Build แอป Android (APK)

### วิธีที่แนะนำ: build ผ่าน GitHub Actions (ไม่ต้องมี Android Studio)

เครื่องนี้มีพื้นที่ดิสก์เหลือไม่พอสำหรับ Android SDK/Gradle เลยตั้งระบบให้ build บนคลาวด์แทน — GitHub ให้เนื้อที่/เครื่องฟรีสำหรับรัน CI (GitHub Actions) ผลลัพธ์คือไฟล์ `.apk` จริงที่ดาวน์โหลดมาลงมือถือได้เลย

**สิ่งที่ทำให้แล้ว** (อยู่ใน repo นี้): ไฟล์ `.github/workflows/build-apk.yml` — บอกให้ GitHub Actions ติดตั้ง Node.js + JDK 17 + Android SDK เอง แล้วรัน `npx cap add android` → `npx cap sync` → `./gradlew assembleDebug` โดยอัตโนมัติทุกครั้งที่ push โค้ด หรือกดรันเองก็ได้

**สิ่งที่ต้องทำเอง** (ต้องมีบัญชี GitHub — สมัครฟรีที่ [github.com](https://github.com) ถ้ายังไม่มี):

1. สร้าง repository ใหม่บน GitHub (private หรือ public ก็ได้) เช่น `debt-pawn-tracker` — **อย่าติ๊ก** "Add a README" ตอนสร้าง (repo ต้องว่างเปล่า)
2. กลับมาที่เครื่องนี้ รันคำสั่งนี้ (แก้ `YOUR_USERNAME` และ `YOUR_REPO` ให้ตรงกับที่สร้างไว้):
   ```bash
   cd "debt-pawn-tracker"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
   ตอน push ครั้งแรก Git อาจถามให้ล็อกอิน GitHub ในเบราว์เซอร์ — ทำตามได้เลย
3. ไปที่หน้า repo บน GitHub → แท็บ **Actions** → จะเห็น workflow "Build Android APK" กำลังรันอยู่ (รันอัตโนมัติทันทีที่ push) รอสัก 5-10 นาที
4. พอรันเสร็จ (เครื่องหมายถูกสีเขียว) → กดเข้าไปในรายการรันนั้น → เลื่อนลงไปที่ **Artifacts** ด้านล่าง → ดาวน์โหลด `debt-pawn-tracker-debug-apk.zip`
5. แตกไฟล์ zip จะได้ `app-debug.apk` → ส่งไฟล์นี้เข้ามือถือ (ผ่าน Google Drive, LINE, สาย USB ฯลฯ) → เปิดไฟล์เพื่อติดตั้ง (ต้องเปิด "อนุญาตติดตั้งจากแหล่งที่ไม่รู้จัก" ในตั้งค่ามือถือครั้งแรก)

> **ก่อน push ครั้งแรก อย่าลืม**: แก้ `BASE_URL` ใน [`app/www/js/api.js`](app/www/js/api.js) ให้ชี้ไปที่ backend จริงที่ deploy ไว้แล้ว (ทำตามข้อ 1-3.5 ด้านบนให้เสร็จก่อน) ไม่งั้น APK ที่ได้จะต่อ backend จริงไม่ได้ (มันจะ fallback ไปที่ URL placeholder ที่ยังไม่มีอยู่จริง)

> **นี่คือ debug APK** (เซ็นด้วย debug keystore อัตโนมัติ) — ติดตั้งใช้เองได้ปกติ แจกลิงก์ตรงได้ตามสเปกเดิม แค่ไม่สามารถอัปโหลดขึ้น Play Store ได้ (ถ้าต้องการ release APK แบบเซ็นจริงในอนาคต ค่อยเพิ่ม keystore + step เซ็นในไฟล์ workflow ทีหลังได้)

### วิธีทางเลือก: build เองด้วย Android Studio (ถ้ามีเครื่องอื่นที่ติดตั้งไว้แล้ว)

ต้องมี [Node.js](https://nodejs.org), [Android Studio](https://developer.android.com/studio) (มี Android SDK + JDK) ติดตั้งไว้

```bash
cd app
npm install
```

1. แก้ [`app/www/js/api.js`](app/www/js/api.js) บรรทัด `BASE_URL` ให้ชี้ไปที่ backend จริงของคุณ:
   ```js
   const BASE_URL = 'https://yourname.infinityfreeapp.com/backend/api';
   ```
2. เพิ่ม Android platform:
   ```bash
   npx cap add android
   ```
3. วางไฟล์ `google-services.json` (จากขั้นตอนที่ 3) ไว้ที่ `app/android/app/google-services.json`
4. sync การตั้งค่า:
   ```bash
   npx cap sync android
   ```
5. เปิดโปรเจกต์ใน Android Studio:
   ```bash
   npx cap open android
   ```
6. ใน Android Studio: **Build > Generate Signed Bundle / APK** → เลือก APK → สร้าง keystore ใหม่ (เก็บรหัสผ่าน/ไฟล์ keystore ไว้ให้ดี ใช้ตอนอัปเดตแอปในอนาคตด้วย) → เลือก build variant `release` → Build
7. ได้ไฟล์ `app-release.apk` ใน `app/android/app/release/` — อัปโหลดขึ้นที่เก็บไฟล์ใดก็ได้ (Google Drive, เว็บของคุณเอง ฯลฯ) แล้วแจกลิงก์ดาวน์โหลดตรงได้เลย ไม่ต้องผ่าน Play Store

### หา SHA-1 fingerprint (สำหรับข้อ 3.5)
หลังสร้าง keystore แล้ว รันคำสั่งนี้ (แก้ path ให้ตรงกับ keystore ของคุณ):
```bash
keytool -list -v -keystore your-release-key.jks -alias your-key-alias
```
คัดลอกค่า `SHA1:` ไปกรอกตอนสร้าง Android OAuth client ID ในขั้นตอนที่ 3.5

### ไอคอนแอป
ยังไม่ได้ใส่ไอคอนจริง ถ้ามีโลโก้ (PNG สี่เหลี่ยมจัตุรัส ≥1024×1024) วางไว้ที่ `app/resources/icon.png` แล้วรัน:
```bash
npx @capacitor/assets generate --android
```
จะสร้างไอคอนทุกขนาดให้อัตโนมัติ

---

## 5. Flow การเข้าสู่ระบบ (อัปเดตล่าสุด)

แอปตอนนี้เป็นระบบ **หลายผู้ใช้จริง** ไม่ใช่แค่ PIN คนเดียวเหมือนตอนแรกแล้ว:

1. **เปิดแอปครั้งแรก** (ไม่มี session ค้างอยู่) → หน้า **เข้าสู่ระบบ/สมัครสมาชิก**
   - แท็บ "เข้าสู่ระบบ": ชื่อผู้ใช้ + รหัสผ่าน หรือปุ่ม "เข้าสู่ระบบด้วย Google", มีลิงก์ "ลืมรหัสผ่าน?"
   - แท็บ "สมัครสมาชิก": ชื่อผู้ใช้ + รหัสผ่าน + เบอร์โทรศัพท์ หรือ "สมัครสมาชิกด้วย Google"
2. **หลังเข้าสู่ระบบ/สมัครสำเร็จครั้งแรก** → หน้าตั้ง PIN ให้กรอก **2 รอบ** (กรอกครั้งแรก แล้วกรอกซ้ำเพื่อยืนยัน ถ้าไม่ตรงกันจะให้เริ่มใหม่)
3. **เปิดแอปครั้งต่อไป** (ยังมี session/token ค้างอยู่ในเครื่อง) → ข้ามหน้าล็อกอินไปเลย ขึ้นแค่หน้า **ใส่ PIN** อย่างเดียว
4. **ลืม PIN** → กด "ลืมรหัส PIN?" ที่หน้าปลดล็อก → กรอกชื่อผู้ใช้ + **เบอร์โทรศัพท์หรืออีเมล**ที่ลงทะเบียนไว้ (อย่างใดอย่างหนึ่ง) → ถ้าตรงกับที่บันทึกไว้ ตั้ง PIN ใหม่ได้ (กรอก 2 รอบเหมือนกัน) แล้วเข้าแอปได้เลย
5. **ลืมรหัสผ่าน** → กด "ลืมรหัสผ่าน?" ที่หน้าเข้าสู่ระบบ → กรอกชื่อผู้ใช้ + เบอร์โทรศัพท์หรืออีเมล + รหัสผ่านใหม่ → ถ้าตรงกัน เปลี่ยนรหัสผ่านสำเร็จ แล้วกลับไปหน้าเข้าสู่ระบบให้ล็อกอินใหม่

> ใช้ "เบอร์โทรหรืออีเมล" อย่างใดอย่างหนึ่งก็พอ เพราะบัญชีที่สมัครด้วย Google จะมีแค่อีเมล ไม่มีเบอร์โทร (Google ไม่ได้ส่งเบอร์โทรมาให้) — ระบบเช็คว่าค่าที่กรอกตรงกับเบอร์**หรือ**อีเมลที่บันทึกไว้ อย่างใดอย่างหนึ่งก็ผ่าน

> **ข้อจำกัดด้านความปลอดภัยที่ควรรู้**: การกู้คืน (ลืมรหัสผ่าน/ลืม PIN) ตรวจสอบแค่ "ชื่อผู้ใช้ + เบอร์โทรศัพท์หรืออีเมลตรงกับที่บันทึกไว้" เท่านั้น **ไม่มีการส่ง SMS OTP หรืออีเมลยืนยันจริง** เพราะต้องใช้บริการเสียเงิน (ไม่เข้ากับสเปก "ฟรี 100%") ถ้าใครรู้ทั้งชื่อผู้ใช้และเบอร์โทร/อีเมลของอีกคน จะสามารถรีเซ็ตรหัส/PIN ของเขาได้ — เหมาะกับแอปส่วนตัวที่ข้อมูลนี้ไม่มีใครรู้นอกจากเจ้าของ ถ้าจะใช้จริงจังและกังวลเรื่องนี้ ควรเพิ่ม SMS OTP หรือ email verification จริงในอนาคต (เช่นผ่าน Twilio, Firebase Phone Auth หรือส่งอีเมลยืนยันลิงก์ ซึ่งมี free tier)

### API endpoints ที่เกี่ยวข้อง
- `POST /api/auth/register.php` — สมัครสมาชิก (username, password, phone)
- `POST /api/auth/login.php` — เข้าสู่ระบบด้วย username+password
- `POST /api/auth/google-login.php` — เข้าสู่ระบบ/สมัครด้วย Google (แต่ละบัญชี Google แยกเป็นคนละ user)
- `POST /api/auth/verify-pin.php` — ตรวจ PIN ตอนปลดล็อกแอป (ใช้ token เดิมที่ค้างอยู่)
- `POST /api/auth/set-pin.php` — ตั้ง PIN ครั้งแรกหลังสมัคร/ล็อกอิน (ต้อง login อยู่)
- `POST /api/auth/forgot-password.php` — รีเซ็ตรหัสผ่านด้วย username + contact (เบอร์โทรหรืออีเมล)
- `POST /api/auth/forgot-pin.php` — รีเซ็ต PIN ด้วย username + contact (คืน token ให้ล็อกอินต่อได้เลย)
- `GET /api/auth/me.php` — เช็คว่า user ตั้ง PIN แล้วหรือยัง (ใช้ตอนเปิดแอป)

---

## 6. ทดสอบก่อนใช้งานจริง

- [ ] สมัครสมาชิกใหม่ (username/password/phone) → ควรเด้งไปหน้าตั้ง PIN แบบกรอก 2 รอบ
- [ ] ปิดแอปแล้วเปิดใหม่ → ควรขึ้นแค่หน้าใส่ PIN ไม่ใช่หน้าล็อกอิน
- [ ] ใส่ PIN ผิด 5 ครั้ง → ควรล็อก 30 วินาที
- [ ] ลองกด "ลืมรหัส PIN?" กรอก username + เบอร์โทร (หรืออีเมลถ้าสมัครด้วย Google) ที่สมัครไว้ → ตั้ง PIN ใหม่ได้ และเข้าแอปได้เลย
- [ ] ลองกด "ลืมรหัสผ่าน?" ที่หน้าล็อกอิน → เปลี่ยนรหัสผ่านสำเร็จแล้วล็อกอินด้วยรหัสใหม่ได้
- [ ] เพิ่มหนี้ใหม่ → เช็คว่าสร้างงวดผ่อน 3 งวดถัดไปให้อัตโนมัติ
- [ ] กด "บันทึกว่าจ่ายแล้ว" → ยอดคงเหลือลดลงถูกต้อง
- [ ] เพิ่มตั๋วจำนำ (มีช่องรหัสตั๋ว) → เลือก **ครบกำหนดต่อดอก** (7 วัน / 15 วัน / 1-4 เดือน / กำหนดเอง) → เช็ควันครบกำหนดที่คำนวณถูกต้อง และรหัสตั๋วแสดงในรายการ
- [ ] ไถ่ถอนตั๋ว / ต่อดอก → เลือกระยะเวลาต่อดอกได้เหมือนกัน ไม่ใช่ 30 วันตายตัว
- [ ] กด "เข้าสู่ระบบด้วย Google" (ต้อง build เป็น APK แล้วเท่านั้น ทดสอบในเบราว์เซอร์ธรรมดาไม่ได้) → ควรพาไปหน้าตั้ง PIN ต่อถ้ายังไม่เคยตั้ง
- [ ] เพิ่มค่าใช้จ่ายประจำ (เช่น ค่าเช่า, ค่าไฟ) → เช็คว่าไปโผล่ในหน้าแรกถูกต้อง
- [ ] กด "บันทึกว่าจ่ายแล้ว" ของค่าใช้จ่ายประจำ → ยอด "ต้องชำระเดือนนี้" ในหน้าแรกลดลง แต่ "ค่าใช้จ่ายประจำต่อเดือน" (ยอดรวมทั้งหมด) ต้องไม่เปลี่ยน
- [ ] หน้าแรก: เช็คว่า 4 ยอด (หนี้สิน / ตั๋วจำนำ / ค่าใช้จ่ายประจำ / ต้องชำระเดือนนี้) ตรงกับข้อมูลจริง และกดบันทึกจ่ายจากหน้านี้ได้เลยโดยไม่ต้องไปหน้าอื่น
- [ ] รอ cron รันจริง (หรือกด Test run ใน cron-job.org) แล้วดูว่า push แจ้งเตือนมาถึงเครื่องจริงไหม โดยเฉพาะ**ตอนแอปถูกปิด** (ทดสอบสำคัญที่สุด) — สำหรับตั๋วจำนำ เช็คด้วยว่าแจ้งเตือนซ้ำตามรอบที่เลือกไว้ (เช่น 7 วัน) ไม่ใช่ทุกวัน — สำหรับค่าใช้จ่ายประจำ เช็คว่าแจ้งเตือนด้วย (ไม่ใช่แค่ขึ้นในหน้าแรกเฉยๆ) และหยุดแจ้งทันทีที่กดบันทึกว่าจ่ายแล้ว

---

## 7. ค่าใช้จ่ายประจำต่อเดือน & หน้าแรกแบบรายงาน

ฟีเจอร์ใหม่ที่เพิ่มเข้ามา:

- **ค่าใช้จ่ายประจำต่อเดือน** (`recurring_expenses`): รายการค่าใช้จ่ายคงที่ทุกเดือน (ค่าเช่า, ค่าไฟ, ค่าเน็ต ฯลฯ) เพิ่มได้จากปุ่ม + ในหน้าแรก หรือจากหน้า "ค่าใช้จ่ายประจำ" เอง (กดเข้าจากการ์ดในหน้าแรก) แต่ละรายการกด "บันทึกว่าจ่ายแล้ว" ได้ทุกเดือน — พอขึ้นเดือนใหม่จะกลับเป็นสถานะยังไม่จ่ายให้อัตโนมัติ (เทียบจาก `last_paid_month` ไม่ต้องมี cron รีเซ็ต)
- **หน้าแรกกลายเป็นหน้ารายงานในตัว**: เดิมมีหน้า "รายงาน" แยกต่างหาก แต่ยุบรวมเข้ากับหน้าแรกแล้ว (เมนูล่างกลับไปเหลือ 4 ปุ่มเหมือนเดิม: หน้าแรก / หนี้สิน / ตั๋วจำนำ / ตั้งค่า) หน้าแรกตอนนี้แสดงสรุป 4 ยอด — ยอดหนี้สิน, ยอดตั๋วจำนำ, ค่าใช้จ่ายประจำต่อเดือน (ยอดรวมคงที่), และ**ยอดที่ต้องชำระเดือนนี้** (งวดหนี้ + ตั๋วจำนำ + ค่าใช้จ่าย ที่ครบกำหนดเดือนนี้และยังไม่จ่าย — ยอดนี้จะลดลงทันทีที่กดบันทึกจ่ายแต่ละรายการ) พร้อมรายการที่ต้องชำระและปุ่มบันทึกจ่ายในตัว ไม่ต้องสลับหน้าไปมา (endpoint เดิม `dashboard/near.php` ถูกลบไปเพราะข้อมูลซ้ำกับ `dashboard/report.php` ที่ครอบคลุมกว่า)
- **ครบกำหนดต่อดอก** (เดิมชื่อ "ระยะเวลาไถ่ถอน"): หน้าเพิ่มตั๋วจำนำเปลี่ยนคำเรียกให้สื่อว่าเป็นรอบต่อดอกที่เกิดซ้ำ ไม่ใช่กำหนดครั้งเดียว — ระบบเก็บ `period_unit`/`period_value` ไว้กับตั๋วแต่ละใบ (ตอนสร้างและตอนต่อดอกแต่ละครั้ง) แล้ว `cron/check-due.php` ใช้ค่านี้คำนวณว่าจะแจ้งเตือนซ้ำทุกกี่วัน แทนที่จะแจ้งทุกวันเหมือนเดิม เช่น เลือก "7 วัน" ตอนแรกแจ้งเตือนแล้วยังไม่ต่อดอก ระบบจะรอครบ 7 วันถึงแจ้งเตือนรอบต่อไป (ตั๋วเก่าที่ไม่มีค่านี้ยังคงแจ้งเตือนทุกวันเหมือนเดิม)
- **Push notification สำหรับค่าใช้จ่ายประจำ**: `cron/check-due.php` ตอนนี้แจ้งเตือนค่าใช้จ่ายประจำด้วย (เดิมมีแค่งวดหนี้กับตั๋วจำนำ) ใช้ `warn_days` เดียวกับที่ตั้งไว้ในหน้าตั้งค่า และแจ้งซ้ำทุกวันจนกว่าจะกดบันทึกว่าจ่ายแล้ว (เหมือน logic ของงวดหนี้) — พอขึ้นเดือนใหม่ที่ยังไม่จ่าย ระบบจะเริ่มแจ้งเตือนรอบใหม่ให้เองอัตโนมัติ

> **ถ้า deploy ไว้แล้วก่อนหน้านี้**: ต้องรัน `ALTER TABLE notification_log MODIFY ref_type ENUM('installment','pawn','expense') NOT NULL;` ในฐานข้อมูลก่อน ไม่งั้น cron จะ error ตอนพยายามบันทึก log การแจ้งเตือนค่าใช้จ่ายประจำ (ติดตั้งใหม่ทั้งหมดใช้ `schema.sql` ตามปกติได้เลย ไม่ต้องรันเพิ่ม)

### API endpoints ที่เพิ่ม/เปลี่ยน
- `GET/POST /api/expenses/index.php` — รายการ/เพิ่มค่าใช้จ่ายประจำ
- `PATCH /api/expenses/mark-paid.php` — บันทึกว่าจ่ายค่าใช้จ่ายประจำของเดือนนี้แล้ว
- `DELETE /api/expenses/delete.php` — ลบค่าใช้จ่ายประจำ
- `GET /api/dashboard/report.php` — ข้อมูลสรุปหน้าแรกทั้งหมด (4 ยอด + รายการที่ต้องชำระเดือนนี้) — แทนที่ `dashboard/near.php` เดิมซึ่งถูกลบออกแล้ว

---

## ข้อควรระวัง (ตามสเปกเดิม + ที่พบเพิ่ม)

- Hosting ฟรีอาจไม่เสถียร 100% และบางเจ้าบล็อก outbound cURL (ดูหมายเหตุในข้อ 1) — เหมาะกับ personal use ถ้าจะใช้จริงจังควรมีแผนย้ายไป hosting เสียเงินในอนาคต
- Android บางยี่ห้อ (Xiaomi, Huawei, OPPO) มี battery optimization ที่ block background process ต้องเข้าไปปิด optimization สำหรับแอปนี้เอง ไม่งั้น push อาจไม่มาตอนแอปถูกปิดนานๆ
- ไฟล์ `backend/config/config.php` และ `backend/config/firebase-service-account.json` มีความลับ (DB password, JWT secret, private key) — อย่าอัปโหลดขึ้น public repo หรือแชร์ให้ใคร
- การกู้คืนรหัสผ่าน/PIN ใช้แค่ username + เบอร์โทรหรืออีเมลตรงกัน ไม่มี SMS OTP หรือ email verification จริง (ดูรายละเอียดในหัวข้อ Flow การเข้าสู่ระบบด้านบน)
