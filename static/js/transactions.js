function txToRow(t) {
  return [t.id, t.date, t.type, t.acct, t.toAcct||'', t.amount, t.desc, t.classification||'', t.cat, t.note||''];
}

/* ================================================================
   TX ROW / RENDER
================================================================ */
function txRow(t) {
  if (!t || !t.date) return '';
  let acctBadge, amtStr, amtCls, catLabel;
  if (t.type === 'transfer') {
    acctBadge = `<span class="bdg transfer">振替</span>`;
    amtStr    = fmt(t.amount);
    amtCls    = 'transfer';
    catLabel  = `${t.acct==='cash'?'現金':'銀行'}→${t.toAcct==='cash'?'現金':'銀行'}`;
  } else {
    acctBadge = `<span class="bdg ${t.acct}">${t.acct==='cash'?'現金':'銀行'}</span>`;
    amtStr    = (t.type==='income'?'+':'-') + fmt(t.amount);
    amtCls    = t.type;
    catLabel  = t.classification ? `${escapeHtml(t.classification)} > ${escapeHtml(t.cat)}` : escapeHtml(t.cat);
  }
  // 日付を m/d 形式に変換
  const dateParts = t.date.slice(5).split('-');
  const dateLabel = dateParts.length === 2
    ? `${parseInt(dateParts[0])}/${parseInt(dateParts[1])}`
    : escapeHtml(t.date.slice(5));

  return `<div class="txr">
    <div class="txr-row1">
      <span class="txdate">${dateLabel}</span>
      ${acctBadge}
      <span class="txcat">${catLabel}</span>
    </div>
    <div class="txr-row2">
      <span class="txdesc">${escapeHtml(t.desc)}</span>
      <span class="txamt ${amtCls}">${amtStr}</span>
      <button class="btn bs sm btn-sm-custom flex-shrink" data-click-action="openEditTx" data-id="${t.id}">編集</button>
      <button class="btn bd sm btn-sm-custom flex-shrink" data-click-action="delTx" data-id="${t.id}">削除</button>
    </div>
  </div>`;
}

/* ================================================================
   TYPE / ACCT TOGGLE
================================================================ */
function setType(t) {
  S.type = t;
  ['income','expense','transfer'].forEach(x =>
    document.getElementById('t-'+x).classList.toggle('on', x===t));
  document.getElementById('normal-fields').style.display   = t==='transfer' ? 'none'  : 'block';
  document.getElementById('transfer-fields').style.display = t==='transfer' ? 'block' : 'none';

  // 科目分類を type に基づいて更新
  if (t !== 'transfer') {
    const txCls = document.getElementById('tx-cls');
    if (txCls) {
      const classifications = [...new Set(S.categories.filter(c => c.type === t).map(c => c.classification))];
      txCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
      updateTxCategories();
    }
  }
}

function setAcct(a) {
  S.acct = a;
  document.getElementById('a-cash').classList.toggle('on', a==='cash');
  document.getElementById('a-bank').classList.toggle('on', a==='bank');
}

/* ================================================================
   CATEGORY SELECTION
================================================================ */
function initializeCategories() {
  // PC版の科目分類初期化
  const txCls = document.getElementById('tx-cls');
  if (txCls) {
    const classifications = [...new Set(S.categories.filter(c => c.type === 'income').map(c => c.classification))];
    txCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
    updateTxCategories();
  }

  // モバイル版の科目分類初期化
  const bsCls = document.getElementById('bs-cls');
  if (bsCls) {
    const classifications = [...new Set(S.categories.filter(c => c.type === 'income').map(c => c.classification))];
    bsCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
    updateBsCategories();
  }

  // 編集画面の科目分類初期化
  const etxCls = document.getElementById('etx-cls');
  if (etxCls) {
    const classifications = [...new Set(S.categories.filter(c => c.type === 'income').map(c => c.classification))];
    etxCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
  }
}

function updateTxCategories() {
  const cls = document.getElementById('tx-cls')?.value || '';
  const cats = S.categories.filter(c => c.type === S.type && c.classification === cls).sort((a, b) => a.order - b.order);
  const catSelect = document.getElementById('tx-cat');
  if (catSelect) {
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  }
}

