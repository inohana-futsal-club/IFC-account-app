/* ================================================================
   UTILITY FUNCTIONS - HTML Escaping
================================================================ */
const _ESCAPE_HTML_MAP = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => _ESCAPE_HTML_MAP[c]);
}

/* ================================================================
   UTILITY FUNCTIONS - CSS Helper Functions
================================================================ */
function getAmountClass(value, type = 'amount') {
  if (type === 'income-expense') {
    return value === 'income' ? 'text-income' : 'text-expense';
  } else if (type === 'positive-negative') {
    return value >= 0 ? 'text-income' : 'text-expense';
  }
  return '';
}

function getPaidStatusClasses(isPaid) {
  return isPaid ? 'bg-paid text-paid' : 'bg-unpaid text-unpaid';
}

/* ================================================================
   UTILITY FUNCTIONS - Fiscal Year Helpers
================================================================ */
// 会計年度は9月始まり（幹部代の準備期間である9月から新年度の収支として扱う）
function getFiscalYear(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= 9 ? year : year - 1;
}

function getFiscalYearRange(fiscalYear) {
  const months = [];
  for (let m = 9; m <= 12; m++) {
    months.push(`${fiscalYear}-${String(m).padStart(2, '0')}`);
  }
  for (let m = 1; m <= 8; m++) {
    months.push(`${fiscalYear + 1}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

function getFiscalYearLabel(fiscalYear) {
  return `${fiscalYear}年度`;
}

// 学年（入学年度の下2桁）は現在の会計年度から動的に生成する。
// 新入生の入学年度（会計年度+1）を先頭に、そこから5年分（計6学年）を並べる
function getEnteringYear() {
  return (getFiscalYear(new Date()) + 1) % 100;
}

// 学年の「新しさ」を表す値。0が最新（新入生）、値が大きいほど上級生・古い学年
function getGradeAge(grade) {
  return (getEnteringYear() - parseInt(grade, 10) + 100) % 100;
}

function getGradeOptions() {
  const baseGrades = Array.from({ length: 6 }, (_, i) => String(getEnteringYear() - i).padStart(2, '0'));

  // 幹部上は基本の6学年より上級生でも現役として残るケースがあるため、
  // 該当する部員がいればその学年も追加で表示する
  const currentYm = toYM(new Date());
  const execGrades = S.members
    .filter(m => m.grade && !baseGrades.includes(m.grade) && getMemberAttrInMonth(m.id, currentYm) === 'exec')
    .map(m => m.grade);

  return [...baseGrades, ...new Set(execGrades)].sort((a, b) => getGradeAge(a) - getGradeAge(b));
}

// OB/OGの学年一覧（属性フィルターでOB/OGを選んだ時のみ学年プルダウンに使う）
function getObGradeOptions() {
  const currentYm = toYM(new Date());
  const grades = new Set(
    S.members
      .filter(m => m.grade && getMemberStatus(m.id, currentYm) === 'ob')
      .map(m => m.grade)
  );
  return Array.from(grades).sort((a, b) => getGradeAge(a) - getGradeAge(b));
}

function getAvailableFiscalYears() {
  const years = new Set();
  const today = new Date();
  const currentYear = getFiscalYear(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  years.add(currentYear);

  S.budget.records.forEach(r => {
    if (r.date) years.add(getFiscalYear(r.date));
  });
  S.budget.categoryRecords.forEach(r => {
    if (r.date) years.add(getFiscalYear(r.date));
  });
  S.txs.forEach(t => {
    if (t.date) years.add(getFiscalYear(t.date));
  });
  return Array.from(years).sort((a, b) => b - a);
}

// 会計年度の期首残高（前年度からの繰越）。carryover_recordsに登録がなければ0
function getOpeningBalance(fiscalYear) {
  const rec = S.carryoverRecords.find(r => r.fiscal_year === String(fiscalYear));
  return { cash: rec ? rec.cash : 0, bank: rec ? rec.bank : 0 };
}

function colLetter(colCount) {
  return String.fromCharCode(64 + colCount); // このアプリの全シートは列数<=26
}

const toYM   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

// ローカルタイムゾーン基準で YYYY-MM-DD を返す（toISOString()はUTCになるため使わない）
const toYMD  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const prevYM = ym => { const d=new Date(ym+'-01'); d.setMonth(d.getMonth()-1); return toYM(d); };

const fmt    = n => '¥' + Number(n).toLocaleString();

const fmtN   = n => Number(n).toLocaleString();

function focusFirstIn(modal) {
  const candidates = modal.querySelectorAll(
    'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
  );
  for (const el of candidates) {
    if (el.offsetParent !== null) { el.focus(); return; }
  }
}

function openM(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modalTriggerEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  modal.classList.add('open');
  focusFirstIn(modal);
}

function closeM(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
  if (modalTriggerEl && document.body.contains(modalTriggerEl)) modalTriggerEl.focus();
  modalTriggerEl = null;
}

Object.assign(CLICK_ACTIONS, {
  openM: (el) => openM(el.dataset.modal),
  closeM: (el) => closeM(el.dataset.modal),
});

// 学年セレクトの選択肢を動的に生成する（毎年コードを書き換えなくて済むように）
function populateGradeSelects() {
  const optionsHtml   = getGradeOptions().map(g => `<option value="${g}">${g}</option>`).join('');
  const obOptionsHtml = getObGradeOptions().map(g => `<option value="${g}">${g}</option>`).join('');

  ['ma-grade', 'me-grade'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = optionsHtml;
    if (prev) el.value = prev;  // 未選択(空)の場合は既定の先頭オプションのままにする
  });

  // 属性フィルターでOB/OGを選んでいる時だけ、学年もOB/OGの学年一覧に切り替える
  [{ gradeId: 'f-grade', attrId: 'f-attr' }, { gradeId: 'fee-f-grade', attrId: 'fee-f-attr' }].forEach(({ gradeId, attrId }) => {
    const el = document.getElementById(gradeId);
    if (!el) return;
    const isObMode = document.getElementById(attrId)?.value === 'ob';
    const prev = el.value;
    el.innerHTML = '<option value="">すべての学年</option>' + (isObMode ? obOptionsHtml : optionsHtml);
    if (prev) el.value = prev;
  });
}

function toast(msg) {
  const el = document.getElementById('toast');

  // 前のタイムアウトをクリア
  if (toastTimeout) clearTimeout(toastTimeout);

  el.textContent = msg;
  el.classList.add('show');

  toastTimeout = setTimeout(() => {
    el.classList.remove('show');
    el.textContent = '';
  }, 2200);
}

const badge     = (cls,lbl) => `<span class="bdg ${cls}">${lbl}</span>`;

const attrBadge = attr => badge(attr, ATTR_L[attr]);

const obBadge   = () => badge('ob', 'OB/OG');
