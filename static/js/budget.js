function budgetRecordToRow(r) {
  return [r.id, r.date, r.court_name, r.court_condition, r.hours, r.price_per_hour, r.amount, r.remarks||''];
}

function budgetSettingToRow(s) {
  return [s.id, s.court_name, s.court_condition, s.price_per_hour, s.remarks||''];
}

function budgetCategoryRecordToRow(r) {
  return [r.id, r.date, r.type || 'expense', r.classification, r.category, r.amount, r.remarks || ''];
}

/* ================================================================
   BUDGET MANAGEMENT
================================================================ */
function openBudgetSettingsModal() {
  renderBudgetSettingsList();
  document.getElementById('budget-court-name').value = '';
  document.getElementById('budget-court-condition').value = '';
  document.getElementById('budget-price-per-hour').value = '';
  document.getElementById('budget-court-remarks').value = '';
  openM('m-budget-settings');
}

function openBudgetRecordModal(recordId = null) {
  editingBudgetRecordId = recordId;

  const titleEl = document.getElementById('budget-record-modal-title');
  const submitBtn = document.getElementById('budget-record-submit-btn');
  const courtSelect = document.getElementById('budget-record-court');

  if (S.budget.settings.length === 0) {
    toast('コート代設定がありません。先に設定を追加してください。');
    return;
  }
  // 選択肢の再構築はvalue設定より先に行う（後で作り直すと選択状態が失われるため）
  courtSelect.innerHTML = S.budget.settings.map((s, idx) =>
    `<option value="${idx}">${escapeHtml(s.court_name)} (${escapeHtml(s.court_condition)})</option>`
  ).join('');

  if (recordId) {
    const record = S.budget.records.find(r => r.id === recordId);
    if (!record) return;

    titleEl.textContent = '予算を編集';
    submitBtn.textContent = '保存する';

    document.getElementById('budget-record-date').value = record.date;
    document.getElementById('budget-record-hours').value = record.hours;
    document.getElementById('budget-record-remarks').value = record.remarks;

    const settingIdx = S.budget.settings.findIndex(s =>
      s.court_name === record.court_name && s.court_condition === record.court_condition
    );
    if (settingIdx >= 0) {
      courtSelect.value = settingIdx;
    } else {
      // 対応するコート設定が削除済み。先頭のコートを誤って選んだまま保存すると
      // 別コート・別単価で上書きされてしまうため、編集自体を中止し警告する
      toast('この記録のコート設定が見つかりません（削除された可能性があります）。編集できません。');
      return;
    }
  } else {
    titleEl.textContent = '予算を追加';
    submitBtn.textContent = '追加する';

    const today = new Date();
    document.getElementById('budget-record-date').value = toYMD(today);
    document.getElementById('budget-record-hours').value = '';
    document.getElementById('budget-record-remarks').value = '';
  }

  updateBudgetCourtInfo();
  openM('m-budget-record');
}

async function addBudgetSetting() {
  const courtName = document.getElementById('budget-court-name').value.trim();
  const courtCondition = document.getElementById('budget-court-condition').value.trim();
  const pricePerHour = parseInt(document.getElementById('budget-price-per-hour').value);
  const remarks = document.getElementById('budget-court-remarks').value.trim();

  if (!courtName) { toast('コート名を入力してください'); return; }
  if (!courtCondition) { toast('条件を入力してください'); return; }
  if (!pricePerHour || pricePerHour <= 0) { toast('単価を正しく入力してください'); return; }

  const s = {
    id: nid++,
    court_name: courtName,
    court_condition: courtCondition,
    price_per_hour: pricePerHour,
    remarks: remarks
  };
  S.budget.settings.push(s);

  toast('コート設定を追加しました ✓');
  renderBudgetSettingsList();
  await saveSheet(() => sheetsAppend(SH.BUDGET_SETTINGS, [budgetSettingToRow(s)]));
}

async function deleteBudgetSetting(id) {
  if (!confirm('このコート設定を削除しますか？')) return;
  const row = S.budget.settings.findIndex(s => s.id === id) + 2;
  S.budget.settings = S.budget.settings.filter(s => s.id !== id);
  toast('削除しました');
  renderBudgetSettingsList();
  await saveSheet(() => sheetsDeleteRow(SH.BUDGET_SETTINGS, row));
}