function updateBsCategories() {
  const cls = document.getElementById('bs-cls')?.value || '';
  const cats = S.categories.filter(c => c.type === S.type && c.classification === cls).sort((a, b) => a.order - b.order);
  const catSelect = document.getElementById('bs-cat');
  if (catSelect) {
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  }
}

function updateEditCategories() {
  const cls = document.getElementById('etx-cls')?.value || '';
  const cats = S.categories.filter(c => c.type === editingTxType && c.classification === cls).sort((a, b) => a.order - b.order);
  const catSelect = document.getElementById('etx-cat');
  if (catSelect) {
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
  }
}

// 編集モーダルで種別（収入/支出）を切り替えた際、科目分類・科目のプルダウンを
// 新しい種別のものに作り直す（切り替えずに保存すると、支出なのに収入科目が
// 保存される、といった不整合が起きるため）
function setEtxType(type, el) {
  editingTxType = type;
  el.closest('.tog2').querySelectorAll('.tbtn').forEach(b => {
    b.classList.remove('on');
    b.setAttribute('aria-pressed', 'false');
  });
  el.classList.add('on');
  el.setAttribute('aria-pressed', 'true');

  const etxCls = document.getElementById('etx-cls');
  const classifications = [...new Set(S.categories.filter(c => c.type === type).map(c => c.classification))];
  etxCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
  updateEditCategories();
}

