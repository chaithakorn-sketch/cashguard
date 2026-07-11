// Flex Message builders — CashGuard "3b" design system (final, by Claude Design).
// Red solid header (#DA1B27), white pill (logo + Carcamstore) top-left, big system
// font title, Cammo mascot on the right, white body. Typed builders — swap the
// visual freely, but keep the postback `action=` strings (the webhook reads them).
//
// Assets are hosted under ASSET_BASE/cammo/ (mascots + red logo).
const AB = process.env.ASSET_BASE || '';
const mc = (n: string) => `${AB}/cammo/${n}.png`;
const LOGO = `${AB}/cammo/logo-carcam-red.png`;

// palette
const RED = '#DA1B27', INK = '#17171a', GRAY = '#8a8a93', MUTE = '#a6a6ad',
      VAL = '#26262b', GREEN = '#149a5c', HAIR = '#efeff1', PANEL = '#f6f7f9';

// money: 2 decimals + thousands sep. signMoney prefixes −/+ and colours.
const money = (n: number) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baht = (n: number) => money(n) + ' ฿';

// ---- header ----
// Images are included only when ASSET_BASE is set — an unhosted (relative) image
// URL makes LINE reject the whole Flex message, so we degrade to text-only instead.
function pill() {
  const logo = AB ? [{ type:'image', url:LOGO, size:'16px', aspectMode:'fit', flex:0 }] : [];
  return { type:'box', layout:'horizontal', contents:[
    { type:'box', layout:'horizontal', flex:0, backgroundColor:'#FFFFFF', cornerRadius:'20px',
      paddingTop:'4px', paddingBottom:'4px', paddingStart:'8px', paddingEnd:'11px', spacing:'xs', alignItems:'center',
      contents:[
        ...logo,
        { type:'text', text:'Carcamstore', color:RED, weight:'bold', size:'xs', gravity:'center', flex:0 },
      ]},
    { type:'filler' },
  ]};
}
function header(eyebrow: string, title: string, mascot: string) {
  const mascotImg = AB ? [{ type:'image', url:mc(mascot), size:'96px', aspectMode:'fit', flex:0, gravity:'bottom', align:'end' }] : [];
  return { type:'box', layout:'vertical', backgroundColor:RED, paddingAll:'16px', spacing:'md',
    contents:[
      pill(),
      { type:'box', layout:'horizontal', contents:[
        { type:'box', layout:'vertical', flex:1, spacing:'none', justifyContent:'flex-end', contents:[
          { type:'text', text:eyebrow, color:'#FFFFFFCC', size:'xs', weight:'bold' },
          { type:'text', text:title, color:'#FFFFFF', weight:'bold', size:'xxl', wrap:true },
        ]},
        ...mascotImg,
      ]},
    ]};
}

