// Flex Message builders — port of the approved CashGuard v3 design.
// Solid Apple colors, logo top-right (icon only), line icons, native iOS font (LINE renders system font).
const AB = process.env.ASSET_BASE || '';
const LOGO = `${AB}/logo_white.png`;
const iw = (n: string) => `${AB}/icons/${n}_white.png`;
const ig = (n: string) => `${AB}/icons/${n}_gray.png`;

const C = { blue:'#007AFF', green:'#34C759', orange:'#FF9500', red:'#FF3B30', graphite:'#1C1C1E' };
const GRAY='#8E8E93', VAL='#48484A', OK='#34C759', WARN='#FF9500', BAD='#FF3B30';

const baht = (n: number) => '฿' + n.toLocaleString('en-US');

function header(color: string, icon: string, status: string, amount?: string, sub?: string) {
  const contents: any[] = [{
    type:'box', layout:'horizontal', alignItems:'center',
    contents:[
      { type:'box', layout:'horizontal', flex:1, spacing:'sm', alignItems:'center', contents:[
        { type:'image', url:iw(icon), width:'20px', aspectMode:'fit', flex:0 },
        { type:'text', text:status, color:'#FFFFFF', weight:'bold', size:'sm', gravity:'center', wrap:false }
      ]},
      { type:'image', url:LOGO, width:'26px', aspectMode:'fit', flex:0 }
    ]
  }];
  if (amount) contents.push({ type:'text', text:amount, color:'#FFFFFF', weight:'bold', size:'3xl', margin:'sm' });
  if (sub)    contents.push({ type:'text', text:sub, color:'#FFFFFFCC', size:'xs', margin:'xs' });
  return { type:'box', layout:'vertical', backgroundColor:color,
    paddingTop:'18px', paddingBottom:'18px', paddingStart:'20px', paddingEnd:'20px', contents };
}
function row(icon: string, label: string, value: string, vcolor=VAL) {
  return { type:'box', layout:'horizontal', alignItems:'center', margin:'md', contents:[
    { type:'box', layout:'horizontal', flex:1, spacing:'sm', alignItems:'center', contents:[
      { type:'image', url:ig(icon), width:'16px', aspectMode:'fit', flex:0 },
      { type:'text', text:label, size:'sm', color:GRAY, gravity:'center', wrap:false }
    ]},
    { type:'text', text:value, size:'sm', weight:'bold', color:vcolor, align:'end', gravity:'center', wrap:false }
  ]};
}
const SEP = { type:'separator', margin:'md', color:'#ECECF0' };
function balance(label: string, value: string, vcolor=VAL) {
  return { type:'box', layout:'horizontal', backgroundColor:'#F5F5F7', cornerRadius:'10px',
    paddingAll:'12px', margin:'lg', alignItems:'center', contents:[
    { type:'box', layout:'horizontal', flex:1, spacing:'sm', alignItems:'center', contents:[
      { type:'image', url:ig('wallet'), width:'16px', aspectMode:'fit', flex:0 },
      { type:'text', text:label, size:'xs', color:GRAY, gravity:'center' }
    ]},
    { type:'text', text:value, size:'lg', weight:'bold', color:vcolor, align:'end', gravity:'center' }
  ]};
}
function body(rows: any[], extra?: any) {
  const c: any[] = [];
  rows.forEach((r,i)=>{ c.push(r); if(i<rows.length-1) c.push(SEP); });
  if (extra) c.push(extra);
  return { type:'box', layout:'vertical', paddingAll:'16px', contents:c };
}
const pbtn = (label:string,color:string,data:string)=>({ type:'button', style:'primary', color, height:'sm',
  action:{ type:'postback', label, data, displayText:label }});
const sbtn = (label:string,data:string)=>({ type:'button', style:'secondary', height:'sm',
  action:{ type:'postback', label, data, displayText:label }});