// コート設定は追加・削除のたびに即保存されるので、モーダルの「保存」ボタンは閉じるだけでよい
function saveBudgetSettings() {
  closeM('m-budget-settings');
}

function renderBudgetSettingsList() {
  const el = document.getElementById('budget-settings-list');
  if (!el) return;

  if (S.budget.settings.length === 0) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:12px">設定がありません</div>';
    return;
  }

  el.innerHTML = S.budget.settings.map(s => `
    <div style="margin-bottom:12px;padding:10px;background:var(--sur);border-radius:6px;border:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div style="flex:1">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px">${escapeHtml(s.court_name)}</div>
          <div style="font-size:12px;color:var(--tx2);margin-bottom:4px">${escapeHtml(s.court_condition)}</div>
          <div style="font-size:13px;font-family:'DM Mono',monospace;color:var(--red);font-weight:500">¥${fmtN(s.price_per_hour)}/時間</div>
          ${s.remarks ? `<div style="font-size:11px;color:var(--tx3);margin-top:4px">${escapeHtml(s.remarks)}</div>` : ''}
        </div>
        <button class="btn bd sm" data-click-action="deleteBudgetSetting" data-id="${s.id}" style="margin-left:10px">削除</button>
      </div>
    </div>
  `).join('');
}

function updateBudgetCourtInfo() {
  const idx = parseInt(document.getElementById('budget-record-court').value);
  const setting = S.budget.settings[idx];
  if (!setting) return;

  const hours = parseFloat(document.getElementById('budget-record-hours').value) || 0;
  const amount = Math.round(hours * setting.price_per_hour);
  document.getElementById('budget-record-amount-display').textContent = fmt(amount);
}

document.addEventListener('DOMContentLoaded', () => {
  const hoursInput = document.getElementById('budget-record-hours');
  if (hoursInput) {
    hoursInput.addEventListener('input', updateBudgetCourtInfo);
  }
  const courtSelect = document.getElementById('budget-record-court');
  if (courtSelect) {
    courtSelect.addEventListener('change', updateBudgetCourtInfo);
  }

  const budgetMonth = document.getElementById('budget-month');
  if (budgetMonth && !budgetMonth.value) {
    budgetMonth.value = toYM(new Date());
  }

  const budgetCategoryMonth = document.getElementById('budget-category-month');
  if (budgetCategoryMonth && !budgetCategoryMonth.value) {
    budgetCategoryMonth.value = toYM(new Date());
  }

  const tabBtn1 = document.getElementById('tab-budget-court');
  if (tabBtn1) {
    tabBtn1.classList.add('active');
  }

  renderBudget();
});

async function addBudgetRecord() {
  const date = document.getElementById('budget-record-date').value;
  const courtIdx = parseInt(document.getElementById('budget-record-court').value);
  const hours = parseFloat(document.getElementById('budget-record-hours').value);
  const remarks = document.getElementById('budget-record-remarks').value.trim();

  if (!date) { toast('日付を入力してください'); return; }
  if (courtIdx < 0 || courtIdx >= S.budget.settings.length) { toast('コート設定を選択してください'); return; }
  if (!hours || hours <= 0) { toast('使用時間を正しく入力してください'); return; }

  const setting = S.budget.settings[courtIdx];
  const amount = Math.round(hours * setting.price_per_hour);

  let saveOp;
  if (editingBudgetRecordId) {
    const record = S.budget.records.find(r => r.id === editingBudgetRecordId);
    if (record) {
      record.date = date;
      record.court_name = setting.court_name;
      record.court_condition = setting.court_condition;
      record.hours = hours;
      record.price_per_hour = setting.price_per_hour;
      record.amount = amount;
      record.remarks = remarks;
      toast('予算を更新しました ✓');
      const row = S.budget.records.findIndex(r => r.id === editingBudgetRecordId) + 2;
      saveOp = () => sheetsUpdateRow(SH.BUDGET, row, budgetRecordToRow(record));
    }
  } else {
    const record = {
      id: nid++,
      date: date,
      court_name: setting.court_name,
      court_condition: setting.court_condition,
      hours: hours,
      price_per_hour: setting.price_per_hour,
      amount: amount,
      remarks: remarks
    };
    S.budget.records.push(record);
    toast('予算を追加しました ✓');
    saveOp = () => sheetsAppend(SH.BUDGET, [budgetRecordToRow(record)]);
  }

  closeM('m-budget-record');
  editingBudgetRecordId = null;
  renderBudget();
  if (saveOp) await saveSheet(saveOp);
}