// ---- body primitives ----
const SEP = { type:'separator', margin:'lg', color:HAIR };
const captionRow = (t: string) => ({ type:'text', text:t, size:'xs', color:MUTE, weight:'bold', wrap:true });
// big amount, sign-coloured. kind: 'out' (−red) | 'in' (+green) | 'neutral' (ink)
function amount(value: number, kind: 'out' | 'in' | 'neutral') {
  const sign = kind === 'out' ? '−' : kind === 'in' ? '+' : '';
  const color = kind === 'out' ? RED : kind === 'in' ? GREEN : INK;
  return { type:'text', margin:'xs', color, weight:'bold', size:'3xl', wrap:false,
    text:`${sign}${money(value)} ฿` };
}
function kv(label: string, value: string, strong = true) {
  return { type:'box', layout:'horizontal', margin:'md', contents:[
    { type:'text', text:label, size:'sm', color:GRAY, flex:0, gravity:'center' },
    { type:'text', text:value, size:'sm', color:strong?VAL:GRAY, weight:strong?'bold':'regular', align:'end', gravity:'center', wrap:true },
  ]};
}
function balanceRow(label: string, value: string | number, color = INK) {
  return { type:'box', layout:'horizontal', margin:'lg', alignItems:'center',
    contents:[
      { type:'text', text:label, size:'sm', color:GRAY, flex:1, gravity:'center' },
      { type:'text', text:baht(Number(value)), size:'xl', weight:'bold', color, align:'end', gravity:'center' },
    ]};
}
// evidence chip — green (has receipt) or amber (none)
function evidenceChip(has: boolean) {
  if (has) return { type:'box', layout:'horizontal', margin:'md', backgroundColor:PANEL, cornerRadius:'11px',
    paddingAll:'11px', alignItems:'center', spacing:'sm', contents:[
      { type:'text', text:'แนบหลักฐานแล้ว', size:'sm', color:'#5c5c66', weight:'bold', flex:1, gravity:'center' },
      { type:'text', text:'มีหลักฐาน', size:'xs', color:GREEN, weight:'bold', align:'end', gravity:'center', flex:0 },
    ]};
  return { type:'box', layout:'horizontal', margin:'md', backgroundColor:'#fff8ec', borderColor:'#f4e2bd', borderWidth:'1px',
    cornerRadius:'11px', paddingAll:'11px', alignItems:'center', spacing:'sm', contents:[
      { type:'text', text:'บันทึกโดยไม่มีหลักฐาน', size:'sm', color:'#7a5a12', weight:'bold', gravity:'center' },
    ]};
}
function recentList(title: string, items: { label: string; amount: number }[], kind: 'out' | 'in') {
  const rows = (items || []).slice(0, 3).map(r => ({ type:'box', layout:'horizontal', paddingTop:'6px', paddingBottom:'6px', contents:[
    { type:'text', text:r.label, size:'xs', color:'#5c5c66', flex:1, gravity:'center', wrap:false },
    { type:'text', text:`${kind==='out'?'−':'+'}${money(r.amount)}`, size:'xs', color:kind==='out'?RED:GREEN, weight:'bold', align:'end', gravity:'center', flex:0 },
  ]}));
  return { type:'box', layout:'vertical', margin:'lg', contents:[
    { type:'text', text:title, size:'xxs', color:'#c2c2c8', weight:'bold' },
    ...rows,
  ]};
}
// ---- buttons ----
const act = (a: { data?: string; uri?: string }, label: string) =>
  a.uri ? { type:'uri', label, uri:a.uri } : { type:'postback', label, data:a.data!, displayText:label };
const primaryBtn = (label: string, a: { data?: string; uri?: string }, color = INK) =>
  ({ type:'button', style:'primary', color, height:'sm', action:act(a, label) });
const outlineBtn = (label: string, a: { data?: string; uri?: string }) =>
  ({ type:'box', layout:'vertical', flex:1, backgroundColor:'#FFFFFF', borderColor:INK, borderWidth:'2px', cornerRadius:'12px',
     contents:[{ type:'button', style:'link', color:INK, height:'sm', action:act(a, label) }] });
const ghostBtn = (label: string, a: { data?: string; uri?: string }) =>
  ({ type:'box', layout:'vertical', flex:1, backgroundColor:'#f1f1f3', cornerRadius:'12px',
     contents:[{ type:'button', style:'link', color:GRAY, height:'sm', action:act(a, label) }] });
const btnRow = (b: any[]) => ({ type:'box', layout:'horizontal', spacing:'sm', margin:'lg', contents:b });
const bodyBox = (contents: any[]) => ({ type:'box', layout:'vertical', paddingAll:'20px', contents });
const bubble = (h: any, b: any, f?: any) => { const o: any = { type:'bubble', size:'mega', header:h, body:b }; if (f) o.footer = f; return o; };
const editFooter = (url?: string, id?: string) => ({ type:'box', layout:'vertical', paddingStart:'20px', paddingEnd:'20px', paddingBottom:'18px',
  contents:[ url ? primaryBtn('แก้ไขข้อมูล', { uri:url }) : outlineBtn('ยกเลิก / แก้ไข', { data:`action=void&id=${id}` }) ] });

