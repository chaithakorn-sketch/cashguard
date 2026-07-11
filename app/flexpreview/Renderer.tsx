'use client';
// DEV-ONLY approximate LINE Flex → HTML renderer, for comparing cards against the
// design mockup without shipping to LINE each time. Metrics approximate LINE's.
import React from 'react';

const TXT: Record<string, number> = { xxs: 11, xs: 12.5, sm: 14, md: 16, lg: 19, xl: 22, xxl: 27, '3xl': 32, '4xl': 36, '5xl': 40 };
const SP: Record<string, number> = { none: 0, xs: 2, sm: 6, md: 10, lg: 14, xl: 18, xxl: 22 };
const RAD: Record<string, number> = { none: 0, xs: 2, sm: 4, md: 8, lg: 12, xl: 16, xxl: 20 };

const px = (v: any, map: Record<string, number> = SP): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.endsWith('px')) return parseFloat(v);
  return map[v] ?? 0;
};
const alignSelf = (g?: string) => g === 'bottom' ? 'flex-end' : g === 'top' ? 'flex-start' : g === 'center' ? 'center' : undefined;

function Node({ n }: { n: any }): any {
  if (!n) return null;
  if (n.type === 'filler') return <div style={{ flex: 1 }} />;
  if (n.type === 'separator') return <div style={{ height: 1, background: n.color || '#eee', marginTop: px(n.margin) }} />;

  if (n.type === 'text') {
    const st: React.CSSProperties = {
      fontSize: TXT[n.size] || 14, color: n.color || '#000', fontWeight: n.weight === 'bold' ? 700 : 400,
      textAlign: n.align || (n.wrap ? 'left' : undefined) as any, whiteSpace: (n.wrap && n.adjustMode !== 'shrink-to-fit') ? 'normal' : 'nowrap',
      textDecoration: n.decoration || 'none', lineHeight: 1.15, marginTop: px(n.margin),
      flexGrow: n.flex ?? 0, flexShrink: n.wrap ? 1 : 0, alignSelf: alignSelf(n.gravity),
      overflow: 'hidden', textOverflow: 'ellipsis',
    };
    if (n.contents) return <div style={st}>{n.contents.map((s: any, i: number) => <span key={i} style={{ fontSize: TXT[s.size] || undefined, color: s.color, fontWeight: s.weight === 'bold' ? 700 : undefined }}>{s.text}</span>)}</div>;
    return <div style={st}>{n.text}</div>;
  }

  if (n.type === 'image') {
    const w = px(n.size, TXT) || (typeof n.size === 'string' && n.size.endsWith('px') ? parseFloat(n.size) : 40);
    const st: React.CSSProperties = {
      width: w, height: 'auto', objectFit: n.aspectMode === 'cover' ? 'cover' : 'contain',
      alignSelf: n.align === 'end' ? 'flex-end' : alignSelf(n.gravity), flexShrink: 0,
      position: n.position === 'absolute' ? 'absolute' : undefined,
      top: n.offsetTop != null ? px(n.offsetTop) : undefined, right: n.offsetEnd != null ? px(n.offsetEnd) : undefined,
      bottom: n.offsetBottom != null ? px(n.offsetBottom) : undefined, left: n.offsetStart != null ? px(n.offsetStart) : undefined,
    };
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={n.url} alt="" style={st} />;
  }

  if (n.type === 'button') {
    const primary = n.style === 'primary';
    return <button style={{
      width: '100%', border: 'none', borderRadius: 8, padding: '9px 12px', cursor: 'pointer',
      background: primary ? (n.color || '#000') : 'transparent', color: primary ? '#fff' : (n.color || '#000'),
      fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
    }}>{n.action?.label}</button>;
  }

  if (n.type === 'box') {
    const pad = n.paddingAll != null
      ? px(n.paddingAll)
      : undefined;
    const st: React.CSSProperties = {
      display: 'flex', flexDirection: n.layout === 'horizontal' ? 'row' : 'column',
      gap: px(n.spacing), background: n.backgroundColor, borderRadius: px(n.cornerRadius, RAD),
      border: n.borderWidth ? `${px(n.borderWidth)}px solid ${n.borderColor || '#000'}` : undefined,
      alignItems: n.alignItems === 'flex-end' ? 'flex-end' : n.alignItems === 'flex-start' ? 'flex-start' : n.alignItems,
      justifyContent: n.justifyContent, flexGrow: n.flex ?? 0, flexShrink: 1, marginTop: px(n.margin),
      position: n.position === 'absolute' ? 'absolute' : 'relative',
      top: n.offsetTop != null ? px(n.offsetTop) : undefined, right: n.offsetEnd != null ? px(n.offsetEnd) : undefined,
      bottom: n.offsetBottom != null ? px(n.offsetBottom) : undefined, left: n.offsetStart != null ? px(n.offsetStart) : undefined,
      minWidth: 0,
    };
    if (pad != null) st.padding = pad;
    else {
      st.paddingTop = px(n.paddingTop); st.paddingBottom = px(n.paddingBottom);
      st.paddingLeft = px(n.paddingStart); st.paddingRight = px(n.paddingEnd);
    }
    return <div style={st}>{(n.contents || []).map((c: any, i: number) => <Node key={i} n={c} />)}</div>;
  }
  return null;
}

function Bubble({ b }: { b: any }) {
  return (
    <div style={{ width: 300, borderRadius: 8, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,.15)', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif" }}>
      {b.header && <Node n={b.header} />}
      {b.body && <Node n={b.body} />}
      {b.footer && <Node n={b.footer} />}
    </div>
  );
}

export default function Renderer({ cards }: { cards: { name: string; node: any }[] }) {
  return (
    <div style={{ background: '#8faadc', minHeight: '100vh', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
      {cards.map((c, i) => (
        <div key={i}>
          <div style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{c.name}</div>
          <Bubble b={c.node.contents || c.node} />
        </div>
      ))}
    </div>
  );
}
