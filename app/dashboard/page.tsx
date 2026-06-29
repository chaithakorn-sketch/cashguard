import { sb } from '@/lib/supabase';
export const dynamic = 'force-dynamic';

const baht = (n:number)=>'฿'+Number(n).toLocaleString('en-US');

export default async function Dashboard() {
  const { data: balances } = await sb.from('employee_balances').select('*');
  const { data: flagged } = await sb.from('entries')
    .select('id,amount,vendor,description,submitted_at,flags(kind,detail)')
    .eq('status','flagged').order('submitted_at',{ascending:false}).limit(50);

  const total = (balances ?? []).reduce((s:number,r:any)=>s+Number(r.balance),0);

  return (<main style={{ padding: 28, maxWidth: 880, margin: '0 auto' }}>
    <h1 style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>CashGuard · Dashboard</h1>

    <section style={{ display:'flex', gap:12, margin:'20px 0' }}>
      <Card label="เงินคงเหลือในมือรวม" value={baht(total)} />
      <Card label="รายการรอตรวจ" value={String((flagged ?? []).length)} color="#FF3B30" />
      <Card label="พนักงาน" value={String((balances ?? []).length)} />
    </section>

    <h2 style={{ fontSize:18, fontWeight:700 }}>รายการที่ต้องตรวจสอบ</h2>
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e5e7', overflow:'hidden' }}>
      {(flagged ?? []).map((e:any)=>(
        <div key={e.id} style={{ display:'flex', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #f1f1f3' }}>
          <span>{e.vendor ?? e.description ?? '-'} <small style={{ color:'#8e8e93' }}>· {e.flags?.[0]?.detail}</small></span>
          <b style={{ fontFamily:'ui-monospace' }}>{baht(e.amount)}</b>
        </div>
      ))}
      {!(flagged ?? []).length && <div style={{ padding:'16px', color:'#8e8e93' }}>ไม่มีรายการรอตรวจ</div>}
    </div>

    <h2 style={{ fontSize:18, fontWeight:700, marginTop:28 }}>ยอดคงเหลือรายคน</h2>
    <div style={{ background:'#fff', borderRadius:14, border:'1px solid #e5e5e7', overflow:'hidden' }}>
      {(balances ?? []).map((r:any)=>(
        <div key={r.employee_id} style={{ display:'flex', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #f1f1f3' }}>
          <span>{r.nickname ?? r.name}</span>
          <b style={{ fontFamily:'ui-monospace', color: Number(r.balance)<0 ? '#FF3B30':'#1c1c1e' }}>{baht(r.balance)}</b>
        </div>
      ))}
    </div>
  </main>);
}

function Card({ label, value, color='#1c1c1e' }:{label:string;value:string;color?:string}) {
  return (<div style={{ flex:1, background:'#fff', border:'1px solid #e5e5e7', borderRadius:14, padding:'14px 16px' }}>
    <div style={{ fontSize:12, color:'#8e8e93' }}>{label}</div>
    <div style={{ fontSize:24, fontWeight:700, color, marginTop:4, fontFamily:'ui-monospace' }}>{value}</div>
  </div>);
}