async function deleteBudgetRecord(id) {
  if (!confirm('この予算記録を削除しますか？')) return;
  const row = S.budget.records.findIndex(r => r.id === id) + 2;
  S.budget.records = S.budget.records.filter(r => r.id !== id);
  toast('削除しました');
  renderBudget();
  await saveSheet(() => sheetsDeleteRow(SH.BUDGET, row));
}

function renderBudget() {
  renderBudgetSummary();
  if (currentBudgetTab === 'court') {
    renderCourtBudget();
  } else if (currentBudgetTab === 'category') {
    renderCategoryBudget();
  }
}

function renderBudgetSummary() {
  // 表示中のタブに対応する月を使う（コートタブの月を常に優先すると、
  // 「その他」タブで別月を選んだ時に合計と一覧の対象月がずれるため）
  const ym = currentBudgetTab === 'court'
    ? document.getElementById('budget-month')?.value
    : document.getElementById('budget-category-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);

  const courtRecords = S.budget.records.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));
  const courtTotal = courtRecords.reduce((s, r) => s + r.amount, 0);

  const categoryRecords = S.budget.categoryRecords.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));
  const categoryTotal = categoryRecords.reduce((s, r) => s + r.amount, 0);

  const grandTotal = courtTotal + categoryTotal;

  // コートタブ用
  document.getElementById('budget-court-total-court').textContent = fmt(courtTotal);
  document.getElementById('budget-category-total-court').textContent = fmt(categoryTotal);
  document.getElementById('budget-grand-total-court').textContent = fmt(grandTotal);

  // 他の科目タブ用
  document.getElementById('budget-court-total-category').textContent = fmt(courtTotal);
  document.getElementById('budget-category-total-category').textContent = fmt(categoryTotal);
  document.getElementById('budget-grand-total-category').textContent = fmt(grandTotal);
}

function renderCourtBudget() {
  const ym = document.getElementById('budget-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);
  const records = S.budget.records.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));

  const tableHtml = records.length === 0
    ? '<div class="empty">予算記録がありません</div>'
    : `<div class="card card-no-pad overflow-hidden">
        <div style="overflow-x:auto"><table class="ltbl">
          <thead><tr>
            <th>日付</th><th>コート</th><th>時間</th><th>単価</th><th class="text-right">金額</th><th></th>
          </tr></thead>
          <tbody>
            ${records.sort((a,b) => a.date.localeCompare(b.date))
              .map(r => `<tr>
                <td>${escapeHtml(r.date.slice(5))}</td>
                <td style="font-size:13px">${escapeHtml(r.court_name)}<br><span style="color:var(--tx2);font-size:11px">${escapeHtml(r.court_condition)}</span></td>
                <td>${escapeHtml(String(r.hours))}h</td>
                <td>${fmt(r.price_per_hour)}/h</td>
                <td class="text-right" style="color:var(--red);font-weight:600">${fmt(r.amount)}</td>
                <td style="white-space:nowrap"><button class="btn bs sm" data-click-action="openBudgetRecordModal" data-id="${r.id}" style="margin-right:4px">編集</button><button class="btn bd sm" data-click-action="deleteBudgetRecord" data-id="${r.id}">削除</button></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

  document.getElementById('budget-court-content').innerHTML = tableHtml;
}

