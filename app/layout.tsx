export const metadata = { title: 'CashGuard', description: 'Petty cash via LINE' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="th"><body style={{ fontFamily: '-apple-system, "Sukhumvit Set", system-ui, sans-serif', margin: 0, background: '#f2f2f7' }}>{children}</body></html>);
}