// ==================================================================== BUILDERS
// CARD 1 — ขอหลักฐาน (expense)
export function flexAskEvidence(e:{id:string, amount:number, category:string}) {
  return bubble(header('รายจ่าย','ขอหลักฐาน','cammo-welcome'),
    bodyBox([
      captionRow(e.category || 'ค่าใช้จ่าย'),
      amount(e.amount, 'neutral'),
      SEP,
      { type:'text', margin:'lg', size:'sm', color:'#5c5c66', wrap:true, text:'ส่งรูปใบเสร็จเพื่อบันทึกได้เลยครับ (ไม่ต้องกดปุ่ม)' },
      btnRow([ outlineBtn('ไม่มีหลักฐาน', { data:`action=no_evidence&id=${e.id}` }), ghostBtn('ยกเลิก', { data:`action=retake&id=${e.id}` }) ]),
    ]));
}
// CARD 2 & 3 — บันทึกสำเร็จ (evidence flag switches the chip)
export function flexExpenseSuccess(e:{id:string, amount:number, vendor:string, category:string, payer:string, branch:string, balance:number, when:string, evidence?:string, recent?:{label:string,amount:number}[], editUrl?:string}) {
  return bubble(header('รายจ่าย','บันทึกสำเร็จ','cammo-thumbsup'),
    bodyBox([
      captionRow(`${e.category || 'ค่าใช้จ่าย'} · ${e.branch}`),
      amount(e.amount, 'out'),
      evidenceChip(e.evidence !== 'none'),
      kv('วันที่บันทึก', e.when),
      SEP,
      balanceRow('ยอดคงเหลือ', String(e.balance)),
      recentList('3 รายการล่าสุด', e.recent || [], 'out'),
    ]),
    editFooter(e.editUrl, e.id));
}
// CARD 4 — ขอสลิปโอนเงิน (top-up)
export function flexTopupAskSlip(e:{id:string, amount:number}) {
  return bubble(header('เติมเงิน','ขอสลิปโอนเงิน','cammo-welcome'),
    bodyBox([
      captionRow('ยอดเติมเงิน'),
      amount(e.amount, 'neutral'),
      SEP,
      { type:'text', margin:'lg', size:'sm', color:'#5c5c66', wrap:true, text:'ส่งรูปสลิปโอนเงินเพื่อยืนยันการเติม (ส่งรูปได้เลย ไม่ต้องกดปุ่ม)' },
      btnRow([ outlineBtn('แนบภายหลัง', { data:`action=no_evidence&id=${e.id}` }), ghostBtn('ยกเลิก', { data:`action=retake&id=${e.id}` }) ]),
    ]));
}
// CARD 5 — เติมเงินสำเร็จ
export function flexTopup(e:{id?:string, amount:number, payer:string, branch:string, balance:number, round:string, method?:string, recent?:{label:string,amount:number}[], editUrl?:string}) {
  return bubble(header('รายรับ','เติมเงินสำเร็จ','cammo-growth'),
    bodyBox([
      captionRow(`${e.method || 'โอนผ่านธนาคาร'} · ${e.payer}`),
      amount(e.amount, 'in'),
      kv('วันที่เติม', e.round),
      SEP,
      balanceRow('ยอดคงเหลือ', String(e.balance), GREEN),
      recentList('3 รายการเติมเงินล่าสุด', e.recent || [], 'in'),
    ]),
    editFooter(e.editUrl, e.id));
}
// CARD 6 — Sunlight: แจ้งค่าใช้จ่ายใหม่
export function flexSunlightExpense(e:{id:string, amount:number, category:string, who:string, branch:string, when:string, evidence?:string, branchBalance:number}) {
  return bubble(header('แจ้งเข้ากลุ่ม','ค่าใช้จ่ายใหม่','cammo-checklist'),
    bodyBox([
      captionRow(`${e.category || 'ค่าใช้จ่าย'} · บันทึกโดย ${e.who}`),
      amount(e.amount, 'out'),
      kv('สาขา', e.branch),
      kv('เวลา', e.when),
      evidenceChip(e.evidence !== 'none'),
      SEP,
      balanceRow('ยอดคงเหลือสาขา', String(e.branchBalance)),
      btnRow([ outlineBtn('ดูรายละเอียด', { data:`action=view&id=${e.id}` }) ]),
    ]));
}
// CARD 7 — Sunlight: แจ้งเติมเงินใหม่
export function flexSunlightTopup(e:{id:string, amount:number, who:string, branch:string, when:string, method?:string, branchBalance:number}) {
  return bubble(header('แจ้งเข้ากลุ่ม','เติมเงินใหม่','cammo-growth'),
    bodyBox([
      captionRow(`${e.method || 'โอนผ่านธนาคาร'} · เติมโดย ${e.who}`),
      amount(e.amount, 'in'),
      kv('สาขา', e.branch),
      kv('เวลา', e.when),
      SEP,
      balanceRow('ยอดคงเหลือสาขา', String(e.branchBalance), GREEN),
      btnRow([ outlineBtn('ดูรายละเอียด', { data:`action=view&id=${e.id}` }) ]),
    ]));
}
// CARD 8 — Sunlight: แจ้งการแก้ไข (ก่อน→หลัง)
export function flexEdited(e:{id?:string, who:string, item?:string, field:string, before:string, after:string, when?:string, balance?:number, editUrl?:string}) {
  return bubble(header('แจ้งเข้ากลุ่ม','มีการแก้ไข','cammo-growth'),
    bodyBox([
      captionRow(`${e.item || 'รายการ'} · แก้ไขโดย ${e.who}`),
      { type:'box', layout:'horizontal', margin:'lg', spacing:'md', alignItems:'flex-end', contents:[
        { type:'box', layout:'vertical', flex:0, contents:[
          { type:'text', text:'เดิม', size:'xs', color:MUTE, weight:'bold' },
          { type:'text', text:e.before, size:'lg', color:MUTE, decoration:'line-through', weight:'bold' } ]},
        { type:'text', text:'→', size:'lg', color:RED, weight:'bold', flex:0, gravity:'bottom' },
        { type:'box', layout:'vertical', flex:0, contents:[
          { type:'text', text:'ใหม่', size:'xs', color:RED, weight:'bold' },
          { type:'text', text:e.after, size:'xxl', color:RED, weight:'bold' } ]},
      ]},
      SEP,
      kv('ช่องที่แก้', e.field),
      ...(e.when ? [kv('เวลาที่แก้', e.when)] : []),
      { type:'text', margin:'md', size:'xs', color:MUTE, text:'แก้ไขผ่านเว็บแอป' },
      btnRow([ e.editUrl ? outlineBtn('ดูรายการ', { uri:e.editUrl }) : outlineBtn('ดูรายการ', { data:`action=view&id=${e.id}` }) ]),
    ]));
}
// CARD 9 — อ่านรายการไม่ได้ (parse fail)
export function flexParseFail() {
  const ex = (t: string) => ({ type:'box', layout:'vertical', backgroundColor:'#FFFFFF', borderColor:'#e7e7ea', borderWidth:'1px',
    cornerRadius:'9px', paddingAll:'10px', margin:'sm', contents:[{ type:'text', text:t, size:'sm', color:VAL, weight:'bold' }] });
  return bubble(header('ระบบ','อ่านรายการไม่ได้','cammo-warn'),
    bodyBox([
      { type:'text', size:'sm', color:'#5c5c66', wrap:true, text:'น้อง Cammo อ่านข้อความนี้ไม่ออกครับ ลองพิมพ์ใหม่ตามรูปแบบด้านล่าง' },
      { type:'box', layout:'vertical', margin:'lg', backgroundColor:PANEL, cornerRadius:'14px', paddingAll:'14px', contents:[
        { type:'text', text:'ตัวอย่างการพิมพ์', size:'xxs', color:MUTE, weight:'bold' },
        ex('ค่าน้ำมัน 100'), ex('ค่าอาหาร 250'), ex('เติมเงิน 5000'),
      ]},
      { type:'text', margin:'md', size:'xs', color:MUTE, wrap:true, text:'หรือส่งรูปใบเสร็จมาได้เลย เดี๋ยวน้องอ่านให้ครับ' },
    ]));
}
// CARD 10 — ยอดคงเหลือ (balance check)
export function flexBalance(e:{branch:string, balance:number, monthIn:number, monthOut:number}) {
  const stat = (label: string, value: string, bg: string, color: string) => ({ type:'box', layout:'vertical', flex:1, backgroundColor:bg, cornerRadius:'12px', paddingAll:'12px', contents:[
    { type:'text', text:label, size:'xs', color:GRAY, weight:'bold' },
    { type:'text', text:value, size:'lg', color, weight:'bold', margin:'xs' } ]});
  return bubble(header('กระเป๋าเงิน','ยอดคงเหลือ','cammo-checklist'),
    bodyBox([
      captionRow(`กระเป๋าเงิน${e.branch}`),
      amount(e.balance, 'neutral'),
      { type:'box', layout:'horizontal', margin:'lg', spacing:'sm', contents:[
        stat('รายรับเดือนนี้', `+${money(e.monthIn)}`, '#eefaf3', GREEN),
        stat('รายจ่ายเดือนนี้', `−${money(e.monthOut)}`, '#fbeced', RED),
      ]},
      btnRow([ primaryBtn('ดูรายการทั้งหมด', { data:'action=list' }) ]),
    ]));
}
// CARD 11 — รายการหมดอายุ (basket expired)
export function flexPendingEvidence(e:{id:string, amount:number, item:string, minsLeft?:number}) {
  return bubble(header('ระบบ','รายการหมดอายุ','cammo-wait'),
    bodyBox([
      captionRow(e.item || 'รายการ'),
      amount(e.amount, 'neutral'),
      SEP,
      { type:'text', margin:'lg', size:'sm', color:'#5c5c66', wrap:true, text:'รายการนี้ค้างนานเกินไปจึงหมดอายุ พิมพ์ยอดพร้อมแนบบิลใหม่เพื่อบันทึกอีกครั้งครับ' },
      btnRow([ primaryBtn('บันทึกใหม่', { data:`action=retake&id=${e.id}` }) ]),
    ]));
}
// CARD 12 — ตรวจพบรูปซ้ำ
export function flexRejectedDuplicate(e:{id:string, amount:number, prevDate:string, prevBy:string, prevItem:string}) {
  return bubble(header('ความปลอดภัย','ตรวจพบรูปซ้ำ','cammo-inspect'),
    bodyBox([
      captionRow('รูปนี้เคยถูกส่งแล้ว'),
      amount(e.amount, 'neutral'),
      kv('ส่งครั้งก่อน', `${e.prevDate}${e.prevBy && e.prevBy!=='-' ? ' · '+e.prevBy : ''}`),
      kv('รายการเดิม', e.prevItem),
      btnRow([ outlineBtn('ดูรายการเดิม', { data:`action=view&id=${e.id}` }), outlineBtn('ไม่ซ้ำ', { data:`action=second_installment&id=${e.id}` }) ]),
    ]));
}
// CARD 13 — สลิปน่าสงสัย (replaces generic flagged for slip cases)
export function flexSuspiciousSlip(e:{id:string, amount:number, item:string, reason:string, who?:string, balance?:number}) {
  return bubble(header('ความปลอดภัย','พบสลิปน่าสงสัย','cammo-inspect'),
    bodyBox([
      captionRow(`${e.item || 'รายการ'}${e.who ? ' · '+e.who : ''}`),
      amount(e.amount, 'neutral'),
      { type:'box', layout:'horizontal', margin:'md', backgroundColor:'#fff8ec', borderColor:'#f4e2bd', borderWidth:'1px', cornerRadius:'11px', paddingAll:'11px', contents:[
        { type:'text', text:e.reason, size:'sm', color:'#7a5a12', weight:'bold', wrap:true } ]},
      ...(e.balance != null ? [SEP, balanceRow('ยอดคงเหลือ', String(e.balance))] : []),
      btnRow([ outlineBtn('ดูรายละเอียด', { data:`action=view&id=${e.id}` }), primaryBtn('ยืนยันเอง', { data:`action=use_typed&id=${e.id}` }) ]),
    ]));
}