function renderCategoryBudget() {
  const ym = document.getElementById('budget-category-month')?.value;
  if (!ym) return;

  const range = getFiscalYearRange(currentFiscalYear);
  const records = S.budget.categoryRecords.filter(r => r.date.startsWith(ym) && range.some(m => r.date.startsWith(m)));

  const tableHtml = records.length === 0
    ? '<div class="empty">記録がありません</div>'
    : `<div class="card card-no-pad overflow-hidden">
        <div style="overflow-x:auto"><table class="ltbl">
          <thead><tr>
            <th>日付</th><th>分類</th><th>科目</th><th class="text-right">金額</th><th></th>
          </tr></thead>
          <tbody>
            ${records.sort((a,b) => a.date.localeCompare(b.date))
              .map(r => `<tr>
                <td>${escapeHtml(r.date.slice(5))}</td>
                <td>${escapeHtml(r.classification)}</td>
                <td>${escapeHtml(r.category)}</td>
                <td class="text-right" style="color:var(--red);font-weight:600">${fmt(r.amount)}</td>
                <td style="white-space:nowrap"><button class="btn bs sm" data-click-action="openBudgetCategoryRecordModal" data-id="${r.id}" style="margin-right:4px">編集</button><button class="btn bd sm" data-click-action="deleteBudgetCategoryRecord" data-id="${r.id}">削除</button></td>
              </tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;

  document.getElementById('budget-category-content').innerHTML = tableHtml;
}

/* ================================================================
   YEARLY BUDGET VIEW (within renderBudget or separate)
================================================================ */
function switchBudgetTab(tab) {
  currentBudgetTab = tab;

  const tab1 = document.getElementById('tab-budget-court');
  const tab2 = document.getElementById('tab-budget-category');
  const content1 = document.getElementById('tab-content-court');
  const content2 = document.getElementById('tab-content-category');

  if (tab === 'court') {
    tab1?.classList.remove('bs');
    tab1?.classList.add('bp');
    tab2?.classList.remove('bp');
    tab2?.classList.add('bs');
    content1.style.display = 'block';
    content2.style.display = 'none';
  } else {
    tab1?.classList.remove('bp');
    tab1?.classList.add('bs');
    tab2?.classList.remove('bs');
    tab2?.classList.add('bp');
    content1.style.display = 'none';
    content2.style.display = 'block';
  }

  renderBudget();
}

