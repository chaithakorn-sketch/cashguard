# CashGuard v2 — Handoff (ต่อจากแชทเดิมได้เลย)

> อ่านไฟล์นี้ + memory `cashguard-v2-status.md` แล้วทำต่อได้ทันที
> อัปเดตล่าสุด: 2026-07-11 · โค้ด LIVE prod แล้ว เหลือ **เก็บ pixel fidelity การ์ด Flex** ให้ตรง mockup ทุกใบ

---

## 0) CashGuard คืออะไร (สั้น)
ระบบเงินสดย่อย (petty cash, โมเดล **Imprest** — balance = virtual float ต่อคน) ของ CarcamStore 4 สาขา (sn ศรีนครินทร์ / cw แจ้งวัฒนะ / cb ชลบุรี / bn บางนา) ทำงานผ่าน **LINE OA "Cammo | ผู้ช่วย CCS"** (แยกจาก HR OA เด็ดขาด — HR OA webhook รันระบบผูกไลน์เงินเดือน ห้ามแตะ).
- พนักงาน @tag Cammo ในกลุ่มสาขา → พิมพ์ "ค่าน้ำมัน 100" → ส่งรูป/กดไม่มีหลักฐาน → บันทึก + การ์ดสรุป
- แก้ไข = ผ่าน LIFF web app เท่านั้น · เติมเงิน = @Cammo เติมเงิน 5000 → ส่งสลิป

