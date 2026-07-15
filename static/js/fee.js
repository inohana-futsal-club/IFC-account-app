function calcFee(attr, ym, pc) {
  const adj = S.fee.adjs.find(a => a.attr===attr && a.from<=ym && ym<=a.to);
  if (attr==='exec') {
    const per = adj ? adj.amount : S.fee.base.exec;
    const total = per * (pc||0);
    return Math.min(total, S.fee.maxExec||2500);
  }
  return adj ? adj.amount : (S.fee.base[attr]||0);
}

function feeRecToRow(r) {
  return [r.id, r.member_id, r.ym, r.paid];
}

function pracCountToRow(r) {
  return [r.id, r.member_id, r.ym, r.count];
}

// FEE_SETシートはヘッダーの次、行2〜6が固定で「基本額×4属性 + 幹部上の最大月額」、
// 行7以降がユーザーが増減する一時調整(adjs)というレイアウト。
// 固定部分は範囲更新、adjsは追加・削除それぞれ該当行だけを操作する（シート全体は洗い替えない）
function feeBaseRows() {
  const rows = [];
  let rid = 1;
  Object.entries(S.fee.base).forEach(([attr,amt]) => rows.push([rid++,attr,amt,'base','','']));
  rows.push([rid++,'exec',S.fee.maxExec,'maxExec','','']);
  return rows;
}

function adjToRow(a) {
  return [a.id, a.attr, a.amount, 'adj', a.from, a.to];
}

const FEE_SET_ADJ_START_ROW = 7; // ヘッダー(1) + 固定5行(2〜6) の次

function saveFeeBase() {
  return saveSheet(() => sheetsUpdate(`${SH.FEE_SET}!A2:F6`, feeBaseRows()));
}