function openBudgetCategoryRecordModal(recordId = null) {
  editingBudgetCategoryRecordId = recordId;

  const titleEl = document.getElementById('budget-cat-record-modal-title');
  const submitBtn = document.getElementById('budget-cat-submit-btn');

  if (recordId) {
    const record = S.budget.categoryRecords.find(r => r.id === recordId);
    if (!record) return;

    titleEl.textContent = '他の科目を編集';
    submitBtn.textContent = '保存する';

    budgetCategoryType = record.type || 'income';
    document.getElementById('budget-cat-date').value = record.date;
    document.getElementById('budget-cat-amount').value = record.amount;
    document.getElementById('budget-cat-remarks').value = record.remarks || '';
  } else {
    titleEl.textContent = '他の科目を追加';
    submitBtn.textContent = '追加';

    budgetCategoryType = 'income';
    const today = new Date();
    document.getElementById('budget-cat-date').value = toYMD(today);
    document.getElementById('budget-cat-amount').value = '';
    document.getElementById('budget-cat-remarks').value = '';
  }

  const typeButtons = document.querySelectorAll('.tbtn.income, .tbtn.expense');
  typeButtons.forEach(btn => btn.classList.remove('on'));
  if (budgetCategoryType === 'income') {
    document.getElementById('budget-cat-t-income').classList.add('on');
  } else {
    document.getElementById('budget-cat-t-expense').classList.add('on');
  }

  const classifications = [...new Set(S.categories.filter(c => c.type === budgetCategoryType).map(c => c.classification))];
  const classifySelect = document.getElementById('budget-cat-classification');
  classifySelect.innerHTML = classifications.map((c, idx) => `<option value="${escapeHtml(c)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');

  updateBudgetCategoryList();
  openM('m-budget-category-record');
}

function switchBudgetCategoryType(type) {
  budgetCategoryType = type;

  const incomeBtn = document.getElementById('budget-cat-t-income');
  const expenseBtn = document.getElementById('budget-cat-t-expense');

  if (type === 'income') {
    incomeBtn.classList.add('on');
    expenseBtn.classList.remove('on');
  } else {
    incomeBtn.classList.remove('on');
    expenseBtn.classList.add('on');
  }

  renderBudgetCategoryClassifications();
}

function renderBudgetCategoryClassifications() {
  const classifications = [...new Set(S.categories.filter(c => c.type === budgetCategoryType).map(c => c.classification))];
  const classifySelect = document.getElementById('budget-cat-classification');
  classifySelect.innerHTML = classifications.map((c, idx) => `<option value="${escapeHtml(c)}" ${idx === 0 ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
  updateBudgetCategoryList();
}

function updateBudgetCategoryList() {
  const classifyValue = document.getElementById('budget-cat-classification').value;
  const categories = S.categories.filter(c => c.type === budgetCategoryType && c.classification === classifyValue);
  const categorySelect = document.getElementById('budget-cat-category');
  categorySelect.innerHTML = categories.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}</option>`).join('');
}

async function addBudgetCategoryRecord() {
  const date = document.getElementById('budget-cat-date').value;
  const classification = document.getElementById('budget-cat-classification').value;
  const category = document.getElementById('budget-cat-category').value;
  const amount = parseInt(document.getElementById('budget-cat-amount').value);
  const remarks = document.getElementById('budget-cat-remarks').value.trim();

  if (!date) { toast('日付を入力してください'); return; }
  if (!classification || !category) { toast('科目を選択してください'); return; }
  if (!amount || amount <= 0) { toast('金額を正しく入力してください'); return; }

  let saveOp;
  if (editingBudgetCategoryRecordId) {
    const record = S.budget.categoryRecords.find(r => r.id === editingBudgetCategoryRecordId);
    if (record) {
      record.date = date;
      record.type = budgetCategoryType;
      record.classification = classification;
      record.category = category;
      record.amount = amount;
      record.remarks = remarks;
      toast('更新しました ✓');
      const row = S.budget.categoryRecords.findIndex(r => r.id === editingBudgetCategoryRecordId) + 2;
      saveOp = () => sheetsUpdateRow(SH.BUDGET_CATEGORY_RECORDS, row, budgetCategoryRecordToRow(record));
    }
  } else {
    const record = {
      id: nid++,
      date: date,
      type: budgetCategoryType,
      classification: classification,
      category: category,
      amount: amount,
      remarks: remarks
    };
    S.budget.categoryRecords.push(record);
    toast('追加しました ✓');
    saveOp = () => sheetsAppend(SH.BUDGET_CATEGORY_RECORDS, [budgetCategoryRecordToRow(record)]);
  }

  closeM('m-budget-category-record');
  editingBudgetCategoryRecordId = null;
  renderBudget();
  if (saveOp) await saveSheet(saveOp);
}

async function deleteBudgetCategoryRecord(id) {
  if (!confirm('この記録を削除しますか？')) return;
  const row = S.budget.categoryRecords.findIndex(r => r.id === id) + 2;
  S.budget.categoryRecords = S.budget.categoryRecords.filter(r => r.id !== id);
  toast('削除しました');
  renderBudget();
  await saveSheet(() => sheetsDeleteRow(SH.BUDGET_CATEGORY_RECORDS, row));
}

Object.assign(CLICK_ACTIONS, {
  switchBudgetTab: (el) => switchBudgetTab(el.dataset.tab),
  switchBudgetCategoryType: (el) => switchBudgetCategoryType(el.dataset.type),
  deleteBudgetSetting: (el) => deleteBudgetSetting(Number(el.dataset.id)),
  openBudgetRecordModal: (el) => openBudgetRecordModal(el.dataset.id !== undefined ? Number(el.dataset.id) : undefined),
  deleteBudgetRecord: (el) => deleteBudgetRecord(Number(el.dataset.id)),
  openBudgetCategoryRecordModal: (el) => openBudgetCategoryRecordModal(el.dataset.id !== undefined ? Number(el.dataset.id) : undefined),
  deleteBudgetCategoryRecord: (el) => deleteBudgetCategoryRecord(Number(el.dataset.id)),
});
