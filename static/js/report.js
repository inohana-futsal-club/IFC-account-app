/* ================================================================
   REPORT
================================================================ */
function renderReport() {
  const range = getFiscalYearRange(currentFiscalYear);
  const monthly = {};
  S.txs.forEach(t => {
    if (!t.date || !range.some(m => t.date.startsWith(m))) return;
    const ym = t.date.slice(0,7);
    if (!monthly[ym]) monthly[ym] = { inc:0,exp:0,ci:0,co:0,bi:0,bo:0 };
    if (t.type==='income')  { monthly[ym].inc+=t.amount; t.acct==='cash'?monthly[ym].ci+=t.amount:monthly[ym].bi+=t.amount; }
    if (t.type==='expense') { monthly[ym].exp+=t.amount; t.acct==='cash'?monthly[ym].co+=t.amount:monthly[ym].bo+=t.amount; }
  });
  const ms = Object.keys(monthly).sort().reverse();

  const mel = document.getElementById('r-monthly');
  if (mel) mel.innerHTML = ms.length===0 ? '<div class="empty">データがありません</div>'
    : ms.map(ym => {
        const d=monthly[ym], bal=d.inc-d.exp;
        return `<div class="p-7-bdr">
          <div class="flex flex-between mb-2">
            <span class="text-sm-mono">${escapeHtml(ym)}</span>
            <span class="text-sm font-semibold ${bal>=0?'text-income':'text-expense'}">${bal>=0?'+':''}${fmt(bal)}</span>
          </div>
          <div class="text-xs text-secondary-color">
            現金 <span class="text-income">${fmt(d.ci)}</span>/<span class="text-expense">${fmt(d.co)}</span>
            銀行 <span class="text-income">${fmt(d.bi)}</span>/<span class="text-expense">${fmt(d.bo)}</span>
          </div></div>`;
      }).join('');

  const clss = {};
  S.txs.filter(t => t.type!=='transfer' && t.date && range.some(m => t.date.startsWith(m))).forEach(t => {
    if (!clss[t.classification]) clss[t.classification] = { inc:0,exp:0 };
    if (t.type==='income') clss[t.classification].inc+=t.amount;
    else clss[t.classification].exp+=t.amount;
  });
  const cel = document.getElementById('r-cats');
  if (cel) cel.innerHTML = Object.keys(clss).sort().length===0 ? '<div class="empty">データがありません</div>'
    : Object.keys(clss).sort().map(k => {
        const d=clss[k];
        return `<div class="flex flex-center flex-between p-7-bdr">
          <span class="text-sm" style="background:var(--sur2);padding:2px 8px;border-radius:20px">${escapeHtml(k)}</span>
          <span class="text-sm">
            ${d.inc?`<span class="text-income">${fmt(d.inc)}</span> `:''}
            ${d.exp?`<span class="text-expense">-${fmt(d.exp)}</span>`:''}
          </span>
        </div>`;
      }).join('');

  renderTrendTable(monthly);
}

function renderTrendTable(monthly) {
  const el = document.getElementById('trend-table'); if (!el) return;
  const ms = Object.keys(monthly).sort();
  if (ms.length===0) { el.innerHTML='<tr><td class="empty">データがありません</td></tr>'; return; }
  let cum=0;
  el.innerHTML = `<thead><tr>
    <th>月</th>
    <th class="text-right">収入</th>
    <th class="text-right">支出</th>
    <th class="text-right">差引</th>
    <th class="text-right">累計残高</th>
  </tr></thead><tbody>${
    ms.map(ym => {
      const d=monthly[ym], bal=d.inc-d.exp; cum+=bal;
      return `<tr>
        <td class="text-sm-mono">${escapeHtml(ym)}</td>
        <td class="num text-income">${fmtN(d.inc)}</td>
        <td class="num text-expense">${fmtN(d.exp)}</td>
        <td class="num font-semibold ${bal>=0?'text-income':'text-expense'}">${bal>=0?'+':''}${fmtN(bal)}</td>
        <td class="num font-bold">${fmtN(cum)}</td>
      </tr>`;
    }).join('')
  }</tbody>`;
}

