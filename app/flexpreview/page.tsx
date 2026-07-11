import * as flex from '@/lib/flex';
import Renderer from './Renderer';

export const dynamic = 'force-dynamic';

// DEV-ONLY preview of every Flex card with sample data, for design comparison.
export default function FlexPreview() {
  const recent = [{ label: 'ค่าน้ำมัน · 11 ก.ค.', amount: 100 }, { label: 'ค่าอาหารทีมงาน · 11 ก.ค.', amount: 250 }, { label: 'ค่าทางด่วน · 10 ก.ค.', amount: 60 }];
  const recentIn = [{ label: 'โอนผ่านธนาคาร · 11 ก.ค.', amount: 5000 }, { label: 'เงินสด · 9 ก.ค.', amount: 2000 }];
  const cards = [
    { name: '1 ขอหลักฐาน', node: flex.flexAskEvidence({ id: 'x', amount: 100, category: 'ค่าน้ำมัน' }) },
    { name: '2 บันทึกสำเร็จ (มีบิล)', node: flex.flexExpenseSuccess({ id: 'x', amount: 100, vendor: '-', category: 'ค่าน้ำมัน', payer: 'คุณเอ', branch: 'สุขุมวิท', balance: 12340, when: '11 ก.ค. 2569', evidence: 'receipt', recent, editUrl: 'https://x' }) },
    { name: '3 บันทึกสำเร็จ (ไม่มีบิล)', node: flex.flexExpenseSuccess({ id: 'x', amount: 100, vendor: '-', category: 'ค่าน้ำมัน', payer: 'คุณเอ', branch: 'สุขุมวิท', balance: 12340, when: '11 ก.ค. 2569', evidence: 'none', recent, editUrl: 'https://x' }) },
    { name: '4 ขอสลิป', node: flex.flexTopupAskSlip({ id: 'x', amount: 5000 }) },
    { name: '5 เติมเงินสำเร็จ', node: flex.flexTopup({ amount: 5000, payer: 'คุณจิโน่', branch: 'สุขุมวิท', balance: 17340, round: '11 ก.ค.', recent: recentIn, editUrl: 'https://x' }) },
    { name: '6 แจ้งค่าใช้จ่าย (กลุ่ม)', node: flex.flexSunlightExpense({ id: 'x', amount: 100, category: 'ค่าน้ำมัน', who: 'คุณเอ', branch: 'สุขุมวิท', when: '11 ก.ค. · 14:32', evidence: 'receipt', branchBalance: 12340 }) },
    { name: '7 แจ้งเติมเงิน (กลุ่ม)', node: flex.flexSunlightTopup({ id: 'x', amount: 5000, who: 'คุณจิโน่', branch: 'สุขุมวิท', when: '11 ก.ค. · 09:10', branchBalance: 17340 }) },
    { name: '8 แจ้งแก้ไข (กลุ่ม)', node: flex.flexEdited({ who: 'คุณเอ', item: 'ค่าน้ำมัน', field: 'จำนวนเงิน', before: '100.00', after: '150.00', when: '11 ก.ค. · 15:04' }) },
    { name: '9 อ่านไม่ออก', node: flex.flexParseFail() },
    { name: '10 เช็คยอด', node: flex.flexBalance({ branch: 'สุขุมวิท', balance: 12340, monthIn: 10000, monthOut: 7660 }) },
    { name: '11 หมดอายุ', node: flex.flexPendingEvidence({ id: 'x', amount: 100, item: 'ค่าน้ำมัน' }) },
    { name: '12 รูปซ้ำ', node: flex.flexRejectedDuplicate({ id: 'x', amount: 100, prevDate: '10 ก.ค.', prevBy: 'คุณเอ', prevItem: 'ค่าน้ำมัน' }) },
    { name: '13 สลิปน่าสงสัย', node: flex.flexSuspiciousSlip({ id: 'x', amount: 5000, item: 'เติมเงิน', reason: 'สลิปเสีย/สลิปปลอม', who: 'คุณเอ', balance: 17340 }) },
  ];
  return <Renderer cards={cards} />;
}