/* ================================================================
   ADD / DELETE TX
================================================================ */
async function addTx() {
  let t;
  if (S.type==='transfer') {
    const date   = document.getElementById('tr-date').value;
    const amount = parseInt(document.getElementById('tr-amt').value);
    const from   = document.getElementById('tr-from').value;
    const to     = document.getElementById('tr-to').value;
    const desc   = document.getElementById('tr-desc').value.trim() || `${from==='cash'?'現金':'銀行'}→${to==='cash'?'現金':'銀行'}`;
    const note   = document.getElementById('tr-note').value.trim();
    if (!date)           { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (from===to)       { toast('移動元と移動先が同じです'); return; }
    t = { id:nid++, date, type:'transfer', acct:from, toAcct:to, amount, desc, cat:'振替', note };
    S.txs.push(t);
    ['tr-amt','tr-desc','tr-note'].forEach(id => document.getElementById(id).value='');
  } else {
    const date   = document.getElementById('tx-date').value;
    const amount = parseInt(document.getElementById('tx-amt').value);
    const desc   = document.getElementById('tx-desc').value.trim();
    const classification = document.getElementById('tx-cls').value;
    const cat    = document.getElementById('tx-cat').value;
    const note   = document.getElementById('tx-note').value.trim();
    if (!date)           { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (!desc)           { toast('摘要を入力してください'); return; }
    t = { id:nid++, date, type:S.type, acct:S.acct, amount, desc, classification, cat, note };
    S.txs.push(t);
    ['tx-amt','tx-desc','tx-note'].forEach(id => document.getElementById(id).value='');
  }
  toast('追加しました ✓');
  render();
  await saveSheet(() => sheetsAppend(SH.TX, [txToRow(t)]));
}

function openEditTx(id) {
  const t = S.txs.find(t => t.id === id);
  if (!t) return;
  document.getElementById('etx-id').value    = id;
  document.getElementById('etx-date').value  = t.date;
  document.getElementById('etx-amt').value   = t.amount;
  document.getElementById('etx-desc').value  = t.desc;
  document.getElementById('etx-note').value  = t.note || '';

  const isTransfer = t.type === 'transfer';
  document.getElementById('etx-normal').style.display   = isTransfer ? 'none' : 'block';
  document.getElementById('etx-transfer').style.display = isTransfer ? 'block' : 'none';

  if (isTransfer) {
    document.getElementById('etx-date').value    = t.date;
    document.getElementById('etx-amt').value     = t.amount;
    document.getElementById('etx-date-tr').value = t.date;
    document.getElementById('etx-amt-tr').value  = t.amount;
    document.getElementById('etx-tr-from').value = t.acct;
    document.getElementById('etx-tr-to').value   = t.toAcct;
    document.getElementById('etx-tr-desc').value = t.desc;
  } else {
    // 種別ボタン & 編集モーダル専用の種別を更新（S.typeは追加フォーム用のため触らない）
    editingTxType = t.type;
    ['income','expense'].forEach(tp => {
      const btn = document.getElementById('etx-t-' + tp);
      btn.classList.toggle('on', t.type === tp);
      btn.setAttribute('aria-pressed', String(t.type === tp));
    });
    // 口座ボタン
    ['cash','bank'].forEach(ac => {
      document.getElementById('etx-a-' + ac).classList.toggle('on', t.acct === ac);
    });
    // 科目分類と科目
    const etxCls = document.getElementById('etx-cls');
    const classifications = [...new Set(S.categories.filter(c => c.type === t.type).map(c => c.classification))];
    etxCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
    etxCls.value = t.classification || classifications[0];
    updateEditCategories();
    const catSelect = document.getElementById('etx-cat');
    catSelect.value = t.cat || catSelect.options[0]?.value || '';
  }
  openM('m-edit-tx');
}

async function saveEditTx() {
  const id = parseInt(document.getElementById('etx-id').value);
  const t  = S.txs.find(t => t.id === id);
  if (!t) return;
  const beforeRow = txToRow(t); // 楽観的ロック用：最後に読み込んだ時点の値

  const isTransfer = t.type === 'transfer';
  let date, amount, acct, toAcct, desc, typeOn, acctOn;
  if (isTransfer) {
    date   = document.getElementById('etx-date').value;
    amount = parseInt(document.getElementById('etx-amt').value);
    acct   = document.getElementById('etx-tr-from').value;
    toAcct = document.getElementById('etx-tr-to').value;
    desc   = document.getElementById('etx-tr-desc').value.trim() ||
               `${acct==='cash'?'現金':'銀行'}→${toAcct==='cash'?'現金':'銀行'}`;
    if (!date)              { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (acct === toAcct)    { toast('移動元と移動先が同じです'); return; }
  } else {
    typeOn = ['income','expense'].find(tp =>
      document.getElementById('etx-t-' + tp).classList.contains('on'));
    acctOn = ['cash','bank'].find(ac =>
      document.getElementById('etx-a-' + ac).classList.contains('on'));
    date   = document.getElementById('etx-date').value;
    amount = parseInt(document.getElementById('etx-amt').value);
    desc   = document.getElementById('etx-desc').value.trim();
    if (!date)              { toast('日付を入力してください'); return; }
    if (!amount||amount<=0) { toast('金額を正しく入力してください'); return; }
    if (!desc)              { toast('摘要を入力してください'); return; }
  }

  const row = S.txs.findIndex(x => x.id === id) + 2;
  const unchanged = await assertRowUnchanged(SH.TX, row, beforeRow).catch(() => true);
  if (!unchanged && !confirm('他の人がこの取引を更新しています。上書きしますか？')) {
    closeM('m-edit-tx');
    await loadAll();
    render();
    return;
  }

  if (isTransfer) {
    t.date = date; t.amount = amount; t.acct = acct; t.toAcct = toAcct; t.desc = desc;
  } else {
    t.type   = typeOn || t.type;
    t.acct   = acctOn || t.acct;
    t.date   = date;
    t.amount = amount;
    t.desc   = desc;
    t.classification = document.getElementById('etx-cls').value;
    t.cat    = document.getElementById('etx-cat').value;
    t.note   = document.getElementById('etx-note').value.trim();
  }
  closeM('m-edit-tx');
  toast('更新しました ✓');
  render();
  await saveSheet(() => sheetsUpdateRow(SH.TX, row, txToRow(t)));
}

async function delTx(id) {
  if (!confirm('この取引を削除しますか？')) return;
  const row = S.txs.findIndex(t => t.id === id) + 2;
  S.txs = S.txs.filter(t => t.id!==id);
  render();
  await saveSheet(() => sheetsDeleteRow(SH.TX, row));
  toast('削除しました');
}

/* ================================================================
   LEDGER
================================================================ */
function showLedger(type) {
  currentLedger = type;
  document.querySelectorAll('#ledger-tabs .pill').forEach((p,i) =>
    p.classList.toggle('active', ['cash','bank','cat','summary'][i]===type));
  const el = document.getElementById('ledger-content');
  if      (type==='cash')    el.innerHTML = renderCashLedger('cash','現金出納帳');
  else if (type==='bank')    el.innerHTML = renderCashLedger('bank','預金出納帳');
  else if (type==='cat')     el.innerHTML = renderCatLedger();
  else                       el.innerHTML = renderSummaryStatement();
}

function renderCashLedger(acct, title) {
  const range = getFiscalYearRange(currentFiscalYear);
  const opening = getOpeningBalance(currentFiscalYear)[acct];
  const txs = S.txs.filter(t => {
    // 会計年度フィルタ追加
    if (!t.date || !range.some(m => t.date.startsWith(m))) return false;
    if (t.type==='transfer') return t.acct===acct || t.toAcct===acct;
    return t.acct===acct;
  }).sort((a,b) => a.date.localeCompare(b.date));

  let bal=opening, totalIn=0, totalOut=0;
  const carryoverRow = `<tr class="carryover-row">
    <td class="num">-</td>
    <td>-</td>
    <td>前年度繰越</td>
    <td class="num"></td>
    <td class="num"></td>
    <td class="num ${bal>=0?'bal-pos':'bal-neg'}">${fmtN(bal)}</td>
    <td colspan="2"></td>
  </tr>`;
  const txRows = txs.map(t => {
    let inAmt=0, outAmt=0, label=t.desc;
    if (t.type==='income')  { inAmt=t.amount; bal+=t.amount; totalIn+=t.amount; }
    else if (t.type==='expense') { outAmt=t.amount; bal-=t.amount; totalOut+=t.amount; }
    else if (t.type==='transfer') {
      if (t.acct===acct)  { outAmt=t.amount; bal-=t.amount; totalOut+=t.amount; label=`振替出金→${t.toAcct==='cash'?'現金':'銀行'}`; }
      else                { inAmt=t.amount;  bal+=t.amount; totalIn+=t.amount;  label=`振替入金←${t.acct==='cash'?'現金':'銀行'}`; }
    }
    return `<tr>
      <td class="num">${escapeHtml(t.date.replace(/-/g, '/'))}</td>
      <td>${escapeHtml(t.cat)||'—'}</td>
      <td>${escapeHtml(label)}</td>
      <td class="num text-income">${inAmt?fmtN(inAmt):''}</td>
      <td class="num text-expense">${outAmt?fmtN(outAmt):''}</td>
      <td class="num ${bal>=0?'bal-pos':'bal-neg'}">${fmtN(bal)}</td>
      <td class="text-center"><button class="btn bs sm" data-click-action="openEditTx" data-id="${t.id}">編集</button></td>
      <td class="text-center"><button class="btn bd sm" data-click-action="delTx" data-id="${t.id}" data-confirm="削除しますか？">削除</button></td>
    </tr>`;
  }).join('');
  return `<div class="card card-no-pad overflow-hidden">
    <div class="card-header">${title}</div>
    <div class="overflow-x-auto"><table class="ltbl">
      <thead><tr><th>日付</th><th>科目</th><th>摘要</th><th class="text-right">収入金額</th><th class="text-right">支出金額</th><th class="text-right">差引残高</th><th>編集</th><th>削除</th></tr></thead>
      <tbody>${carryoverRow}${txRows||'<tr><td colspan="8" class="empty">データがありません</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3" class="font-bold">合計</td>
        <td class="num text-income">${fmtN(totalIn)}</td>
        <td class="num text-expense">${fmtN(totalOut)}</td>
        <td class="num">${fmtN(bal)}</td>
        <td colspan="2"></td>
      </tr></tfoot>
    </table></div></div>`;
}

function renderCatLedger() {
  const range = getFiscalYearRange(currentFiscalYear);
  const clss = {};
  S.txs.filter(t => t.type!=='transfer' && t.date && range.some(m => t.date.startsWith(m))).forEach(t => {
    if (!clss[t.classification]) clss[t.classification] = [];
    clss[t.classification].push(t);
  });
  let html = '';
  Object.keys(clss).sort().forEach(cls => {
    const txs = clss[cls].sort((a,b) => a.date.localeCompare(b.date));
    let total=0, rows='';
    txs.forEach(t => {
      const amt = t.type==='income' ? t.amount : -t.amount;
      total += amt;
      rows += `<tr>
        <td class="num">${escapeHtml(t.date.replace(/-/g, '/'))}</td><td>${escapeHtml(t.desc)}</td>
        <td class="num text-secondary">${escapeHtml(t.classification)} > ${escapeHtml(t.cat)}</td>
        <td><span class="bdg ${t.acct}">${t.acct==='cash'?'現金':'銀行'}</span></td>
        <td class="num ${t.type==='income'?'text-income':'text-expense'}">${t.type==='income'?'+':'-'}${fmtN(t.amount)}</td>
      </tr>`;
    });
    html += `<div class="card mb-10 card-no-pad overflow-hidden">
      <div class="flex flex-between card-header">
        <span>${escapeHtml(cls)}</span>
        <span class="number-mono ${total>=0?'text-income':'text-expense'}">${total>=0?'+':''}${fmtN(total)}</span>
      </div>
      <div class="overflow-x-auto"><table class="ltbl">
        <thead><tr><th>日付</th><th>摘要</th><th class="text-center">科目</th><th>口座</th><th class="text-right">金額</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div></div>`;
  });
  return html || '<div class="empty">データがありません</div>';
}

function renderSummaryStatement() {
  const range = getFiscalYearRange(currentFiscalYear);
  let incTotal=0, expTotal=0;
  const catInc={}, catExp={};
  S.txs.filter(t => t.type!=='transfer' && t.date && range.some(m => t.date.startsWith(m))).forEach(t => {
    if (t.type==='income')  { catInc[t.cat]=(catInc[t.cat]||0)+t.amount; incTotal+=t.amount; }
    else                    { catExp[t.cat]=(catExp[t.cat]||0)+t.amount; expTotal+=t.amount; }
  });
  const incRows = Object.keys(catInc).sort().map(c =>
    `<tr><td style="padding-left:24px">${escapeHtml(c)}</td><td class="num text-income">${fmtN(catInc[c])}</td></tr>`).join('');
  const expRows = Object.keys(catExp).sort().map(c =>
    `<tr><td class="pl-24">${escapeHtml(c)}</td><td class="num text-expense">${fmtN(catExp[c])}</td></tr>`).join('');
  const net = incTotal - expTotal;
  return `<div class="card card-no-pad overflow-hidden">
    <div class="card-header">収支計算書（${escapeHtml(getFiscalYearLabel(currentFiscalYear))}）</div>
    <div class="overflow-x-auto"><table class="ltbl"><tbody>
      <tr><td class="font-bold bg-income p-8-14">【収入の部】</td><td class="num font-bold bg-income">${fmtN(incTotal)}</td></tr>
      ${incRows}
      <tr><td class="font-bold bg-expense p-8-14">【支出の部】</td><td class="num font-bold bg-expense">${fmtN(expTotal)}</td></tr>
      ${expRows}
      <tr style="border-top:2px solid var(--bdr)">
        <td class="font-bold" style="font-size:15px;padding:12px 14px">当期収支差額</td>
        <td class="num font-bold ${net>=0?'text-income':'text-expense'}" style="font-size:15px">${net>=0?'+':''}${fmtN(net)}</td>
      </tr>
    </tbody></table></div></div>`;
}

function openBottomSheet() {
  const today = new Date();
  document.getElementById('bs-date').value    = toYMD(today);
  document.getElementById('bs-tr-date').value = toYMD(today);
  document.getElementById('bs-sheet').classList.add('open');
  document.getElementById('bs-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  // 金額欄にフォーカス
  setTimeout(() => document.getElementById('bs-amt')?.focus(), 350);
}

function closeBottomSheet() {
  document.getElementById('bs-sheet').classList.remove('open');
  document.getElementById('bs-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function setBsType(type, el) {
  S.type = type;
  bsType = type;
  el.closest('.bs-tog3').querySelectorAll('.bs-tbtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('bs-normal').style.display   = type === 'transfer' ? 'none' : 'block';
  document.getElementById('bs-transfer').style.display = type === 'transfer' ? 'block' : 'none';

  // 科目分類を type に基づいて更新
  if (type !== 'transfer') {
    const bsCls = document.getElementById('bs-cls');
    if (bsCls) {
      const classifications = [...new Set(S.categories.filter(c => c.type === type).map(c => c.classification))];
      bsCls.innerHTML = classifications.map((cls, idx) => `<option value="${escapeHtml(cls)}" ${idx===0 ? 'selected' : ''}>${escapeHtml(cls)}</option>`).join('');
      updateBsCategories();
    }
  }
}

function setBsAcct(acct, el) {
  bsAcct = acct;
  el.closest('.bs-tog2').querySelectorAll('.bs-abtn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
}

async function addTxFromSheet() {
  let t;
  if (bsType === 'transfer') {
    const amount = parseInt(document.getElementById('bs-tr-amt').value);
    const from   = document.getElementById('bs-tr-from').value;
    const to     = document.getElementById('bs-tr-to').value;
    const date   = document.getElementById('bs-tr-date').value;
    const desc   = document.getElementById('bs-tr-desc').value.trim() ||
                   `${from === 'cash' ? '現金' : '銀行'}→${to === 'cash' ? '現金' : '銀行'}`;
    if (!amount || amount <= 0) { toast('金額を入力してください'); return; }
    if (!date)                  { toast('日付を入力してください'); return; }
    if (from === to)            { toast('移動元と移動先が同じです'); return; }
    t = { id: nid++, date, type: 'transfer', acct: from, toAcct: to, amount, desc, cat: '振替', note: '' };
    S.txs.push(t);
    document.getElementById('bs-tr-amt').value  = '';
    document.getElementById('bs-tr-desc').value = '';
  } else {
    const amount = parseInt(document.getElementById('bs-amt').value);
    const desc   = document.getElementById('bs-desc').value.trim();
    const date   = document.getElementById('bs-date').value;
    const classification = document.getElementById('bs-cls').value;
    const cat    = document.getElementById('bs-cat').value;
    const note   = document.getElementById('bs-note').value.trim();
    if (!amount || amount <= 0) { toast('金額を入力してください'); return; }
    if (!desc)                  { toast('摘要を入力してください'); return; }
    if (!date)                  { toast('日付を入力してください'); return; }
    t = { id: nid++, date, type: bsType, acct: bsAcct, amount, desc, classification, cat, note };
    S.txs.push(t);
    document.getElementById('bs-amt').value  = '';
    document.getElementById('bs-desc').value = '';
    document.getElementById('bs-note').value = '';
  }
  closeBottomSheet();
  toast('追加しました ✓');
  render();
  await saveSheet(() => sheetsAppend(SH.TX, [txToRow(t)]));
}

/* PCフィルタとSPフィルタの両方を見て、両方のリストに反映する */
function renderTx() {
  // PCフィルタ
  const fa = document.getElementById('f-acct')?.value || '';
  const ft = document.getElementById('f-type')?.value || '';
  // SPフィルタ（存在する場合）
  const faSp = document.getElementById('f-acct-sp')?.value || '';
  const ftSp = document.getElementById('f-type-sp')?.value || '';

  const filterAcct = fa || faSp;
  const filterType = ft || ftSp;

  let txs = [...S.txs].sort((a, b) => b.date.localeCompare(a.date));
  if (filterAcct) txs = txs.filter(t => t.acct === filterAcct || (t.type === 'transfer' && t.toAcct === filterAcct));
  if (filterType) txs = txs.filter(t => t.type === filterType);

  const html = txs.length === 0
    ? '<div class="empty">取引がありません</div>'
    : txs.map(txRow).join('');

  const pcList = document.getElementById('tx-list');
  const spList = document.getElementById('tx-list-sp');
  if (pcList) pcList.innerHTML = html;
  if (spList) spList.innerHTML = html;
}

Object.assign(CLICK_ACTIONS, {
  setType: (el) => setType(el.dataset.type),
  setAcct: (el) => setAcct(el.dataset.acct),
  setBsType: (el) => setBsType(el.dataset.type, el),
  setBsAcct: (el) => setBsAcct(el.dataset.acct, el),
  setEtxType: (el) => setEtxType(el.dataset.type, el),
  showLedger: (el) => showLedger(el.dataset.ledger),
  openEditTx: (el) => openEditTx(Number(el.dataset.id)),
  delTx: (el) => delTx(Number(el.dataset.id)),
  deleteEditedTx: () => {
    delTx(parseInt(document.getElementById('etx-id').value));
    closeM('m-edit-tx');
  },
});

INPUT_ACTIONS.mirrorInput = (el) => {
  document.getElementById(el.dataset.mirrorTarget).value = el.value;
};

/* スワイプで閉じる（任意） */
(function initSwipeClose() {
  let startY = 0;
  const sheet = document.getElementById('bs-sheet');
  if (!sheet) return;
  sheet.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) closeBottomSheet();
  }, { passive: true });
})();
