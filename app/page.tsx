export default function Home() {
  return (<main style={{ padding: 40 }}>
    <h1 style={{ fontWeight: 700 }}>CashGuard</h1>
    <p style={{ color: '#6e6e73' }}>ระบบเงินสดย่อยผ่าน LINE · Webhook พร้อมที่ <code>/api/line/webhook</code></p>
    <p><a href="/dashboard">เปิด Dashboard →</a></p>
  </main>);
}