// ---------- kept / auxiliary builders (restyled to 3b) ----------
// Generic flagged card (non-slip flags: over cap, cross branch, off hours, etc.)
export function flexFlagged(e:{id:string, amount:number, item:string, reason:string, evidence:string, who:string, balance:number}) {
  return bubble(header('ตรวจสอบ','รอตรวจสอบ','cammo-inspect'),
    bodyBox([
      captionRow(`${e.item || 'รายการ'} · ${e.who}`),
      amount(e.amount, 'out'),
      { type:'box', layout:'horizontal', margin:'md', backgroundColor:'#fff8ec', borderColor:'#f4e2bd', borderWidth:'1px', cornerRadius:'11px', paddingAll:'11px', contents:[
        { type:'text', text:e.reason, size:'sm', color:'#7a5a12', weight:'bold', wrap:true } ]},
      kv('หลักฐาน', e.evidence),
      SEP,
      balanceRow('ยอดคงเหลือ', String(e.balance)),
    ]),
    editFooter(undefined, e.id));
}
// OCR-vs-typed mismatch
export function flexOcrMismatch(e:{id:string, typed:number, ocr:number}) {
  return bubble(header('ตรวจสอบ','ยอดไม่ตรงบิล','cammo-inspect'),
    bodyBox([
      captionRow('โปรดยืนยันยอดที่ถูกต้อง'),
      amount(e.typed, 'neutral'),
      kv('พิมพ์มา', baht(e.typed)),
      kv('OCR อ่านบิล', baht(e.ocr)),
      btnRow([ outlineBtn(`ใช้ ${baht(e.ocr)}`, { data:`action=use_ocr&id=${e.id}` }), primaryBtn(`ใช้ ${baht(e.typed)}`, { data:`action=use_typed&id=${e.id}` }) ]),
    ]));
}
// Low-balance alert
export function flexLowBalance(e:{empId:string, who:string, balance:number, owed:number}) {
  return bubble(header('แจ้งเตือน','เงินสดย่อยใกล้หมด','cammo-wait'),
    bodyBox([
      captionRow(e.who),
      amount(e.balance, 'neutral'),
      kv('สำรองจ่ายค้าง', baht(e.owed)),
      btnRow([ primaryBtn('เติมเงินด่วน', { data:`action=topup_urgent&emp=${e.empId}` }) ]),
    ]));
}
// Customer refund
export function flexCustomerRefund(e:{amount:number, reason:string, by:string, branch:string, balance:number}) {
  return bubble(header('คืนเงินลูกค้า','บันทึกคืนเงิน','cammo-checklist'),
    bodyBox([
      captionRow('ไม่นับเป็นต้นทุนร้าน'),
      amount(e.amount, 'out'),
      kv('เหตุผล', e.reason),
      kv('ผู้ทำรายการ', `${e.by} · ${e.branch}`),
      SEP,
      balanceRow('ยอดคงเหลือ', String(e.balance)),
    ]));
}
// Draft confirm (kept for compat; the new flow auto-saves so this is rarely shown)
export function flexDraftConfirm(e:{id:string, amount:number, vendor:string, category:string, ocrOk:boolean}) {
  return bubble(header('รายจ่าย','ยืนยันรายการ','cammo-thumbsup'),
    bodyBox([
      captionRow(e.category || 'ค่าใช้จ่าย'),
      amount(e.amount, 'out'),
      kv('ร้าน', e.vendor),
      kv('OCR ตรวจยอด', e.ocrOk ? 'ตรงกับบิล' : 'ตรวจไม่ได้'),
      btnRow([ primaryBtn('ยืนยัน', { data:`action=confirm&id=${e.id}` }), ghostBtn('ยกเลิก', { data:`action=retake&id=${e.id}` }) ]),
    ]));
}
export function flexTopupConfirm(e:{id:string, amount:number}) {
  return bubble(header('เติมเงิน','ยืนยันเติมเงิน','cammo-growth'),
    bodyBox([
      captionRow('ตรวจยอดก่อนบันทึก'),
      amount(e.amount, 'in'),
      btnRow([ primaryBtn('ยืนยัน', { data:`action=confirm&id=${e.id}` }), ghostBtn('ยกเลิก', { data:`action=retake&id=${e.id}` }) ]),
    ]));
}
// Daily summary (admin cron)
export function flexDailySummary(e:{date:string, spentToday:number, totalBalance:number, toReview:number, items:{kind:'warn'|'bad', title:string, sub:string, amount:number}[]}) {
  const kpi = (l:string,v:string,c=INK)=>({type:'box',layout:'vertical',backgroundColor:PANEL,cornerRadius:'10px',paddingAll:'10px',flex:1,contents:[
    {type:'text',text:l,size:'xxs',color:GRAY,weight:'bold'},{type:'text',text:v,size:'md',weight:'bold',color:c,margin:'xs'}]});
  const sumrow=(it:any)=>({type:'box',layout:'horizontal',margin:'md',spacing:'sm',alignItems:'center',contents:[
    {type:'box',width:'8px',height:'8px',cornerRadius:'4px',backgroundColor:it.kind==='bad'?RED:'#c9820a',flex:0,contents:[{type:'filler'}]},
    {type:'text',text:it.title,size:'sm',color:VAL,flex:0,gravity:'center'},
    {type:'text',text:it.sub,size:'xs',color:GRAY,flex:1,gravity:'center'},
    {type:'text',text:baht(it.amount),size:'sm',weight:'bold',color:it.kind==='bad'?RED:'#c9820a',align:'end',gravity:'center'}]});
  return bubble(header('สรุปประจำวัน','เงินสดย่อย','cammo-checklist'),
    bodyBox([
      captionRow(`${e.date} · 4 สาขา`),
      { type:'box', layout:'horizontal', margin:'lg', spacing:'sm', contents:[
        kpi('ใช้จ่ายวันนี้', baht(e.spentToday)), kpi('คงเหลือรวม', baht(e.totalBalance)), kpi('รอตรวจ', String(e.toReview), RED) ]},
      { type:'text', text:'รายการที่ต้องตรวจสอบ', size:'xs', color:GRAY, weight:'bold', margin:'lg' },
      ...e.items.map(sumrow),
    ]));
}

export const flexMessage = (altText: string, contents: any) => ({ type:'flex', altText, contents });