function renderChart() {
  const range = getFiscalYearRange(currentFiscalYear);
  const monthly = {};
  S.txs.filter(t => t.type!=='transfer' && t.date && range.some(m => t.date.startsWith(m))).forEach(t => {
    const ym = t.date.slice(0,7);
    if (!monthly[ym]) monthly[ym] = { inc:0,exp:0 };
    if (t.type==='income') monthly[ym].inc+=t.amount;
    else monthly[ym].exp+=t.amount;
  });
  const labels  = Object.keys(monthly).sort();
  const incData = labels.map(l => monthly[l].inc);
  const expData = labels.map(l => monthly[l].exp);
  let cum=0;
  const balData = labels.map(l => { cum+=monthly[l].inc-monthly[l].exp; return cum; });
  const ctx = document.getElementById('trend-chart'); if (!ctx) return;
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx, {
    data: { labels, datasets: [
      { type:'bar',  label:'収入', data:incData, backgroundColor:'rgba(45,106,79,.65)', borderRadius:4, order:2 },
      { type:'bar',  label:'支出', data:expData, backgroundColor:'rgba(192,57,43,.65)', borderRadius:4, order:2 },
      { type:'line', label:'累計残高', data:balData, borderColor:'#1d4ed8', backgroundColor:'rgba(29,78,216,.08)', borderWidth:2, pointRadius:3, fill:true, tension:.3, order:1, yAxisID:'y2' },
    ]},
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction: { mode:'index', intersect:false },
      plugins: { legend: { labels: { font:{ size:11 }, boxWidth:12 } } },
      scales: {
        x:  { ticks:{ font:{ size:11 } }, grid:{ display:false } },
        y:  { ticks:{ font:{ size:11 }, callback:v=>'¥'+v.toLocaleString() }, grid:{ color:'rgba(0,0,0,.05)' } },
        y2: { position:'right', ticks:{ font:{ size:11 }, callback:v=>'¥'+v.toLocaleString() }, grid:{ display:false } },
      },
    },
  });
}

/* ================================================================
   EXPORT
================================================================ */
function exportCSV() {
  const h = ['日付','口座','移動先','種別','金額','摘要','科目','備考'];
  const rows = S.txs
    .sort((a,b) => a.date.localeCompare(b.date))
    .map(t => [
      t.date,
      t.acct==='cash'?'現金':'銀行預金',
      t.type==='transfer'?(t.toAcct==='cash'?'現金':'銀行預金'):'',
      t.type==='income'?'収入':t.type==='expense'?'支出':'口座振替',
      t.amount, t.desc, t.cat, t.note,
    ]);
  // ダブルクォートのエスケープと、Excelで数式実行されるのを防ぐCSVインジェクション対策
  const csvCell = v => {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv  = [h,...rows].map(r => r.map(csvCell).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `部活会計_${toYMD(new Date())}.csv`;
  a.click();
  toast('CSVをダウンロードしました ✓');
}

// スプレッドシート全体をDrive API経由で複製し、手動バックアップとする
// （drive.fileスコープが必要。古いスコープでログイン済みの場合は再ログインが必要）
async function backupSpreadsheet() {
  const name = `部活会計_backup_${toYMD(new Date())}`;
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${SHEET_ID}/copy`, {
      method: 'POST',
      headers: { Authorization:`Bearer ${accessToken}`, 'Content-Type':'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw apiError('Drive COPY', res);
    const file = await res.json();
    toast(`バックアップを作成しました（${file.name || name}）✓`);
  } catch (e) {
    console.error(e);
    if (e.isSessionExpired) showSessionExpiredModal();
    else toast('バックアップの作成に失敗しました');
  }
}
