/* ================================================================
   DASHBOARD
================================================================ */
function renderDash() {
  const { cash, bank } = calcBal();
  let ym = toYM(new Date());
  const range = getFiscalYearRange(currentFiscalYear);

  // 当月が会計年度外なら会計年度内の最初の月を使用
  if (!range.includes(ym)) {
    ym = range[0];
  }

  let inc=0,exp=0,ci=0,co=0,bi=0,bo=0;
  S.txs.forEach(t => {
    if (!t.date || !t.date.startsWith(ym)) return;
    // 会計年度フィルタ追加
    if (!range.some(m => t.date.startsWith(m))) return;
    if (t.type==='income')  { inc+=t.amount; t.acct==='cash'?ci+=t.amount:bi+=t.amount; }
    if (t.type==='expense') { exp+=t.amount; t.acct==='cash'?co+=t.amount:bo+=t.amount; }
  });

  document.getElementById('dash-sg').innerHTML = `
    <div class="sc"><div class="lb"><span class="dot" style="background:var(--csh)"></span>現金残高</div><div class="vl text-income">${fmt(cash)}</div></div>
    <div class="sc"><div class="lb"><span class="dot" style="background:var(--bnk)"></span>銀行残高</div><div class="vl" style="color:var(--bnk)">${fmt(bank)}</div></div>
    <div class="sc"><div class="lb">今月収入</div><div class="vl text-income">${fmt(inc)}</div></div>
    <div class="sc"><div class="lb">今月支出</div><div class="vl text-expense">${fmt(exp)}</div></div>`;

  document.getElementById('acct-bd').innerHTML = `
    <div>
      <div class="text-sm font-semibold mb-7 flex flex-gap-5" style="color:var(--csh);align-items:center">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--csh);display:inline-block"></span>現金
      </div>
      <div class="flex flex-between text-sm p-4-0 border-b"><span class="text-secondary-color">収入</span><span class="text-income number-mono">${fmt(ci)}</span></div>
      <div class="flex flex-between text-sm p-4-0"><span class="text-secondary-color">支出</span><span class="text-expense number-mono">${fmt(co)}</span></div>
    </div>
    <div>
      <div class="text-sm font-semibold mb-7 flex flex-gap-5" style="color:var(--bnk);align-items:center">
        <span style="width:7px;height:7px;border-radius:50%;background:var(--bnk);display:inline-block"></span>銀行預金
      </div>
      <div class="flex flex-between text-sm p-4-0 border-b"><span class="text-secondary-color">収入</span><span class="text-income number-mono">${fmt(bi)}</span></div>
      <div class="flex flex-between text-sm p-4-0"><span class="text-secondary-color">支出</span><span class="text-expense number-mono">${fmt(bo)}</span></div>
    </div>`;

  const fym = document.getElementById('fee-month')?.value || ym;
  const rec = S.feeRec[fym] || {};
  // 退部済み部員を分母・分子から除外するため、その月に在籍している部員に限定する
  const activeMembers = S.members.filter(m => getMemberAttrInMonth(m.id, fym) !== null);
  const tot = activeMembers.length;
  const paid = activeMembers.filter(m => rec[m.id]).length;
  const pct  = tot>0 ? Math.round(paid/tot*100) : 0;
  document.getElementById('fee-dash-text').textContent = `${paid}名 / ${tot}名 納入済み（${pct}%）`;
  document.getElementById('fee-prog').style.width = pct + '%';

  const recent = [...S.txs].sort((a,b) => b.date.localeCompare(a.date)).slice(0,5);
  document.getElementById('recent-list').innerHTML = recent.length===0
    ? '<div class="empty">まだ取引がありません</div>'
    : recent.map(txRow).join('');
}