/* ================================================================
   FEES
================================================================ */
function renderFee() {
  populateGradeSelects();
  let ym = document.getElementById('fee-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);
  if (!range.includes(ym)) {
    ym = range[0];
    document.getElementById('fee-month').value = ym;
  }

  if (!S.feeRec[ym]) {
    S.feeRec[ym] = {};
    S.members.forEach(m => {
      S.feeRec[ym][m.id] = false;
    });
  }
  if (!S.pracCount[ym]) S.pracCount[ym] = {};

  // フィルター値を取得
  const fa = document.getElementById('fee-f-attr')?.value  || '';
  const fg = document.getElementById('fee-f-grade')?.value || '';

  // フィルタリング
  let members = sortedMembers();
  if (fa) members = members.filter(m => {
    const attr = getMemberAttrInMonth(m.id, ym);
    return attr === fa;
  });
  if (fg) members = members.filter(m => m.grade === fg);

  const rec=S.feeRec[ym], pc=S.pracCount[ym];
  let paid=0,unpaid=0,coll=0,rem=0;
  members.forEach(m => {
    const attr = getMemberAttrInMonth(m.id, ym);

    // その月に該当する属性がない場合はスキップ（期間外）
    if (!attr) return;

    const fee = calcFee(attr, ym, pc[m.id]||0);
    if (rec[m.id]) { paid++; coll+=fee; } else { unpaid++; rem+=fee; }
  });
  document.getElementById('fp-c').textContent = paid;
  document.getElementById('fu-c').textContent = unpaid;
  document.getElementById('fc-a').textContent = fmt(coll);
  document.getElementById('fr-a').textContent = fmt(rem);

  const tb = document.getElementById('fee-tbody'); if (!tb) return;
  tb.innerHTML = members.map((m, idx) => {
    const attr = getMemberAttrInMonth(m.id, ym);

    // その月に該当する属性がない場合は表示しない（期間外）
    if (!attr) return '';

    const isPaid = !!rec[m.id];
    const fee    = calcFee(attr, ym, pc[m.id]||0);
    const pi = attr==='exec'
      ? `<input type="number" name="practice-count" class="practice-input" data-member-id="${m.id}" data-month="${ym}" min="0" max="31" value="${pc[m.id]||0}"
           style="width:40px;padding:8px;border:1px solid var(--bdr);border-radius:6px;font-size:16px;text-align:center"
           autocomplete="off"
           onchange="setPrac(${m.id},'${ym}',this.value)">`
      : `<span class="text-tertiary text-sm text-center">—</span>`;
    return `<tr>
      <td class="text-tertiary">${m.grade}<br><span class="text-amount">${escapeHtml(m.name)}</span></td>
      <td>${attrBadge(attr)}</td>
      <td class="text-center">${pi}</td>
      <td class="text-right amount-text">${fmt(fee)}</td>
      <td class="text-center">
        <button class="btn sm ${getPaidStatusClasses(isPaid)} btn-min-width"
          aria-label="${escapeHtml(m.name)}さんの部費（現在${isPaid?'納入済み':'未納'}、クリックで切り替え）"
          onclick="toggleFee(${m.id},'${ym}')">${isPaid?'✓ 済み':'✕ 未納'}</button>
      </td>
    </tr>`;
  }).join('');
  renderExecUnpaid();
}

async function setPrac(id, ym, v) {
  const count = parseInt(v)||0;
  if (!S.pracCount[ym]) S.pracCount[ym] = {};
  S.pracCount[ym][id] = count;

  if (!S.feeRec[ym]) {
    S.feeRec[ym] = {};
    sortedMembers().forEach(m => {
      S.feeRec[ym][m.id] = false;
    });
  }

  renderFee();

  const idx = S.pracCounts.findIndex(r => r.member_id === id && r.ym === ym);
  if (idx >= 0) {
    const rec = S.pracCounts[idx];
    rec.count = count;
    await saveSheet(() => sheetsUpdateRow(SH.PRAC, idx + 2, pracCountToRow(rec)));
  } else {
    const rec = { id: nid++, member_id: id, ym, count };
    S.pracCounts.push(rec);
    await saveSheet(() => sheetsAppend(SH.PRAC, [pracCountToRow(rec)]));
  }
}

async function toggleFee(id, ym) {
  if (!S.feeRec[ym]) S.feeRec[ym] = {};
  const paid = !S.feeRec[ym][id];
  S.feeRec[ym][id] = paid;
  renderFee(); renderDash();

  const idx = S.feeRecs.findIndex(r => r.member_id === id && r.ym === ym);
  if (idx >= 0) {
    const rec = S.feeRecs[idx];
    rec.paid = paid;
    await saveSheet(() => sheetsUpdateRow(SH.FEE_REC, idx + 2, feeRecToRow(rec)));
  } else {
    const rec = { id: nid++, member_id: id, ym, paid };
    S.feeRecs.push(rec);
    await saveSheet(() => sheetsAppend(SH.FEE_REC, [feeRecToRow(rec)]));
  }
}

function renderExecUnpaid() {
  const el = document.getElementById('exec-unpaid-wrap'); if (!el) return;
  const today = new Date();
  const currentYm = toYM(today);
  const execMembers = sortedMembers().filter(m => getMemberAttrInMonth(m.id, currentYm) === 'exec');
  if (execMembers.length===0) { el.innerHTML='<div class="empty">幹部上の部員がいません</div>'; return; }

  const months = [...new Set(Object.keys(S.feeRec))].sort();
  const data   = {};
  execMembers.forEach(m => {
    const unpaid = {};
    months.forEach(ym => {
      if (S.feeRec[ym]?.[m.id]===false) {
        const pc  = (S.pracCount[ym]||{})[m.id]||0;
        const fee = calcFee('exec', ym, pc);
        if (fee > 0) unpaid[ym] = fee;
      }
    });
    if (Object.keys(unpaid).length>0) data[m.id] = unpaid;
  });

  const active = execMembers.filter(m => data[m.id]);
  if (active.length===0) {
    el.innerHTML = `<div class="card"><div style="text-align:center;color:var(--grn);padding:20px;font-size:13px">✓ 未納の幹部上はいません</div></div>`;
    return;
  }

  const cols = [...new Set(active.flatMap(m => Object.keys(data[m.id])))].sort();
  const thead = `<tr><th>学年</th>${cols.map(ym=>`<th>${escapeHtml(ym)}</th>`).join('')}<th>合計</th></tr>`;
  const tbody = active.map(m => {
    let total=0;
    const cells = cols.map(ym => {
      const fee = data[m.id]?.[ym];
      if (fee!==undefined&&fee>0) { total+=fee; return `<td>${fmtN(fee)}</td>`; }
      return `<td class="text-tertiary">—</td>`;
    }).join('');
    return `<tr>
      <td class="text-tertiary">${m.grade}<br><span class="text-amount">${escapeHtml(m.name)}</span></td>
      ${cells}
      <td class="total-col">${fmtN(total)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<div class="card card-no-pad overflow-hidden">
    <div class="unp-wrap"><table class="unp-tbl min-w-full">
      <thead>${thead}</thead><tbody>${tbody}</tbody>
    </table></div></div>`;
}

/* ================================================================
   FEE SETTINGS
================================================================ */
function renderFeeView() {
  const ym = toYM(new Date());
  document.getElementById('fee-setting-view').innerHTML =
    ['male','female','manager','exec'].map(attr => {
      const adj  = S.fee.adjs.find(a => a.attr===attr && a.from<=ym && ym<=a.to);
      const base = attr==='exec' ? `${fmt(S.fee.base.exec)}/回` : fmt(S.fee.base[attr]);
      const adjHtml = adj
        ? `<div style="margin-top:4px;font-size:11px;color:var(--amb);background:var(--amb-l);padding:2px 7px;border-radius:4px">
             調整中: ${fmt(adj.amount)}${attr==='exec'?'/回':''}
           </div>` : '';
      return `<div class="fat-c">
        <div style="margin-bottom:6px">${attrBadge(attr)}</div>
        <div style="font-family:'DM Mono',monospace;font-size:16px;font-weight:500">${base}</div>
        ${attr==='exec'?'<div style="font-size:10px;color:var(--tx3)">回数×単価</div>':''}
        ${adjHtml}
      </div>`;
    }).join('');
}

function openFeeModal() {
  const b = S.fee.base;
  ['male','female','manager','exec'].forEach(k =>
    document.getElementById('fs-'+k).value = b[k]);
  document.getElementById('fs-max-exec').value = S.fee.maxExec || 2500;
  renderAdjList(); openM('m-fee');
}

async function saveFee() {
  S.fee.base = {
    male:    parseInt(document.getElementById('fs-male').value)    || 0,
    female:  parseInt(document.getElementById('fs-female').value)  || 0,
    manager: parseInt(document.getElementById('fs-manager').value) || 0,
    exec:    parseInt(document.getElementById('fs-exec').value)    || 0,
  };
  S.fee.maxExec = parseInt(document.getElementById('fs-max-exec').value) || 2500;
  closeM('m-fee'); toast('部費設定を保存しました ✓');
  render(); await saveFeeBase();
}

function renderAdjList() {
  const el = document.getElementById('adj-list'); if (!el) return;
  el.innerHTML = S.fee.adjs.length===0
    ? '<div style="color:var(--tx3);font-size:12px;margin-bottom:8px">一時調整なし</div>'
    : S.fee.adjs.map(a => `
        <div class="adj-item">
          <span>${attrBadge(a.attr)} <span style="font-family:'DM Mono',monospace;font-size:12px">${fmt(a.amount)}</span></span>
          <span class="text-xs-muted">${escapeHtml(a.from)}〜${escapeHtml(a.to)}</span>
          <button class="btn bd sm" onclick="delAdj(${a.id})">削除</button>
        </div>`).join('');
}

async function addAdj() {
  const attr   = document.getElementById('adj-attr').value;
  const amount = parseInt(document.getElementById('adj-amt').value);
  const from   = document.getElementById('adj-from').value;
  const to     = document.getElementById('adj-to').value;
  if (!amount||amount<0) { toast('金額を入力してください'); return; }
  if (!from||!to)        { toast('期間を入力してください'); return; }
  if (from>to)           { toast('開始・終了月を正しく設定してください'); return; }
  const a = { id:nid++, attr, amount, from, to };
  S.fee.adjs.push(a);
  ['adj-amt','adj-from','adj-to'].forEach(id => document.getElementById(id).value='');
  renderAdjList(); toast('一時調整を追加しました ✓');
  await saveSheet(() => sheetsAppend(SH.FEE_SET, [adjToRow(a)]));
}

async function delAdj(id) {
  const idx = S.fee.adjs.findIndex(a => a.id === id);
  if (idx < 0) return;
  const row = idx + FEE_SET_ADJ_START_ROW;
  S.fee.adjs = S.fee.adjs.filter(a => a.id!==id);
  renderAdjList(); renderFeeView(); renderFee();
  await saveSheet(() => sheetsDeleteRow(SH.FEE_SET, row));
}
