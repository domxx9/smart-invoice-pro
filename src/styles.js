export const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #0a0a0b;
    --surface:   #141416;
    --card:      #1c1c1f;
    --border:    #2a2a2e;
    --accent:    #f5a623;
    --accent-d:  #c87f0a;
    --text:      #f0f0f0;
    --muted:     #888;
    --danger:    #e05252;
    --success:   #4caf84;
    --radius:    12px;
    --radius-sm: 8px;
    --shadow:    0 4px 24px rgba(0,0,0,.5);
  }

  body { background: var(--bg); color: var(--text); font-family: system-ui, sans-serif; min-height: 100dvh; }

  .app { display: flex; flex-direction: column; min-height: 100dvh; padding-top: env(safe-area-inset-top, 0); }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 16px; height: 56px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .header-inner { display: flex; align-items: center; justify-content: space-between; width: 100%; }
  .header h1 { font-size: 1rem; font-weight: 700; color: var(--accent); letter-spacing: .5px; }
  .content { flex: 1; padding: 16px; max-width: 900px; width: 100%; margin: 0 auto; }
  .nav { display: flex; gap: 4px; background: var(--surface); border-top: 1px solid var(--border); padding: 8px 8px env(safe-area-inset-bottom, 0); position: sticky; bottom: 0; z-index: 10; }
  .nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 4px; border: none; background: none; color: var(--muted); font-size: 0.65rem; cursor: pointer; border-radius: var(--radius-sm); transition: color .15s, background .15s; }
  .nav-btn.active { color: var(--accent); background: rgba(245,166,35,.08); }
  .nav-btn svg { width: 22px; height: 22px; }
  .btn svg { width: 16px; height: 16px; flex-shrink: 0; }
  @keyframes navGlow { 0%,100% { background: rgba(245,166,35,.08); color: var(--accent); } 50% { background: rgba(245,166,35,.28); box-shadow: 0 0 14px rgba(245,166,35,.5); } }
  .nav-btn.glow { animation: navGlow 1s ease-in-out infinite; color: var(--accent); }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 12px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 18px; border-radius: var(--radius-sm); font-size: .9rem; font-weight: 600; cursor: pointer; border: none; transition: opacity .15s, transform .1s; }
  .btn:active { transform: scale(.97); }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { opacity: .9; }
  .btn-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--muted); }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-sm { padding: 6px 12px; font-size: .8rem; }
  .btn-full { width: 100%; }

  label { font-size: .8rem; color: var(--muted); display: block; margin-bottom: 4px; }
  input, textarea, select { width: 100%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); font-size: .9rem; padding: 10px 12px; outline: none; }
  input:focus, textarea:focus, select:focus { border-color: var(--accent); }
  textarea { resize: vertical; min-height: 80px; }
  .field { margin-bottom: 12px; }

  .invoice-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .line-item { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--border); }
  .line-item:last-child { border-bottom: none; }
  .li-row2 { display: flex; align-items: center; gap: 6px; }
  .li-qty  { width: 64px; flex-shrink: 0; }
  .li-price{ flex: 1; }
  .li-total{ font-size: .9rem; font-weight: 600; color: var(--accent); white-space: nowrap; min-width: 64px; text-align: right; }
  .li-del  { flex-shrink: 0; }
  .totals  { text-align: right; padding: 12px 0; border-top: 1px solid var(--border); }
  .totals .total-line { display: flex; justify-content: flex-end; gap: 16px; font-size: .9rem; color: var(--muted); margin-bottom: 4px; }
  .totals .grand { font-size: 1.25rem; font-weight: 700; color: var(--accent); }

  .ai-box { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 14px; }
  .ai-output { font-size: .85rem; line-height: 1.6; white-space: pre-wrap; color: var(--text); }
  .ai-typing::after { content: '▋'; animation: blink .7s step-end infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ptr-spinner { width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid var(--border); border-top-color: var(--accent); flex-shrink: 0; }
  .chip { display: inline-block; background: rgba(245,166,35,.12); color: var(--accent); border-radius: 20px; padding: 3px 10px; font-size: .75rem; margin: 2px; cursor: pointer; border: 1px solid rgba(245,166,35,.2); }
  .chip:hover { background: rgba(245,166,35,.22); }

  .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
  .product-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; cursor: pointer; transition: border-color .15s, transform .1s; }
  .product-card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .product-card h3 { font-size: .9rem; font-weight: 600; margin-bottom: 4px; }
  .product-card .price { color: var(--accent); font-weight: 700; }
  .product-card .stock { font-size: .75rem; color: var(--muted); }
  .low-stock { color: var(--danger) !important; }

  .inv-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
  .inv-id { font-weight: 600; font-size: .9rem; }
  .inv-customer { font-size: .8rem; color: var(--muted); }
  .badge { display: inline-block; font-size: .7rem; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
  .badge-new       { background: rgba(100,160,255,.15); color: #64a0ff;        }
  .badge-pending   { background: rgba(245,166,35,.12);  color: var(--accent);  }
  .badge-fulfilled { background: rgba(76,175,132,.12);  color: #4caf84;        }
  .badge-paid      { background: rgba(76,175,132,.15);  color: var(--success); }
  .badge-overdue   { background: rgba(224,82,82,.12);   color: var(--danger);  }
  .badge-refunded  { background: rgba(136,136,136,.15); color: var(--muted);   }
  .badge-draft     { background: rgba(136,136,136,.15); color: var(--muted);   }
  .badge-FULFILLED { background: rgba(76,175,132,.15);  color: var(--success); }
  .badge-PENDING   { background: rgba(245,166,35,.12);  color: var(--accent);  }
  .badge-CANCELED  { background: rgba(224,82,82,.12);   color: var(--danger);  }

  .settings-section { margin-bottom: 8px; }
  .settings-section-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; user-select: none; transition: background .15s; }
  .settings-section-header:hover { background: #222225; }
  .settings-section-header h2 { font-size: .82rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin: 0; }
  .settings-section-header .chevron { font-size: .7rem; color: var(--muted); transition: transform .2s; }
  .settings-section-header.open .chevron { transform: rotate(180deg); }
  .settings-section-body { border: 1px solid var(--border); border-top: none; border-radius: 0 0 var(--radius-sm) var(--radius-sm); padding: 14px; margin-bottom: 0; background: var(--bg); }

  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .stat-card .label { font-size: .75rem; color: var(--muted); margin-bottom: 4px; }
  .stat-card .value { font-size: 1.5rem; font-weight: 700; color: var(--accent); }
  .stat-card .sub { font-size: .75rem; color: var(--success); margin-top: 2px; }

  .divider { height: 1px; background: var(--border); margin: 16px 0; }
  .text-muted { color: var(--muted); font-size: .85rem; }
  .text-accent { color: var(--accent); }
  .text-success { color: var(--success); }
  .text-danger { color: var(--danger); }
  .flex-between { display: flex; justify-content: space-between; align-items: center; }
  .mb-8 { margin-bottom: 8px; }
  .mb-16 { margin-bottom: 16px; }
  .mt-8 { margin-top: 8px; }
  .mt-16 { margin-top: 16px; }

  @keyframes confetti-fall {
    0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
    75%  { opacity: 1; }
    100% { transform: translateY(110vh) translateX(var(--cdrift, 0px)) rotate(var(--crot, 360deg)); opacity: 0; }
  }

  @keyframes egg-pop {
    from { transform: translateX(-50%) scale(0.7) translateY(8px); opacity: 0; }
    to   { transform: translateX(-50%) scale(1)   translateY(0);   opacity: 1; }
  }

  @keyframes egg-fade {
    0%   { opacity: 1; }
    70%  { opacity: 1; }
    100% { opacity: 0; }
  }
`
