// ============================================================
//  Ketto Demand Monthly — Shared Library
// ============================================================

// ---------- Supabase Config ----------
const SUPABASE_URL = 'https://jjvuilxjkjxhkuhpmlgs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqdnVpbHhqa2p4aGt1aHBtbGdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MDE2NTEsImV4cCI6MjA5NTQ3NzY1MX0.amIQrVRGxwuR3yFCRpD0EBx9UF_wAQnb9Ql_wcOQCdM';

// ---------- Constants ----------
const CAT_KEYS = {pm:'pm', pnm:'pnm', nm:'nm', nnm:'nnm'};
const CAT_LABELS = {pm:'Personal Medical', pnm:'Personal Non-Medical', nm:'NGO Medical', nnm:'NGO Non-Medical'};
const CAT_COLORS = {pm:'#1D4ED8', pnm:'#0E7490', nm:'#6D28D9', nnm:'#15803D'};
const DEEP_LINKS = {pm:'monthly_pm_deep.html', pnm:'monthly_pnm_deep.html', nm:'monthly_nm_deep.html', nnm:'monthly_nnm_deep.html'};

// ---------- Date formatting ----------
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function weekLabel(dateStr) {
  // '2026-05-01' -> "May '26"
  const d = new Date(dateStr + 'T00:00:00');
  return MONTHS[d.getMonth()] + " '" + String(d.getFullYear()).slice(2);
}
function weekLabelLong(dateStr) {
  // '2026-05-01' -> 'May 2026'
  const d = new Date(dateStr + 'T00:00:00');
  return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

// ---------- Number formatting ----------
function fmt(n, t) {
  if (n === null || n === undefined) return '—';
  n = parseFloat(n); if (isNaN(n)) return '—';
  if (t === 'c') {
    if (Math.abs(n) >= 1e7) return '₹' + (n/1e7).toFixed(2) + 'Cr';
    if (Math.abs(n) >= 1e5) return '₹' + (n/1e5).toFixed(1) + 'L';
    if (Math.abs(n) >= 1000) return '₹' + (n/1000).toFixed(0) + 'K';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  if (t === 'n') {
    if (Math.abs(n) >= 1e5) return (n/1e5).toFixed(1) + 'L';
    if (Math.abs(n) >= 1000) return (n/1000).toFixed(1) + 'K';
    return Math.round(n).toLocaleString();
  }
  if (t === 'p') return n.toFixed(1) + '%';
  return n;
}
function dStr(v) { v = parseFloat(v) || 0; return (v>0?'+':'') + (v*100).toFixed(1) + '%'; }
function dCls(v) { v = parseFloat(v) || 0; return v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'neu'; }

// ---------- Safe division ----------
function safeDiv(a, b) { return (b && b !== 0) ? a / b : 0; }

// ---------- Chart helper ----------
const CHARTS = {};
function mkChart(id, type, labels, datasets, opts) {
  const el = document.getElementById(id); if (!el) return;
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id]; }
  function m(t, s) { for (const k in s) { if (s[k] && typeof s[k]==='object' && !Array.isArray(s[k])) { t[k]=t[k]||{}; m(t[k],s[k]); } else t[k]=s[k]; } return t; }
  const base = {
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:datasets.length>1,labels:{color:'#636366',font:{family:'IBM Plex Mono',size:10},boxWidth:10,padding:8}},
             tooltip:{backgroundColor:'#fff',titleColor:'#1A1A1C',bodyColor:'#636366',borderColor:'#DCDBD7',borderWidth:1,titleFont:{family:'IBM Plex Mono',size:10},bodyFont:{family:'IBM Plex Mono',size:10}}},
    scales:{x:{grid:{color:'#E8E7E3'},ticks:{color:'#636366',font:{family:'IBM Plex Mono',size:9},maxRotation:45}},
            y:{grid:{color:'#E8E7E3'},ticks:{color:'#636366',font:{family:'IBM Plex Mono',size:9}}}}
  };
  CHARTS[id] = new Chart(el, {type, data:{labels,datasets}, options:m(base, opts||{})});
}

// ============================================================
//  DATA FETCHING
// ============================================================

async function sbFetch(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!r.ok) {
    let body = '';
    try { body = await r.text(); } catch(e) {}
    throw new Error('Supabase fetch failed: ' + r.status + ' ' + r.statusText + ' | ' + body.slice(0, 300));
  }
  return r.json();
}

