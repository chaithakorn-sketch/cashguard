# งานที่เตรียมไว้ให้ (ทำรอตอนคุณไม่อยู่หน้าคอม)

อัปเดตทั้งหมดอยู่ใน repo + commit แล้ว push ทีเดียวได้ของครบ

## ✅ ฝั่งฐานข้อมูล (Supabase · ทำจริงไปแล้ว — live)
- **Storage bucket** `cashguard-receipts` (private) สำหรับเก็บรูปบิล
- **ตาราง `categories`** — 9 หมวด พร้อมเพดานต่อรายการ (travel/ค่าวิน เพดาน 300฿) และ flag หมวดบิลประจำก้อนใหญ่ (utilities)
- **ตาราง `vendor_aliases`** — 15 คำ map ชื่อร้านมั่วๆ → ชื่อมาตรฐาน + หมวดอัตโนมัติ (lalamove→ค่าส่ง, วิน→ค่าเดินทาง ฯลฯ)
- **`entries.category_code`** — ผูกกับตารางหมวด (ใช้เช็คเพดาน)
- **ฟังก์ชัน `confirm_entry()`** — ยืนยันรายการแบบ atomic (เปลี่ยนสถานะ + บันทึก flags + เขียน audit_log ในทรานแซกชันเดียว)
- **trigger `updated_at`** อัตโนมัติบน entries

## ✅ ฝั่งโค้ด (เติม TODO เป็นของจริง — typecheck + build ผ่าน)
- **`lib/phash.ts`** — pHash จริง (DCT 64-bit + Hamming distance) จับรูปบิลซ้ำ ทนการ resize/crop/แสง
- **`lib/storage.ts`** — อัปโหลดรูปเข้า bucket + สร้าง signed URL
- **`lib/parse.ts`** — parser ฉลาดขึ้น: ดึงยอด + เดาร้าน/หมวดจาก alias ใน DB
- **`lib/register.ts`** — auto-register พนักงานใหม่ (ดึงชื่อจาก LINE profile + สาขาจากกลุ่ม)
- **`lib/flags.ts`** — เพิ่ม flag `over_cap` (เกินเพดานหมวด) + `cross_branch` (จ่ายแทนสาขาอื่น)
- **`app/api/line/webhook/route.ts`** — wire ครบ: อัปโหลด Storage → จับรูปซ้ำ → OCR (stub) → ผูกหมวด → ตะกร้า → ยืนยันผ่าน RPC → ตอบ Flex + push เข้ากลุ่มผู้บริหารเมื่อ flag
- **postback actions ครบ** — confirm / use_ocr / use_typed / second_installment / add_photo / attach_now / retake / split / topup_urgent

## ⏳ ยังเหลือ (ต้องรอคุณ หรือรอ decision)
- **OCR จริง** — `lib/ocr.ts` ยังเป็น stub (คืน null) ต้องเลือกผู้ให้บริการ: Typhoon OCR (ไทยดีมาก) หรือ Google Vision แล้วต่อ endpoint + ใส่ API key
- **Push GitHub + Vercel deploy + ใส่ env + ตั้ง LINE webhook** — ต้องใช้สิทธิ์ของคุณ
- ผูก `branches.line_group_id` กับกลุ่มจริง และตรวจ flow ครั้งแรก

---

# เช็คลิสต์ deploy (ทำตอนกลับมาหน้าคอม)

```
[ ] 1. แตก zip → cd cashguard
[ ] 2. สร้าง repo เปล่าบน github.com ชื่อ cashguard
[ ] 3. git remote add origin https://github.com/<คุณ>/cashguard.git
       git push -u origin main
[ ] 4. Vercel → New Project → import repo cashguard
[ ] 5. ใส่ Environment Variables (ดู .env.example):
       SUPABASE_URL = https://uwniugxetyikjzkobifp.supabase.co
       SUPABASE_SERVICE_ROLE_KEY = (Supabase → Settings → API → service_role)
       LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET = (LINE OA เดิม)
       ASSET_BASE = https://<app>.vercel.app/cashguard
       CRON_SECRET = (สุ่มยาวๆ)
       ADMIN_GROUP_ID = (group id กลุ่มผู้บริหาร)
[ ] 6. Deploy
[ ] 7. LINE Developers → Webhook URL = https://<app>.vercel.app/api/line/webhook
       เปิด Use webhook · ปิด auto-reply
[ ] 8. เชิญ LINE OA เข้ากลุ่มสาขา → เก็บ group id → 
       update cashguard.branches set line_group_id='Cxxx' where code='cb';
[ ] 9. ส่งบิลทดสอบในกลุ่ม → ดูว่าระบบ auto-register + ตอบ Flex
```

หลัง deploy เสร็จ บอกผมได้เลย ผมต่อ **OCR จริง** ให้เป็นขั้นถัดไป (รอแค่เลือกผู้ให้บริการ)