## 1) แผนที่ระบบ (พิกัดสำคัญ)
| อะไร | ที่ไหน |
|---|---|
| Repo | `~/Downloads/cashguard` · github `chaithakorn-sketch/cashguard` (main = auto-deploy) |
| Deploy prod | **cashguard-rho.vercel.app** · Vercel project `cashguard` (`prj_JFxSJh1kR26b37Zhmr5uGZ3Me71V`, team GINO's `team_oqg6aFwC1q865iTduEub412b`) |
| DB | Supabase `carcamstore-hr` = `uwniugxetyikjzkobifp` (ap-southeast-1), schema `cashguard` · migration 0003 apply prod แล้ว |
| OA | "Cammo" (แยก) — token/secret/webhook/ASSET_BASE ตั้งใน Vercel env แล้ว (v1 เดิมใช้ได้) |
| กลุ่มที่ผูกแล้ว | **cb (CBR ชลบุรี)** `line_group_id=Cd1e122607449a2b76ee90e41886c3f15` · sn/cw/bn ยัง null (รอเชิญ Cammo + group id) |
| Assets | `public/cashguard/` — `cammo/*.png` (มาสคอต 320px + logo-carcam-red), `cammo-hd/*.png` (1024 ต้นฉบับ 7 ท่า), `headers/bg-<pose>.png` (พื้นแดง+Cammo ไม่มี text, gen จาก sharp) |

## 2) สถานะโค้ด — LIVE prod ครบ ✅
- **Backend** `app/api/line/webhook/route.ts`: @tag mention-gate (ผ่าน `body.destination`), ask-evidence → auto-save (ไม่มีปุ่มยืนยัน), OCR/Slip2Go safety valve, **multi-photo** (รูปตามมาใน 2 นาที → `attachExtraPhoto` แนบเข้ารายการล่าสุด + text), balance-check (`@Cammo ยอด`)
- **Slip2Go** `lib/slip.ts` (reuse POS provider; ไม่มี key = stub)
- **Web API** (LIFF, service-role): `POST /api/liff/verify`, `GET /api/entries`, `GET+PATCH /api/entries/[id]`, `POST+DELETE /api/upload` — เจ้าของแก้ของตัวเองได้ทุกเมื่อ
- **Web app** `app/edit/page.tsx`: LIFF list/history + แก้ไข expense/topup + แนบ/เปลี่ยน/ลบรูป (สไตล์ 3b)
- **Flex** `lib/flex.ts`: 13 การ์ด ดีไซน์ 3b
- tsc + `next build` ผ่าน

## 3) ⭐ Flex header = ฟอนต์จริง (ห้าม revert เป็นรูป)
Gino ค้านหนักว่า text ใน header ต้องเป็น **ฟอนต์จริง** ไม่ใช่รูป (เบลอ+ขนาดผิด).
**สถาปัตย์ปัจจุบัน (ถูกต้องแล้ว):** header = box ซ้อน 2 ชั้น
1. `image` bg-`<pose>`.png (พื้นแดง + Cammo ล้นขอบ — **ไม่มีตัวหนังสือ**) เป็น normal flow กำหนดความสูง (aspectRatio 360:132)
2. `box position:absolute` (offset 0 ทุกด้าน, justifyContent space-between) วางทับ — มี **pill(logo+Carcamstore) / eyebrow / title เป็น Flex text จริง**

pattern นี้ = แบบเดียวกับ LINE showcase "Apparel" (SALE badge) → **absolute ทำงานจริงบน LINE** (ยืนยันแล้ว).
- `gen-headers.mjs` gen แค่ bg 7 ท่า (`node gen-headers.mjs`) · Cammo HD อยู่ `public/cashguard/cammo-hd/`
- map การ์ด→(pose,eyebrow,title) อยู่ `HEADER_SPEC` ใน flex.ts
- **⚠️ อย่าเอา Cammo วางลอยเป็น inline flex image (Gino ไม่เอา) และอย่า bake text ในรูป (Gino ไม่เอา)**

## 4) ⭐⭐ วิธี verify Flex ให้เหมือน LINE จริง (ใช้ได้ชัวร์)
ใช้ **LINE Flex Simulator** (developers.line.biz/flex-simulator/) — render เหมือนแอปเป๊ะ, เปิดได้ไม่ต้อง login, ผ่าน **claude-in-chrome** (Chrome Gino เชื่อมอยู่ deviceId มี 1 ตัว).

**ขั้นตอน inject (สำคัญ — native setter ไม่เวิร์ค!):**
1. dump JSON การ์ด: `ASSET_BASE=https://cashguard-rho.vercel.app/cashguard npx tsx -e "import * as flex from './lib/flex.ts'; console.log(JSON.stringify(flex.flexAskEvidence({...})))"`
2. เก็บบน `window.__j` ผ่าน javascript_tool (String.raw`...`)
3. **real-click** "View as JSON" (พิกัด ~1458,52 — window อาจ resize เช็คพิกัดใหม่จาก screenshot ก่อน)
4. javascript_tool: `const ta=document.querySelector('textarea'); ta.focus(); ta.select(); document.execCommand('insertText',false,window.__j);` ← **ต้อง execCommand ไม่ใช่ .value=**
5. **real-click** "Apply" (~998,639) — ห้าม JS `.click()` (ไม่ trigger)
6. รูป bg โหลด async → `const w=document.querySelector('iframe').contentWindow; new w.Image().src='<bg url>'` preload → wait 1.5s → `zoom` การ์ด (preview อยู่ใน **iframe**)
7. reload simulator ถ้า inject ค้าง · **ห้าม JS traversal หนัก** (เคย freeze renderer/CDP timeout)

**เทียบ mockup:** ดึงค่า px จริงจาก `Flex Massage Line.dc.html` (Claude Design project `1687b615-afbe-426c-b18b-19264d602a25`, อ่านผ่าน DesignSync MCP) — persisted ที่ tool-results เดิม. LINE **รับ px** สำหรับ margin/padding/spacing/border/cornerRadius/offset (ใส่ค่า mockup เป๊ะได้) แต่ **text size เป็น keyword** (xxs..5xl) ไม่ใช่ px → เลือก keyword ใกล้สุด (title 27px→'xxl', amount 40px→'4xl', hint 13px→'sm/xs').

## 5) ✅ verify แล้ว vs ⏳ ยังต้องเก็บ
**verify กับ LINE simulator แล้ว:** card 1 (ask-evidence, header ฟอนต์จริง), card 2 (success — chip/kv/balance/recent/px ผ่านหมด), bigAmount 999,999 (ไม่ตกบรรทัด).
**⏳ ยังไม่ไล่ verify:** card 3-13 (topup/sunlight/parse-fail/balance/expired/duplicate/suspicious) — Gino บอก **"ยังมีบางจุดไม่เหมือน"** → ต้องไล่ทีละใบกับ simulator เทียบ mockup ยัน pixel (ระยะบรรทัด, ความสูง, space/stroke ปุ่ม, สี). โดยเฉพาะดู: header overlay ตำแหน่ง title/eyebrow แต่ละ pose (bg cammo แต่ละท่าเยื้องไม่เท่ากัน), evidence chip ไอคอน (mockup มีไอคอนใบเสร็จ ปัจจุบันไม่มี), stat boxes card 10, before→after card 8.

## 6) Cheat sheet
```
# dump JSON การ์ดใดๆ (ชี้ image ไป prod)
ASSET_BASE=https://cashguard-rho.vercel.app/cashguard npx tsx -e "import * as flex from './lib/flex.ts'; console.log(JSON.stringify(flex.flexXxx({...})))"
# regen bg headers
node gen-headers.mjs
# preview การ์ดในเครื่อง (renderer โดยประมาณ ไม่เท่า LINE)
ASSET_BASE=https://cashguard-rho.vercel.app/cashguard npm run dev  → /flexpreview
# build gate
npx tsc --noEmit && SUPABASE_URL=x SUPABASE_SERVICE_ROLE_KEY=x LINE_CHANNEL_ACCESS_TOKEN=x LINE_CHANNEL_SECRET=x npx next build
# deploy = push main (Gino authorize commit/push ได้); PR merge ตัวเองโดนบล็อก (ต้อง Gino หรือ user สั่งชัด)
```
Supabase/Vercel ใช้ MCP เอง (อย่าให้ Gino รัน SQL/curl). Supabase project_id=`uwniugxetyikjzkobifp`. ห้ามใส่ `#` ใน zsh.

## 7) Decisions ที่ล็อกแล้ว (อย่ารื้อ)
- reuse v1 + patch (ไม่ rebuild) · @tag ทุกครั้ง · ไม่มีปุ่มยืนยัน (หลักฐานมา=บันทึก) · เจ้าของแก้ของตัวเองได้ทุกเมื่อ (ไม่มี 24ชม/lock/approval — ตัดหน้า w4/w10 ของดีไซน์ web) · ลงรายการผ่าน LINE / แก้ผ่าน web · slip=Slip2Go · 1 สาขา 1 กลุ่ม · multi-photo แบบ A (text ไม่ใช่การ์ดใหม่) · header ฟอนต์จริง+Cammo bg image

## 8) เหลือฝั่ง Gino (นอกจาก fidelity)
เชิญ Cammo เข้ากลุ่ม sn/cw/bn → ส่ง group id (ผูก `branches.line_group_id` ผ่าน Supabase MCP) · ใส่ env เพิ่มถ้าจะเปิด: `SLIP2GO_API_KEY`(reuse POS), `OCR_API_KEY`, `NEXT_PUBLIC_LIFF_ID`+`LIFF_EDIT_URL` (สร้าง LIFF app endpoint `/edit`) · `LINE_BOT_USER_ID` ไม่จำเป็น (ใช้ destination แล้ว)