async function sbFetchAll(table, qs) {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${qs}`;
    const r = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Range': `${from}-${from + pageSize - 1}`,
        'Range-Unit': 'items'
      }
    });
    if (!r.ok) {
      let body = '';
      try { body = await r.text(); } catch(e) {}
      throw new Error('Supabase fetch failed: ' + r.status + ' ' + r.statusText + ' | ' + body.slice(0, 300));
    }
    const rows = await r.json();
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function loadSummary() {
  return sbFetch('demand_monthly_summary?select=*&order=month_start.asc');
}

async function loadCampaignsForWeeks(months, category) {
  const inList = months.map(m => `"${m}"`).join(',');
  const qs = `select=campaign_id,campaign_name,month_start,total_donation,order_placed,total_donors,uq_visitors,contri_initiated,cart_created,order_created&category=eq.${category}&month_start=in.(${inList})`;
  return sbFetchAll('demand_monthly_campaigns', qs);
}

// ============================================================
//  COMPUTATION
// ============================================================

function shapeSummary(rows) {
  const result = {};
  for (const cat of ['pm','pnm','nm','nnm']) {
    const catRows = rows.filter(r => r.category === cat)
                        .sort((a,b) => a.month_start < b.month_start ? -1 : 1);
    if (catRows.length === 0) {
      result[cat] = null;
      continue;
    }
    const weeks = catRows.map(r => r.month_start);
    const out = {weeks};
    const numCols = ['campaign_views','uq_visitors','total_donation','total_orders',
                    'unique_donors','tipped_orders','tip_amount','contri_initiated',
                    'cart_created','order_created','order_placed','campaigns_live',
                    'campaign_days_live','campaigns_approved','campaigns_raised',
                    'qr_order_count','qr_order_amount','bank_transfer_count','bank_transfer_amount',
                    'coupon_count','coupon_amount','offline_count','offline_amount'];
    for (const c of numCols) {
      out[c] = catRows.map(r => parseFloat(r[c]) || 0);
    }
    // Derived series
    out.asv = catRows.map(r => safeDiv(r.total_donation, r.total_orders));
    out.orders_per_donor = catRows.map(r => safeDiv(r.total_orders, r.unique_donors));
    out.revenue_per_user = catRows.map(r => safeDiv(r.total_donation, r.uq_visitors));
    out.order_conversion = catRows.map(r => safeDiv(r.order_placed, r.contri_initiated));
    out.tip_pct = catRows.map(r => safeDiv(r.tipped_orders, r.total_orders));
    out.avg_tip = catRows.map(r => safeDiv(r.tip_amount, r.tipped_orders));
    out.raised_live_pct = catRows.map(r => safeDiv(r.campaigns_raised, r.campaigns_live));
    out.avg_campaign_days_live = catRows.map(r => safeDiv(r.campaign_days_live, r.campaigns_live));
    out.init_to_cart = catRows.map(r => safeDiv(r.cart_created, r.contri_initiated));
    out.cart_to_oc = catRows.map(r => safeDiv(r.order_created, r.cart_created));
    out.oc_to_placed = catRows.map(r => safeDiv(r.order_placed, r.order_created));
    out.uq_to_init = catRows.map(r => safeDiv(r.contri_initiated, r.uq_visitors));
    out.itp = catRows.map(r => safeDiv(r.order_placed, r.contri_initiated));

    out.w0 = weeks[weeks.length - 1];
    out.w1 = weeks[weeks.length - 2] || weeks[weeks.length - 1];
    out.last12 = weeks.slice(Math.max(0, weeks.length - 12));

    result[cat] = out;
  }
  return result;
}

function computeComp(series, idx) {
  if (idx < 0) return null;
  const cur = series[idx];
  const prev = idx > 0 ? series[idx - 1] : null;
  const wow_pct = (prev !== null && prev !== 0) ? (cur - prev) / Math.abs(prev) : 0;
  const start12 = Math.max(0, idx - 12);
  const slice12 = series.slice(start12, idx);
  const start24 = Math.max(0, idx - 24);
  const slice24 = series.slice(start24, idx);
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const avg_12wk = avg(slice12);
  const avg_24wk = avg(slice24);
  const pct_12wk = avg_12wk !== 0 ? (cur - avg_12wk) / Math.abs(avg_12wk) : 0;
  const pct_24wk = avg_24wk !== 0 ? (cur - avg_24wk) / Math.abs(avg_24wk) : 0;
  return {wow_pct, avg_12wk, avg_24wk, pct_12wk, pct_24wk, cur};
}

function buildCompForWeek(d, idx) {
  return {
    donation:   computeComp(d.total_donation, idx),
    orders:     computeComp(d.total_orders, idx),
    donors:     computeComp(d.unique_donors, idx),
    asv:        computeComp(d.asv, idx),
    tip:        computeComp(d.tip_amount, idx),
    tip_pct:    computeComp(d.tip_pct, idx),
    conversion: computeComp(d.order_conversion, idx),
    visitors:   computeComp(d.uq_visitors, idx),
    views:      computeComp(d.campaign_views, idx),
    raised_live:computeComp(d.raised_live_pct, idx),
    campaigns_live: computeComp(d.campaigns_live, idx),
    campaigns_raised: computeComp(d.campaigns_raised, idx),
  };
}

function attachComp(shaped) {
  for (const cat of Object.keys(shaped)) {
    const d = shaped[cat];
    if (!d) continue;
    const wi = d.weeks.length;
    d.comp = {
      w0: buildCompForWeek(d, wi - 1),
      w1: buildCompForWeek(d, wi - 2),
    };
  }
  return shaped;
}

// ============================================================
//  CAMPAIGN-LEVEL ANALYSIS (for deep dives)
// ============================================================

function aggregateCampaigns(rows, month) {
  const mRows = rows.filter(r => r.month_start === month);
  const map = {};
  for (const r of mRows) {
    const id = r.campaign_id;
    if (!map[id]) {
      map[id] = {campaign_id:id, campaign_name:r.campaign_name||'', pageviews:0, uq_visitor:0, contri_initiated:0,
                 cart_created:0, order_created:0, order_placed:0,
                 unique_donors:0, total_donation:0, tipped_orders:0, tip_amount:0};
    }
    map[id].pageviews        += parseFloat(r.pageviews)        || 0;
    map[id].uq_visitor       += parseFloat(r.uq_visitors)      || 0;
    map[id].contri_initiated += parseFloat(r.contri_initiated) || 0;
    map[id].cart_created     += parseFloat(r.cart_created)     || 0;
    map[id].order_created    += parseFloat(r.order_created)    || 0;
    map[id].order_placed     += parseFloat(r.order_placed)     || 0;
    map[id].unique_donors    += parseFloat(r.total_donors)     || 0;
    map[id].total_donation   += parseFloat(r.total_donation)   || 0;
    map[id].tipped_orders    += parseFloat(r.tipped_orders)    || 0;
    map[id].tip_amount       += parseFloat(r.tip_amount)       || 0;
    if (r.campaign_name) map[id].campaign_name = r.campaign_name;
  }
  return map;
}

function computeDeepDive(rows, m1, m0) {
  const w1Agg = aggregateCampaigns(rows, m1);
  const w0Agg = aggregateCampaigns(rows, m0);
  const totalDonW0 = Object.values(w0Agg).reduce((a,r)=>a+r.total_donation, 0);
  const totalDonW1 = Object.values(w1Agg).reduce((a,r)=>a+r.total_donation, 0);

  const top10_w0 = Object.values(w0Agg)
    .sort((a,b) => b.total_donation - a.total_donation)
    .slice(0, 10)
    .map(r => ({...r, pct: totalDonW0 > 0 ? (r.total_donation/totalDonW0*100) : 0}));
  const top10_w1 = Object.values(w1Agg)
    .sort((a,b) => b.total_donation - a.total_donation)
    .slice(0, 10)
    .map(r => ({...r, pct: totalDonW1 > 0 ? (r.total_donation/totalDonW1*100) : 0}));

  function sumKey(agg, k) { return Object.values(agg).reduce((a,r)=>a+r[k], 0); }
  const funnel = {
    w1: {
      pageviews: sumKey(w1Agg, 'pageviews'), uq_visitors: sumKey(w1Agg, 'uq_visitor'),
      contri_initiated: sumKey(w1Agg, 'contri_initiated'), cart_created: sumKey(w1Agg, 'cart_created'),
      order_created: sumKey(w1Agg, 'order_created'), order_placed: sumKey(w1Agg, 'order_placed'),
      total_donation: totalDonW1,
    },
    w0: {
      pageviews: sumKey(w0Agg, 'pageviews'), uq_visitors: sumKey(w0Agg, 'uq_visitor'),
      contri_initiated: sumKey(w0Agg, 'contri_initiated'), cart_created: sumKey(w0Agg, 'cart_created'),
      order_created: sumKey(w0Agg, 'order_created'), order_placed: sumKey(w0Agg, 'order_placed'),
      total_donation: totalDonW0,
    }
  };

  return {top10_w0, top10_w1, funnel, totalDonW0, totalDonW1, w0: m0, w1: m1};
}

function lastNWeeks(weeks, n) { return weeks.slice(Math.max(0, weeks.length - n)); }
function pickByWeek(weeks, series, wantedWeeks) {
  return wantedWeeks.map(w => { const i = weeks.indexOf(w); return i >= 0 ? series[i] : 0; });
}
