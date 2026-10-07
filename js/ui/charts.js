/**
 * Hand-written inline-SVG charts (no external library). Every chart carries an aria-label
 * and the caller shows a plain-text summary underneath for screen readers.
 * @module ui/charts
 */
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const k of kids) if (k !== null && k !== undefined) el.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return el;
};

/** CSS variable colour for a status key. */
export const statusColor = (st) => `var(--st-${st || 'none'})`;

/**
 * Progress ring.
 * @param {number|null} value 0..1 @param {{size?:number, stroke?:number, label?:string, sub?:string, color?:string}} [opt]
 * @returns {HTMLElement}
 */
export function ring(value, opt = {}) {
  const size = opt.size || 140;
  const sw = opt.stroke || 12;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null || value === undefined ? 0 : Math.max(0, Math.min(1, value));
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${opt.sub || 'Progress'} ${Math.round(v * 100)} percent` },
    s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--border)', 'stroke-width': sw }),
    s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: opt.color || 'var(--primary)', 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  return h('div', { class: 'ring-wrap', style: { width: size + 'px', height: size + 'px', margin: '0 auto' } }, svg,
    h('div', { class: 'ring-label' }, h('div', null, h('strong', null, opt.label ?? (value === null ? '—' : Math.round(v * 100) + '%')), h('span', null, opt.sub || ''))));
}

/**
 * Line chart over 0..yMax with optional second series.
 * @param {Array<{series:number[], color?:string, dashed?:boolean, name:string}>} lines
 * @param {{height?:number, yMax?:number, labels?:string[], ariaLabel?:string}} [opt]
 * @returns {SVGElement}
 */
export function lineChart(lines, opt = {}) {
  const W = 320;
  const H = opt.height || 150;
  const pad = { l: 28, r: 8, t: 10, b: 20 };
  const yMax = opt.yMax ?? 100;
  const n = Math.max(2, ...lines.map((l) => l.series.length));
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / (n - 1);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - Math.max(0, Math.min(yMax, v)) / yMax);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opt.ariaLabel || 'Line chart' });
  for (const g of [0, 25, 50, 75, 100]) {
    const yy = y((g / 100) * yMax);
    svg.appendChild(s('line', { x1: pad.l, x2: W - pad.r, y1: yy, y2: yy, class: 'axis', 'stroke-width': 1 }));
    svg.appendChild(s('text', { x: pad.l - 4, y: yy + 3, 'text-anchor': 'end', 'font-size': 8 }, String(Math.round((g / 100) * yMax))));
  }
  for (const l of lines) {
    if (!l.series.length) continue;
    const pts = l.series.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    svg.appendChild(s('polyline', { points: pts, fill: 'none', stroke: l.color || 'var(--primary)', 'stroke-width': l.dashed ? 1.5 : 2.5, 'stroke-dasharray': l.dashed ? '4 3' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    if (!l.dashed && l.series.length <= 40) l.series.forEach((v, i) => svg.appendChild(s('circle', { cx: x(i), cy: y(v), r: 2.5, fill: l.color || 'var(--primary)' })));
  }
  if (opt.labels && opt.labels.length) {
    const first = opt.labels[0];
    const last = opt.labels[opt.labels.length - 1];
    svg.appendChild(s('text', { x: pad.l, y: H - 4, 'font-size': 8 }, first));
    svg.appendChild(s('text', { x: W - pad.r, y: H - 4, 'font-size': 8, 'text-anchor': 'end' }, last));
  }
  return svg;
}

/**
 * Radar chart.
 * @param {Array<{label:string, value:number|null}>} axes values 0..1
 * @param {{size?:number}} [opt]
 * @returns {SVGElement}
 */
export function radar(axes, opt = {}) {
  const size = opt.size || 260;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 42;
  const n = axes.length;
  const pt = (i, r) => [cx + r * Math.sin((2 * Math.PI * i) / n), cy - r * Math.cos((2 * Math.PI * i) / n)];
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': 'Skill radar: ' + axes.map((a) => `${a.label} ${a.value === null ? 'no data' : Math.round(a.value * 100) + '%'}`).join(', ') });
  for (const f of [0.25, 0.5, 0.75, 1]) {
    svg.appendChild(s('polygon', { points: axes.map((_, i) => pt(i, R * f).join(',')).join(' '), fill: 'none', class: 'axis', 'stroke-width': 1 }));
  }
  axes.forEach((a, i) => {
    const [x2, y2] = pt(i, R);
    svg.appendChild(s('line', { x1: cx, y1: cy, x2, y2, class: 'axis', 'stroke-width': 1 }));
    const [lx, ly] = pt(i, R + 22);
    svg.appendChild(s('text', { x: lx, y: ly + 4, 'text-anchor': 'middle', 'font-size': 10 }, a.label));
  });
  const poly = axes.map((a, i) => pt(i, R * (a.value ?? 0)).join(',')).join(' ');
  svg.appendChild(s('polygon', { points: poly, fill: 'color-mix(in srgb, var(--primary) 25%, transparent)', stroke: 'var(--primary)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  return svg;
}

/**
 * Study-time heatmap (GitHub-style, weeks as columns).
 * @param {Object<string,number>} minutesByDay 'YYYY-MM-DD' → minutes
 * @param {number} [days=112]
 * @returns {HTMLElement}
 */
export function heatmap(minutesByDay, days = 112) {
  const wrap = h('div', { class: 'heatmap', role: 'img', 'aria-label': 'Study time over the last 16 weeks' });
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - days + 1);
  start.setDate(start.getDate() - start.getDay());
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    const m = minutesByDay[key] || 0;
    const lvl = m === 0 ? '' : m < 10 ? 'l1' : m < 25 ? 'l2' : m < 45 ? 'l3' : 'l4';
    wrap.appendChild(h('i', { class: lvl, title: `${key}: ${Math.round(m)} min` }));
  }
  return wrap;
}

/**
 * Forgetting curve with "now" marker.
 * @param {Array<{t:number,s:number}>} pts @param {number} nowDays
 * @returns {SVGElement}
 */
export function forgettingCurve(pts, nowDays) {
  const W = 300;
  const H = 110;
  const maxT = pts[pts.length - 1].t || 1;
  const x = (t) => 24 + ((W - 32) * t) / maxT;
  const y = (v) => 8 + (H - 28) * (1 - v);
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Forgetting curve' },
    s('line', { x1: 24, x2: W - 8, y1: y(0), y2: y(0), class: 'axis' }),
    s('line', { x1: 24, x2: W - 8, y1: y(0.5), y2: y(0.5), class: 'axis', 'stroke-dasharray': '3 3' }),
    s('text', { x: 20, y: y(1) + 4, 'text-anchor': 'end', 'font-size': 8 }, '100%'),
    s('text', { x: 20, y: y(0.5) + 3, 'text-anchor': 'end', 'font-size': 8 }, '50%'),
    s('polyline', { points: pts.map((p) => `${x(p.t)},${y(p.s)}`).join(' '), fill: 'none', stroke: 'var(--primary)', 'stroke-width': 2.5 }),
    s('text', { x: W - 8, y: H - 4, 'text-anchor': 'end', 'font-size': 8 }, `${Math.round(maxT)} days`));
  if (nowDays >= 0 && nowDays <= maxT) {
    svg.appendChild(s('line', { x1: x(nowDays), x2: x(nowDays), y1: y(1), y2: y(0), stroke: 'var(--danger)', 'stroke-width': 2 }));
    svg.appendChild(s('text', { x: x(nowDays) + 3, y: y(1) + 8, 'font-size': 8, fill: 'var(--danger)' }, 'now'));
  }
  return svg;
}

/**
 * Horizontal range bar for a credible interval.
 * @param {number} lo @param {number} med @param {number} hi values in 0..100
 * @returns {SVGElement}
 */
export function rangeBar(lo, med, hi) {
  const W = 300;
  const x = (v) => 10 + ((W - 20) * Math.max(0, Math.min(100, v))) / 100;
  return s('svg', { class: 'chart', viewBox: `0 0 ${W} 46`, role: 'img', 'aria-label': `Predicted ${Math.round(med)} percent, 80 percent interval ${Math.round(lo)} to ${Math.round(hi)}` },
    s('line', { x1: 10, x2: W - 10, y1: 20, y2: 20, stroke: 'var(--border)', 'stroke-width': 8, 'stroke-linecap': 'round' }),
    s('line', { x1: x(lo), x2: x(hi), y1: 20, y2: 20, stroke: 'color-mix(in srgb, var(--primary) 45%, transparent)', 'stroke-width': 8, 'stroke-linecap': 'round' }),
    s('circle', { cx: x(med), cy: 20, r: 8, fill: 'var(--primary)' }),
    s('text', { x: 10, y: 44, 'font-size': 9 }, '0'),
    s('text', { x: W - 10, y: 44, 'font-size': 9, 'text-anchor': 'end' }, '100%'),
    s('text', { x: x(med), y: 44, 'font-size': 10, 'text-anchor': 'middle', fill: 'var(--primary)' }, Math.round(med) + '%'));
}

/**
 * Layered layout + SVG for a small DAG (knowledge graph per subject).
 * @param {Array<{id:string,label:string,status:string,size:number,ghost?:boolean,root?:boolean,title:string}>} nodes
 * @param {Array<{from:string,to:string,hot?:boolean}>} edges
 * @param {(id:string)=>void} onTap
 * @returns {SVGElement}
 */
export function dagGraph(nodes, edges, onTap) {
  const ids = new Set(nodes.map((n) => n.id));
  const es = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const level = new Map(nodes.map((n) => [n.id, 0]));
  for (let it = 0; it < nodes.length; it++) {
    let changed = false;
    for (const e of es) {
      if (level.get(e.to) < level.get(e.from) + 1) { level.set(e.to, level.get(e.from) + 1); changed = true; }
    }
    if (!changed) break;
  }
  const byLevel = new Map();
  for (const n of nodes) {
    const l = level.get(n.id);
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l).push(n);
  }
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const colW = 92;
  const rowH = 70;
  const maxRows = Math.max(...[...byLevel.values()].map((a) => a.length));
  const W = Math.max(560, levels.length * colW + 60);
  const H = Math.max(220, maxRows * rowH + 40);
  const pos = new Map();
  levels.forEach((l, li) => {
    const arr = byLevel.get(l);
    arr.forEach((n, i) => pos.set(n.id, [40 + li * ((W - 80) / Math.max(1, levels.length - 1 || 1)), (H / (arr.length + 1)) * (i + 1)]));
  });
  if (levels.length === 1) for (const n of nodes) pos.set(n.id, [W / 2, pos.get(n.id)[1]]);
  const svg = s('svg', { class: 'chart kg', viewBox: `0 0 ${W} ${H}`, width: W, role: 'group', 'aria-label': 'Knowledge graph' });
  svg.appendChild(s('defs', {}, s('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 22, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, s('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--text-muted)' }))));
  for (const e of es) {
    const [x1, y1] = pos.get(e.from);
    const [x2, y2] = pos.get(e.to);
    const mx = (x1 + x2) / 2;
    svg.appendChild(s('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: 'edge' + (e.hot ? ' hot' : ''), 'marker-end': 'url(#arrow)' }));
  }
  for (const n of nodes) {
    const [x, y] = pos.get(n.id);
    const r = 12 + 10 * Math.max(0, Math.min(1, n.size));
    const g = s('g', { class: 'node' + (n.ghost ? ' ghost' : '') + (n.root ? ' root' : ''), tabindex: 0, role: 'button', 'aria-label': n.title, transform: `translate(${x},${y})` },
      s('title', {}, n.title),
      s('circle', { r, fill: statusColor(n.status) }),
      s('text', { y: r + 13, 'text-anchor': 'middle' }, n.label));
    g.addEventListener('click', () => onTap(n.id));
    g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onTap(n.id); } });
    svg.appendChild(g);
  }
  return svg;
}
