'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

// CashGuard LIFF web app — edit only (per design "CashGuard Web App").
// Opened from the Flex "แก้ไขข้อมูล" button: liff.line.me/<id>?entry=<uuid>.
// Identity comes from LINE (LIFF access token). Owner edits their own entry any
// time (per decision); someone else's entry -> read-only (w8). No 24h lock.

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';
declare global { interface Window { liff: any } }

// ---- palette (3b) ----
const RED = '#DA1B27', INK = '#17171a', GRAY = '#8a8a93', MUTE = '#a2a2ab',
      BG = '#f4f5f7', GREEN = '#1f7a46', BLUE = '#2A6FDB', AMBER = '#B26A00';

const money = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDate = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
// ISO <-> <input type="datetime-local"> (local time, no seconds)
const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Phase = 'loading' | 'list' | 'edit' | 'success' | 'notfound' | 'forbidden' | 'uploadfail' | 'config';
interface Entry { id: string; type: string; status: string; amount: number; category?: string; vendor?: string; description?: string; evidence_type?: string; spent_at?: string; submitted_at: string; payer_id?: string }
interface Receipt { id: string; url: string | null; slip_status?: string }

export default function EditApp() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<{ id: string; nickname?: string; name?: string; branch_id?: string } | null>(null);
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<'all' | 'expense' | 'topup'>('all');
  const [entry, setEntry] = useState<Entry | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [amount, setAmount] = useState('');
  const [spentAt, setSpentAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const tokenRef = useRef<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const authFetch = useCallback(async (path: string, opts: RequestInit = {}) => {
    const headers: any = { ...(opts.headers || {}) };
    if (tokenRef.current) headers.Authorization = `Bearer ${tokenRef.current}`;
    return fetch(path, { ...opts, headers });
  }, []);

  const openEntry = useCallback(async (id: string) => {
    setPhase('loading');
    const res = await authFetch(`/api/entries/${id}`);
    if (res.status === 404) return setPhase('notfound');
    if (res.status === 403) return setPhase('forbidden');
    if (!res.ok) return setPhase('notfound');
    const { entry, receipts } = await res.json();
    setEntry(entry); setReceipts(receipts || []);
    setAmount(String(entry.amount ?? '')); setSpentAt(toLocalInput(entry.spent_at || entry.submitted_at));
    setPhase('edit');
  }, [authFetch]);

  const loadList = useCallback(async () => {
    setPhase('loading');
    const res = await authFetch('/api/entries?limit=100');
    if (!res.ok) return setPhase('notfound');
    const data = await res.json();
    setBalance(data.balance ?? 0); setEntries(data.entries || []);
    setPhase('list');
  }, [authFetch]);

  // boot: load LIFF, verify, route by ?entry=
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!LIFF_ID) return setPhase('config');
      try {
        await loadLiffSdk();
        await window.liff.init({ liffId: LIFF_ID });
        if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
        tokenRef.current = window.liff.getAccessToken() || '';
      } catch (e) { console.error('liff init', e); return setPhase('config'); }
      if (cancelled) return;
      const v = await authFetch('/api/liff/verify', { method: 'POST' });
      if (!v.ok) return setPhase('forbidden');
      const { employee, balance } = await v.json();
      setMe(employee); setBalance(balance ?? 0);
      const id = new URLSearchParams(window.location.search).get('entry');
      if (id) await openEntry(id); else await loadList();
    })();
    return () => { cancelled = true; };
  }, [authFetch, openEntry, loadList]);

  const isTopup = entry?.type === 'topup';
  const origAmount = Number(entry?.amount ?? 0);
  const newAmount = Number(amount || 0);
  // live balance-after: expense reduces balance, topup increases it
  const balanceAfter = isTopup ? balance + (newAmount - origAmount) : balance + (origAmount - newAmount);

  async function save() {
    if (!entry) return;
    setSaving(true);
    try {
      const body: any = {};
      if (newAmount !== origAmount) body.amount = newAmount;
      const iso = new Date(spentAt).toISOString();
      if (iso !== new Date(entry.spent_at || entry.submitted_at).toISOString()) body.spent_at = iso;
      if (Object.keys(body).length) {
        const res = await authFetch(`/api/entries/${entry.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.status === 403) { setPhase('forbidden'); return; }
        if (!res.ok) { setPhase('notfound'); return; }
      }
      setSuccessMsg(`อัปเดต${entry.category || (isTopup ? 'เติมเงิน' : 'รายการ')}เป็น ${money(newAmount)} ฿ เรียบร้อย`);
      setPhase('success');
    } finally { setSaving(false); }
  }

  async function uploadPhoto(file: File, replaceId?: string) {
    if (!entry) return;
    const fd = new FormData();
    fd.append('file', file); fd.append('entry_id', entry.id);
    const res = await authFetch('/api/upload', { method: 'POST', body: fd });
    if (!res.ok) { setPhase('uploadfail'); return; }
    if (replaceId) await authFetch(`/api/upload?receipt_id=${replaceId}`, { method: 'DELETE' });
    await openEntry(entry.id);
  }
  async function deletePhoto(id: string) {
    await authFetch(`/api/upload?receipt_id=${id}`, { method: 'DELETE' });
    if (entry) await openEntry(entry.id);
  }
  const backToLine = () => { try { window.liff?.closeWindow(); } catch {} };

  // ============================================================= RENDER
  if (phase === 'loading') return <Loading />;
  if (phase === 'config') return <ErrorScreen title="ยังไม่ได้ตั้งค่า LIFF" msg="ผู้ดูแลระบบยังไม่ได้ตั้งค่า LIFF ID — เปิดจากการ์ดใน LINE อีกครั้งหลังตั้งค่าเสร็จ" primary={{ label: 'ปิด', onClick: backToLine }} />;
  if (phase === 'notfound') return <ErrorScreen title="ไม่พบรายการนี้" msg="รายการอาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง ลองเปิดจากการ์ดใน LINE อีกครั้ง" primary={{ label: 'ดูรายการของฉัน', onClick: loadList }} secondary={{ label: 'กลับไปที่ LINE', onClick: backToLine }} />;
  if (phase === 'forbidden') return <ErrorScreen title="ไม่มีสิทธิ์แก้ไข" msg="รายการนี้เป็นของพนักงานคนอื่น แก้ไขได้เฉพาะรายการของตัวเองเท่านั้น" primary={{ label: 'ดูรายการของฉัน', onClick: loadList }} secondary={{ label: 'กลับไปที่ LINE', onClick: backToLine }} />;
  if (phase === 'uploadfail') return <ErrorScreen title="อัปโหลดรูปไม่สำเร็จ" msg="การเชื่อมต่อขัดข้อง หรือไฟล์ใหญ่เกิน 10MB — ข้อมูลอื่นยังไม่ถูกบันทึก" primary={{ label: 'ลองใหม่อีกครั้ง', onClick: () => entry && openEntry(entry.id) }} secondary={{ label: 'ข้ามรูปไปก่อน', onClick: () => setPhase('edit') }} />;
  if (phase === 'success') return <Success msg={successMsg} onLine={backToLine} onList={loadList} />;
  if (phase === 'list') return <ListView me={me} balance={balance} entries={entries} filter={filter} setFilter={setFilter} onOpen={openEntry} onClose={backToLine} />;

  // edit
  return (
    <Shell>
      <TopBar title={isTopup ? 'แก้ไขเติมเงิน' : 'แก้ไขค่าใช้จ่าย'} onBack={loadList} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#E9F7EF', border: '1px solid #c9ecd7', borderRadius: 12, padding: '11px 13px' }}>
          <Ico.Clock /><div style={{ fontSize: 12.5, fontWeight: 600, color: GREEN, lineHeight: 1.35 }}>แก้ไขได้<div style={{ fontSize: 11, fontWeight: 500, color: '#4f9d72' }}>แก้ของตัวเองได้ทุกเมื่อ</div></div>
        </div>

        {!isTopup && (
          <Field label="หมวด">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#eef0f2', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: '#FBE9EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Ico.Cam s={RED} /></div>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: '#3a3a42' }}>{entry?.category || 'อื่นๆ'}</span>
              <span style={{ marginLeft: 'auto' }}><Ico.Lock /></span>
            </div>
          </Field>
        )}

        <Field label={isTopup ? 'ยอดเติม' : 'ยอดเงิน'} editable>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: `1.6px solid ${RED}`, borderRadius: 12, padding: '10px 16px', boxShadow: '0 0 0 3px rgba(218,27,39,.08)' }}>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal"
              style={{ border: 'none', outline: 'none', fontSize: 30, fontWeight: 800, color: INK, letterSpacing: '-.02em', width: '100%', background: 'transparent' }} />
            <span style={{ fontSize: 22, color: GRAY, fontWeight: 600 }}>฿</span>
          </div>
        </Field>

        <Field label="วันที่" editable>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', border: '1.6px solid #e3e4e8', borderRadius: 12, padding: '11px 15px' }}>
            <Ico.Cal />
            <input type="datetime-local" value={spentAt} onChange={e => setSpentAt(e.target.value)}
              style={{ border: 'none', outline: 'none', fontSize: 14.5, fontWeight: 600, color: INK, background: 'transparent', width: '100%' }} />
          </div>
        </Field>

        <PhotoField isTopup={isTopup} receipts={receipts} onPick={() => fileRef.current?.click()} onDelete={deletePhoto} />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f, receipts[0]?.id); e.currentTarget.value = ''; }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px dashed #cdd4de', borderRadius: 12, padding: '13px 15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ico.Wallet /><span style={{ fontSize: 12.5, fontWeight: 600, color: '#5c5c66' }}>{isTopup ? 'ยอดกระเป๋าหลังเติม' : 'ยอดคงเหลือหลังแก้ไข'}</span></div>
          <span style={{ fontSize: 15, fontWeight: 800, color: INK }}>{money(balanceAfter)}<span style={{ fontSize: 11, color: MUTE, fontWeight: 600 }}> ฿</span></span>
        </div>
        <div style={{ fontSize: 11.5, color: MUTE, padding: '0 2px 6px' }}>ลงโดย {me?.nickname || me?.name || '-'}</div>
      </div>

      <div style={{ flex: 'none', background: '#fff', borderTop: '1px solid #ececf0', padding: '12px 16px 22px', display: 'flex', gap: 11 }}>
        <button onClick={loadList} style={btn.cancel}>ยกเลิก</button>
        <button onClick={save} disabled={saving} style={{ ...btn.save, opacity: saving ? .6 : 1 }}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
      </div>
    </Shell>
  );
}

// ======================================================= sub-components
function Shell({ children }: { children: any }) {
  return <div style={{ minHeight: '100vh', background: BG, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',Arial,sans-serif" }}>{children}</div>;
}
function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div style={{ flex: 'none', background: '#fff', borderBottom: '1px solid #ececf0', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', position: 'sticky', top: 0, zIndex: 5 }}>
      <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: '50%', background: '#f0f1f4', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ico.Back /></button>
      <div style={{ fontSize: 16, fontWeight: 700, color: INK }}>{title}</div>
      <div style={{ width: 34 }} />
    </div>
  );
}
function Field({ label, editable, children }: { label: string; editable?: boolean; children: any }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: editable ? RED : GRAY, marginBottom: 6 }}>
        {label}{editable && <span style={{ fontSize: 9.5, fontWeight: 700, color: RED, background: '#FBE9EA', padding: '1.5px 7px', borderRadius: 6, marginLeft: 5, verticalAlign: 'middle' }}>แก้ไขได้</span>}
      </div>
      {children}
    </div>
  );
}
function PhotoField({ isTopup, receipts, onPick, onDelete }: { isTopup: boolean; receipts: Receipt[]; onPick: () => void; onDelete: (id: string) => void }) {
  const has = receipts.length > 0;
  const label = isTopup ? 'สลิปโอนเงิน' : 'รูปหลักฐาน';
  if (has) {
    const r = receipts[0];
    return (
      <Field label={label}>
        <div style={{ display: 'flex', gap: 11 }}>
          <div style={{ width: 74, height: 96, borderRadius: 12, background: '#eceef1', flex: 'none', overflow: 'hidden', border: '1px solid #e0e1e5' }}>
            {r.url ? <img src={r.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={onPick} style={btn.photoChange}><Ico.Cam s="#3a3a42" /> {isTopup ? 'เปลี่ยนสลิป' : 'เปลี่ยนรูป'}</button>
            <button onClick={() => onDelete(r.id)} style={btn.photoDel}><Ico.Trash /> ลบรูป</button>
          </div>
        </div>
      </Field>
    );
  }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF7EA', border: '1px solid #f3dfb6', borderRadius: 11, padding: '10px 12px', marginBottom: 9 }}>
        <Ico.Warn /><span style={{ fontSize: 11.5, fontWeight: 600, color: '#8a6410', lineHeight: 1.35 }}>ยังไม่มีหลักฐาน — แนบเพื่อให้รายการสมบูรณ์</span>
      </div>
      <button onClick={onPick} style={{ width: '100%', background: '#fff', border: `1.5px dashed ${RED}`, borderRadius: 14, padding: '22px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FBE9EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico.Cam s={RED} big /></div>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: RED }}>แตะเพื่อแนบหลักฐาน</div>
        <div style={{ fontSize: 11, color: MUTE, fontWeight: 600 }}>ถ่ายรูป หรือเลือกจากคลัง · .jpg .png สูงสุด 10MB</div>
      </button>
    </Field>
  );
}

function ListView({ me, balance, entries, filter, setFilter, onOpen, onClose }: any) {
  const shown = entries.filter((e: Entry) => filter === 'all' ? true : e.type === filter);
  const chipTabs: [string, 'all' | 'expense' | 'topup'][] = [['ทั้งหมด', 'all'], ['ค่าใช้จ่าย', 'expense'], ['เติมเงิน', 'topup']];
  return (
    <Shell>
      <div style={{ flex: 'none', background: '#fff', padding: '14px 14px 12px', position: 'sticky', top: 0, zIndex: 5 }}>
        <div style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 14, fontWeight: 800, color: RED }}>Carcamstore</span></div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: '#f0f1f4', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Ico.Close /></button>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-.02em', marginTop: 6 }}>รายการของฉัน</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg,#5b6472,#39414d)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(me?.nickname || me?.name || '?').slice(0, 1)}</div>
          <div style={{ fontSize: 12.5, color: '#5c5c66' }}>{me?.nickname || me?.name} · <span style={{ color: GRAY }}>คงเหลือ {money(balance)} ฿</span></div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {chipTabs.map(([label, key]) => (
            <button key={key} onClick={() => setFilter(key)} style={{ fontSize: 12.5, fontWeight: filter === key ? 700 : 600, color: filter === key ? '#fff' : '#5c5c66', background: filter === key ? RED : '#f0f1f4', padding: '7px 15px', borderRadius: 999, border: 'none', cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '48px 40px' }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: '#fff', boxShadow: '0 8px 24px rgba(23,23,30,.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}><Ico.Doc /></div>
            <div style={{ fontSize: 19, fontWeight: 800, color: INK, marginBottom: 8 }}>ยังไม่มีรายการ</div>
            <div style={{ fontSize: 13.5, color: GRAY, lineHeight: 1.5 }}>เมื่อมีการบันทึกค่าใช้จ่ายหรือเติมเงิน<br />รายการของคุณจะแสดงที่นี่</div>
          </div>
        ) : shown.map((e: Entry) => <Row key={e.id} e={e} onOpen={() => onOpen(e.id)} />)}
      </div>
    </Shell>
  );
}
function Row({ e, onOpen }: { e: Entry; onOpen: () => void }) {
  const topup = e.type === 'topup';
  const hasEv = e.evidence_type && e.evidence_type !== 'none';
  return (
    <button onClick={onOpen} style={{ background: '#fff', border: 'none', textAlign: 'left', borderRadius: 16, padding: 14, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(23,23,30,.05)', cursor: 'pointer', width: '100%' }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: topup ? '#E9F2FB' : '#FBE9EA', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{topup ? <Ico.Up /> : <Ico.Cam s={RED} />}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topup ? 'เติมเงินเข้ากระเป๋า' : (e.category || e.vendor || 'ค่าใช้จ่าย')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
          <span style={{ fontSize: 11, color: GRAY }}>{thaiDate(e.submitted_at).split(' · ')[1] || thaiDate(e.submitted_at)}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: hasEv ? GREEN : AMBER, background: hasEv ? '#E9F7EF' : '#FFF3DF', padding: '2px 7px', borderRadius: 6 }}>{hasEv ? (topup ? 'มีสลิป' : 'มีหลักฐาน') : 'ไม่มีหลักฐาน'}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flex: 'none' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: topup ? BLUE : INK }}>{topup ? '+' : ''}{money(e.amount)}</div>
      </div>
    </button>
  );
}

function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: RED, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, fontFamily: "-apple-system,BlinkMacSystemFont,sans-serif" }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#fff', padding: '7px 16px', borderRadius: 999, marginBottom: 40, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: RED }}>Carcamstore</span>
      </div>
      <div style={{ width: 34, height: 34, borderRadius: '50%', border: '3.5px solid rgba(255,255,255,.28)', borderTopColor: '#fff', animation: 'cgspin .9s linear infinite', marginBottom: 22 }} />
      <div style={{ fontSize: 19, fontWeight: 800, color: '#fff' }}>กำลังเข้าสู่ระบบ…</div>
      <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,.82)', marginTop: 6, lineHeight: 1.5 }}>ยืนยันตัวตนผ่าน LINE อัตโนมัติ</div>
      <style>{`@keyframes cgspin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
function Success({ msg, onLine, onList }: { msg: string; onLine: () => void; onList: () => void }) {
  // Auto-return to LINE after a beat (design w6: "กำลังกลับสู่ LINE…").
  useEffect(() => { const t = setTimeout(onLine, 2400); return () => clearTimeout(t); }, [onLine]);
  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#E9F7EF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: INK, marginBottom: 10 }}>บันทึกสำเร็จ</div>
        <div style={{ fontSize: 14, color: '#5c5c66', lineHeight: 1.5, marginBottom: 4 }}>{msg}</div>
        <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.5 }}>ระบบแจ้งกลุ่มแบบ ก่อน → หลัง อัตโนมัติ</div>
        <div style={{ fontSize: 12.5, color: MUTE, marginTop: 18, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #d7d7dd', borderTopColor: GRAY, display: 'inline-block', animation: 'cgspin .9s linear infinite' }} />
          กำลังกลับสู่ LINE…
        </div>
      </div>
      <div style={{ flex: 'none', padding: '12px 16px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={onLine} style={{ ...btn.save, flex: 'unset' }}>กลับไปที่ LINE ตอนนี้</button>
        <button onClick={onList} style={{ ...btn.cancel, flex: 'unset' }}>ดูรายการของฉัน</button>
      </div>
      <style>{`@keyframes cgspin{to{transform:rotate(360deg)}}`}</style>
    </Shell>
  );
}
function ErrorScreen({ title, msg, primary, secondary }: { title: string; msg: string; primary: { label: string; onClick: () => void }; secondary?: { label: string; onClick: () => void } }) {
  return (
    <Shell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '40px 32px' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: '#f0f1f4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={GRAY} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
        </div>
        <div style={{ fontSize: 21, fontWeight: 800, color: INK, marginBottom: 10 }}>{title}</div>
        <div style={{ fontSize: 14, color: '#5c5c66', lineHeight: 1.5 }}>{msg}</div>
      </div>
      <div style={{ flex: 'none', padding: '12px 16px 26px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={primary.onClick} style={{ ...btn.save, flex: 'unset' }}>{primary.label}</button>
        {secondary && <button onClick={secondary.onClick} style={{ ...btn.cancel, flex: 'unset' }}>{secondary.label}</button>}
      </div>
    </Shell>
  );
}

// ---- inline icons ----
const Ico = {
  Back: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5c5c66" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>,
  Close: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5c5c66" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>,
  Lock: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#b0b0b8" strokeWidth="2.2" strokeLinecap="round"><path d="M6 11h12v9H6z" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>,
  Cal: () => <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#5c5c66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2.5" /><path d="M4 9h16M8 3v4M16 3v4" /></svg>,
  Wallet: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18M16 14h2.5" /></svg>,
  Clock: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1f9d57" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 1.5" /></svg>,
  Warn: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4l9 15H3z" /><path d="M12 10v4M12 17.5h.01" /></svg>,
  Trash: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12" /></svg>,
  Cam: ({ s, big }: { s: string; big?: boolean }) => <svg width={big ? 24 : 17} height={big ? 24 : 17} viewBox="0 0 24 24" fill="none" stroke={s} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></svg>,
  Up: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7-7 7 7" /></svg>,
  Doc: () => <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#c6c6cd" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2.5" /><path d="M8 8h8M8 12h8M8 16h4" /></svg>,
};

const btn: Record<string, React.CSSProperties> = {
  cancel: { flex: 1, border: '1.5px solid #e3e4e8', background: '#fff', borderRadius: 13, padding: 15, fontSize: 15, fontWeight: 700, color: '#5c5c66', cursor: 'pointer' },
  save: { flex: 1.6, border: 'none', background: RED, borderRadius: 13, padding: 15, fontSize: 15, fontWeight: 800, color: '#fff', cursor: 'pointer', boxShadow: '0 6px 16px rgba(218,27,39,.32)' },
  photoChange: { border: '1.5px solid #e3e4e8', background: '#fff', borderRadius: 11, padding: 11, fontSize: 13, fontWeight: 700, color: '#3a3a42', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' },
  photoDel: { border: '1.5px solid #f2d4d6', background: '#fff', borderRadius: 11, padding: 11, fontSize: 13, fontWeight: 700, color: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, cursor: 'pointer' },
};

// load the LIFF SDK once
function loadLiffSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.liff) return resolve();
    const s = document.createElement('script');
    s.src = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('liff sdk load failed'));
    document.head.appendChild(s);
  });
}
