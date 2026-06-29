# CashGuard — เงินสดย่อยผ่าน LINE

ระบบบันทึกเงินสดย่อยผ่าน LINE OA สำหรับ CarcamStore (4 สาขา)
**Stack:** Next.js (App Router) · Supabase · Vercel · GitHub — ไม่ใช้ Firebase

---

## โครงสร้าง
```
app/
  api/line/webhook/route.ts        รับ LINE webhook + Draft Engine + ตอบ Flex
  api/cron/sweep-baskets/route.ts  เก็บตะกร้า draft ที่หมดเวลา (ทุก 5 นาที)
  api/cron/daily/route.ts          สรุปรายวันเข้ากลุ่มผู้บริหาร (19:00 ไทย)
  dashboard/page.tsx               หน้าตรวจสอบ (คงเหลือ + รายการรอตรวจ)
lib/
  supabase.ts  line.ts  draft-engine.ts  ledger.ts  flags.ts
  ocr.ts (stub)  phash.ts (stub)  flex.ts (Flex builders)  types.ts
public/cashguard/                  โลโก้ + ไอคอน (เสิร์ฟเป็น ASSET_BASE)
```

## ฐานข้อมูล
สร้างไว้แล้วใน Supabase project **carcamstore-hr** (`uwniugxetyikjzkobifp`) schema `cashguard`
7 ตาราง + view `employee_balances` (คำนวณยอดคงเหลือสด) + seed 4 สาขา (sn/cw/cb/bn)

## ตั้งค่า (ครั้งเดียว)

### 1. Push ขึ้น GitHub
```bash
git remote add origin https://github.com/<you>/cashguard.git
git push -u origin main
```

### 2. Import เข้า Vercel
vercel.com → New Project → เลือก repo `cashguard` → ใส่ Environment Variables (ดู `.env.example`):
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`  (Supabase → Settings → API)
- `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`  (LINE OA เดิม)
- `ASSET_BASE` = `https://<your-app>.vercel.app/cashguard`
- `CRON_SECRET` = สุ่มสตริงยาวๆ
- `ADMIN_GROUP_ID` = group id ของกลุ่มผู้บริหาร

### 3. ตั้ง LINE Webhook
LINE Developers → Messaging API → Webhook URL = `https://<your-app>.vercel.app/api/line/webhook`
เปิด Use webhook · ปิด auto-reply

### 4. ผูกกลุ่มสาขากับ branch
เชิญ LINE OA เข้ากลุ่มสาขา แล้วบันทึก group id:
```sql
update cashguard.branches set line_group_id = 'Cxxxx' where code = 'cb';
```

### 5. ลงทะเบียนพนักงาน
```sql
insert into cashguard.employees (line_user_id, name, nickname, branch_id)
values ('Uxxxx','ชื่อจริง','ชื่อเล่น',(select id from cashguard.branches where code='cb'));
```

## ยังต้องต่อ (TODO)
- `lib/ocr.ts` — เชื่อม Typhoon OCR / Google Vision (อ่านยอด/ร้าน/VAT)
- `lib/phash.ts` — implement pHash จริง (จับรูปซ้ำ)
- Storage — อัปโหลดรูปบิลเข้า Supabase Storage แล้วเก็บ public URL
- Postback actions ที่เหลือ (split / second_installment / use_ocr ฯลฯ)
- ลงทะเบียนพนักงานอัตโนมัติเมื่อเจอ line_user_id ใหม่

## Dev
```bash
npm install
cp .env.example .env.local   # แล้วเติมค่า
npm run dev
```