const btnRow = (b:any[])=>({ type:'box', layout:'horizontal', spacing:'sm', margin:'lg', contents:b });
const bubble = (h:any,b:any)=>({ type:'bubble', size:'mega', header:h, body:b });

// ---- public builders ----
export function flexDraftConfirm(e:{id:string, amount:number, vendor:string, category:string, ocrOk:boolean}) {
  return bubble(
    header(C.blue,'doc','ยืนยันรายการนี้?', baht(e.amount), 'ตรวจสอบก่อนบันทึก'),
    body([
      row('store','ร้าน', e.vendor),
      row('tag','หมวด (AI เดา)', e.category),
      row('check','OCR ตรวจยอด', e.ocrOk ? 'ตรงกับบิล' : 'ตรวจไม่ได้', e.ocrOk ? OK : WARN),
    ], btnRow([
      pbtn('ยืนยัน', C.blue, `action=confirm&id=${e.id}`),
      sbtn('เพิ่มรูป', `action=add_photo&id=${e.id}`),
      sbtn('แยก', `action=split&id=${e.id}`),
    ]))
  );
}
export function flexExpenseSuccess(e:{amount:number, vendor:string, category:string, payer:string, branch:string, balance:number, when:string}) {
  return bubble(
    header(C.green,'check','บันทึกค่าใช้จ่ายแล้ว', baht(e.amount), e.when),
    body([
      row('store','ร้าน', e.vendor),
      row('tag','หมวด', e.category),
      row('user','ผู้จ่าย', `${e.payer} · ${e.branch}`),
    ], balance('เงินคงเหลือในมือ', baht(e.balance)))
  );
}
export function flexTopup(e:{amount:number, payer:string, branch:string, balance:number, round:string}) {
  return bubble(
    header(C.green,'in','เติมเงินสดย่อยแล้ว', baht(e.amount), 'โอนโดยฝ่ายบัญชี'),
    body([ row('user','ผู้รับ', `${e.payer} · ${e.branch}`), row('clock','รอบเติม', e.round) ],
      balance('เงินคงเหลือใหม่', baht(e.balance), OK))
  );
}
export function flexCustomerRefund(e:{amount:number, reason:string, by:string, branch:string, balance:number}) {
  return bubble(
    header(C.blue,'refund','บันทึกคืนเงินลูกค้า', baht(e.amount), 'ไม่นับเป็นต้นทุนร้าน'),
    body([ row('doc','เหตุผล', e.reason), row('user','ผู้ทำรายการ', `${e.by} · ${e.branch}`) ],
      balance('เงินคงเหลือในมือ', baht(e.balance)))
  );
}
export function flexFlagged(e:{amount:number, item:string, reason:string, evidence:string, who:string, balance:number}) {
  return bubble(
    header(C.orange,'warn','บันทึกแล้ว · รอตรวจสอบ', baht(e.amount), 'ส่งให้ผู้บริหารดูแล้ว'),
    body([
      row('out','รายการ', e.item),
      row('warn','เหตุผล', e.reason, WARN),
      row('doc','หลักฐาน', e.evidence, WARN),
    ], balance(`เงินคงเหลือ ${e.who}`, baht(e.balance)))
  );
}
export function flexRejectedDuplicate(e:{id:string, amount:number, prevDate:string, prevBy:string, prevItem:string}) {
  return bubble(
    header(C.red,'x','ตรวจพบรูปบิลซ้ำ', baht(e.amount), 'ยังไม่บันทึกรายการ'),
    body([
      row('doc','รูปนี้เคยส่ง', `${e.prevDate} · ${e.prevBy}`),
      row('clock','รายการเดิม', e.prevItem),
    ], btnRow([
      pbtn('จ่ายงวด 2', C.blue, `action=second_installment&id=${e.id}`),
      sbtn('ถ่ายใหม่', `action=retake&id=${e.id}`),
    ]))
  );
}
export function flexPendingEvidence(e:{id:string, amount:number, item:string, minsLeft:number}) {
  return bubble(
    header(C.orange,'clock','รอแนบบิล', baht(e.amount), 'ยังไม่บันทึกจนกว่าจะมีบิล'),
    body([
      row('store','รายการ', e.item),
      row('clock','หมดเวลาใน', `${e.minsLeft} นาที`, WARN),
    ], btnRow([ pbtn('แนบบิลตอนนี้', C.orange, `action=attach_now&id=${e.id}`) ]))
  );
}
export function flexOcrMismatch(e:{id:string, typed:number, ocr:number}) {
  return bubble(
    header(C.orange,'warn','ยอดที่พิมพ์ไม่ตรงบิล', baht(e.typed), 'โปรดยืนยันยอดที่ถูกต้อง'),
    body([
      row('user','พิมพ์มา', baht(e.typed)),
      row('doc','OCR อ่านบิล', baht(e.ocr), BAD),
    ], btnRow([
      pbtn(`ใช้ ${baht(e.ocr)}`, C.orange, `action=use_ocr&id=${e.id}`),
      sbtn(`ใช้ ${baht(e.typed)}`, `action=use_typed&id=${e.id}`),
    ]))
  );
}
export function flexLowBalance(e:{empId:string, who:string, balance:number, owed:number}) {
  return bubble(
    header(C.red,'bell','เงินสดย่อยใกล้หมด', baht(e.balance), 'ควรเติมก่อนถึงรอบ'),
    body([
      row('user','พนักงาน', e.who),
      row('out','สำรองจ่ายค้าง', baht(e.owed), BAD),
    ], btnRow([ pbtn('เติมเงินด่วน', C.blue, `action=topup_urgent&emp=${e.empId}`) ]))
  );
}
export function flexDailySummary(e:{date:string, spentToday:number, totalBalance:number, toReview:number, items:{kind:'warn'|'bad', title:string, sub:string, amount:number}[]}) {
  const kpi=(l:string,v:string,c='#1C1C1E')=>({type:'box',layout:'vertical',backgroundColor:'#F5F5F7',cornerRadius:'10px',paddingAll:'10px',flex:1,contents:[
    {type:'text',text:l,size:'xxs',color:GRAY},{type:'text',text:v,size:'lg',weight:'bold',color:c,margin:'xs'}]});
  const sumrow=(it:any)=>({type:'box',layout:'horizontal',alignItems:'center',margin:'md',spacing:'sm',contents:[
    {type:'box',width:'8px',height:'8px',cornerRadius:'4px',backgroundColor:it.kind==='bad'?BAD:WARN,flex:0,contents:[]},
    {type:'box',layout:'horizontal',flex:1,spacing:'xs',contents:[
      {type:'text',text:it.title,size:'sm',color:VAL,flex:0,gravity:'center'},
      {type:'text',text:it.sub,size:'xs',color:GRAY,flex:1,gravity:'center'}]},
    {type:'text',text:baht(it.amount),size:'sm',weight:'bold',color:it.kind==='bad'?BAD:WARN,align:'end',gravity:'center'}]});
  const rows:any[]=[];
  e.items.forEach((it,i)=>{ rows.push(sumrow(it)); if(i<e.items.length-1) rows.push(SEP); });
  return bubble(
    header(C.graphite,'chart','สรุปเงินสดย่อย · วันนี้', undefined, e.date + ' · 4 สาขา'),
    { type:'box', layout:'vertical', paddingAll:'16px', contents:[
      { type:'box', layout:'horizontal', spacing:'sm', contents:[
        kpi('ใช้จ่ายวันนี้', baht(e.spentToday)),
        kpi('คงเหลือรวม', baht(e.totalBalance)),
        kpi('รอตรวจ', String(e.toReview), BAD) ]},
      { type:'text', text:'รายการที่ต้องตรวจสอบ', size:'xs', color:GRAY, weight:'bold', margin:'lg' },
      ...rows
    ]}
  );
}
