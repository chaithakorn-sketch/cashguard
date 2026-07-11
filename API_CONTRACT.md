# CashGuard v2 — API Contract (backend → Claude Design frontend)

Backend เตรียม endpoint + data shape ไว้ให้แล้ว UI ทั้งหมด (Flex + Web app) มาจาก Claude Design
เอกสารนี้บอกว่า frontend เรียกอะไร ส่ง/รับ payload หน้าตายังไง และ Flex การ์ดต้องมี action อะไรบ้าง

โมเดลการเงิน = **Imprest** (โอนเข้าบัญชีพนักงาน, `balance` = virtual float ต่อคน จาก view `employee_balances`)

---

## 1) LINE flow (webhook `/api/line/webhook`)

กฎ: พนักงานต้อง **@tag OA** ทุกครั้ง ระบบถึงประมวลผล · รูปจะประมวลเฉพาะเมื่อมี draft เปิดค้าง (พิมพ์รายการก่อน)

### ค่าใช้จ่าย
1. `@Cammo ค่าน้ำมัน 100` → parser อ่านหมวด+ยอด → การ์ด **flexAskEvidence** (ปุ่ม `ไม่มีหลักฐาน`)
2. ส่งรูป **หรือ** กด `ไม่มีหลักฐาน` → **บันทึกทันที** (ไม่มีปุ่มยืนยันแยก) → การ์ด **flexExpenseSuccess** (ยอดคงเหลือ + 3 รายการล่าสุด + ปุ่ม `แก้ไขข้อมูล`→web)
3. การ์ด success ตอบในกลุ่มสาขาอยู่แล้ว = Sunlight (auto-post) สำหรับรายการใหม่

### เติมเงิน
1. `@Cammo เติมเงิน 5000` → **flexTopupAskSlip** (ปุ่ม `ไม่มีสลิป`)
2. ส่งสลิป/กดไม่มีสลิป → **flexTopup** (ยอดคงเหลือใหม่ + 3 รายการเติมล่าสุด)

### แก้ไข → ผ่าน web app เท่านั้น → PATCH → broadcast **flexEdited** (ก่อน→หลัง) เข้ากลุ่มสาขา

### Flex builders (ใน `lib/flex.ts` — typed, swap template ได้)
ทุกปุ่มเป็น `postback` ยกเว้น `แก้ไขข้อมูล` = `uri` (ไป LIFF) · **action string ห้ามเปลี่ยน** (backend อ่านค่าเหล่านี้):

| การ์ด | builder | ปุ่ม (postback `data`) |
|---|---|---|
| ถามหลักฐาน | `flexAskEvidence({id,amount,category})` | `action=no_evidence&id=` |
| ถามสลิปเติมเงิน | `flexTopupAskSlip({id,amount})` | `action=no_evidence&id=` |
| บันทึกค่าใช้จ่ายสำเร็จ | `flexExpenseSuccess({id,amount,vendor,category,payer,branch,balance,when,recent[],editUrl})` | footer `uri` → editUrl / หรือ `action=void&id=` |
| เติมเงินสำเร็จ | `flexTopup({amount,payer,branch,balance,round,recent[],editUrl})` | footer `uri` → editUrl |
| รอตรวจสอบ (flagged) | `flexFlagged({id,amount,item,reason,evidence,who,balance})` | `action=void&id=` |
| รูปซ้ำ | `flexRejectedDuplicate({id,amount,prevDate,prevBy,prevItem})` | `action=second_installment&id=` · `action=retake&id=` |
| ยอดไม่ตรงบิล | `flexOcrMismatch({id,typed,ocr})` | `action=use_ocr&id=` · `action=use_typed&id=` |
| แก้ไข (เข้ากลุ่ม) | `flexEdited({who,field,before,after,balance})` | — |

`recent[]` = `{label:string, amount:number}[]` (3 รายการล่าสุด) · `editUrl` = `LIFF_EDIT_URL?entry=<id>`

---

## 2) Web app REST API (backend พร้อมแล้ว)

**Auth ทุก endpoint:** frontend ส่ง LIFF access token (`liff.getAccessToken()`) เป็น
`Authorization: Bearer <token>` · backend แลกเป็น LINE userId → map employee
Errors: `401 unauthorized` · `403 not_registered|forbidden` · `404 not_found`

### `POST /api/liff/verify` — ยืนยันตัวตน (เรียกตอนเปิดหน้า)
→ `{ employee:{id,name,nickname,branch_id}, balance:number }`

### `GET /api/entries?type=&from=&to=&limit=` — รายการของตัวเอง (list/history)
- `type` = `expense|topup` (optional) · `from`/`to` = ISO datetime (optional) · `limit` ≤ 200 (default 50)
- → `{ balance:number, entries:[{id,type,status,amount,category,category_code,vendor,description,evidence_type,spent_at,submitted_at}] }`
- ownership บังคับ: คืนเฉพาะของ caller

### `GET /api/entries/[id]` — รายละเอียด + รูป (หน้าแก้ไข)
→ `{ entry:{...ทุก field}, receipts:[{id,url(signed),slip_status,uploaded_at}] }` · เจ้าของเท่านั้น

### `PATCH /api/entries/[id]` — แก้ไข (เจ้าของแก้ของตัวเองได้ทุกเมื่อ)
- body (ส่งเฉพาะ field ที่แก้): `{ amount?, spent_at?(ISO), category?, category_code?, vendor?, description? }`
- writes immutable `audit_log` (before/after) + broadcast **flexEdited** เข้ากลุ่มสาขา
- → `{ entry:{...updated}, balance:number }`

### `POST /api/upload` — แนบรูป (multipart/form-data)
- fields: `file=<image>`, `entry_id=<uuid>` · เจ้าของ entry เท่านั้น
- → `{ path, url(signed), ocr_amount }`

### `DELETE /api/upload?receipt_id=<uuid>` — ลบรูป (เจ้าของเท่านั้น) → `{ ok:true }`

> เปลี่ยนรูป = `POST` รูปใหม่ + `DELETE` รูปเก่า

---

## 3) ยังต้องรอ (Gino)
- ผูก `branches.line_group_id` ของ **bn / cw / sn** (ตอนนี้มีแค่ cb) — ส่ง group id มา ผม update ให้
- ใส่ env บน Vercel: `SLIP2GO_API_KEY` (reuse POS), `LINE_BOT_USER_ID`, `LIFF_EDIT_URL`, (option) `OCR_API_KEY`
- ตั้ง LINE webhook URL + สร้าง LIFF app (สำหรับ edit link) → เอา LIFF id มาใส่ `LIFF_EDIT_URL`
