// mode: 'full'（全体編集、既定）/ 'add'（新規追加のみ）/ 'edit'（個別編集のみ）
function openCategoryModal(mode = 'full') {
  currentCatType = 'income';
  currentCatEditIndex = -1;
  categoriesEdited = JSON.parse(JSON.stringify(S.categories));
  document.getElementById('cat-type-income').classList.add('on');
  document.getElementById('cat-type-expense').classList.remove('on');
  document.getElementById('cat-add-card').style.display = mode === 'edit' ? 'none' : '';
  document.getElementById('cat-list-section').style.display = mode === 'add' ? 'none' : '';
  renderCategoriesList();
  openM('m-categories');
}

function switchCatType(type, element) {
  currentCatType = type;
  element.closest('.tog2').querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
  element.classList.add('on');
  renderCategoriesList();
}

function renderCategoriesList() {
  const cats = categoriesEdited.filter(c => c.type === currentCatType);
  const grouped = {};
  cats.forEach(c => {
    if (!grouped[c.classification]) grouped[c.classification] = [];
    grouped[c.classification].push(c);
  });

  const el = document.getElementById('categories-list');

  // 編集中の場合
  if (currentCatEditIndex >= 0) {
    const editCat = categoriesEdited[currentCatEditIndex];
    el.innerHTML = `
      <div style="padding:12px;background:var(--sur2);border-radius:8px;border:2px solid var(--grn)">
        <div style="font-weight:600;margin-bottom:12px;font-size:13px">科目を編集</div>
        <div class="fg" style="margin-bottom:12px">
          <div class="fi">
            <label class="text-sm">科目分類</label>
            <input type="text" id="edit-cat-cls" value="${escapeHtml(editCat.classification)}" class="form-control">
          </div>
          <div class="fi">
            <label class="text-sm">科目名</label>
            <input type="text" id="edit-cat-name" value="${escapeHtml(editCat.category)}" class="form-control">
          </div>
        </div>
        <div class="flex flex-gap-6">
          <button class="btn bs sm flex-1" data-click-action="cancelEditCategory">キャンセル</button>
          <button class="btn bp sm flex-1" data-click-action="saveEditCategory" data-index="${currentCatEditIndex}">保存</button>
        </div>
      </div>
    `;
    return;
  }

  el.innerHTML = Object.keys(grouped).length === 0
    ? '<div style="color:var(--tx3);font-size:12px">科目がありません</div>'
    : Object.entries(grouped).map(([cls, items]) => `
        <div style="margin-bottom:12px;padding:10px;background:var(--sur);border-radius:6px;border:1px solid var(--bdr)">
          <div style="font-weight:600;margin-bottom:8px;font-size:12px;color:var(--tx2)">${escapeHtml(cls)}</div>
          ${items.map((cat, idx) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:var(--bg);border-radius:4px;margin-bottom:4px;font-size:12px">
              <span>${escapeHtml(cat.category)}</span>
              <div class="flex flex-gap-4">
                <button class="btn bs sm btn-xs" data-click-action="editCategory" data-index="${categoriesEdited.indexOf(cat)}">編集</button>
                <button class="btn bd sm btn-xs" data-click-action="deleteCategoryByRef" data-index="${categoriesEdited.indexOf(cat)}">削除</button>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('');
}

function addCategory() {
  const cls = document.getElementById('cat-cls-input').value.trim();
  const cat = document.getElementById('cat-name-input').value.trim();

  if (!cls) { toast('科目分類を入力してください'); return; }
  if (!cat) { toast('科目名を入力してください'); return; }

  const maxOrder = Math.max(0, ...categoriesEdited.filter(c => c.type === currentCatType).map(c => c.order || 0));
  categoriesEdited.push({
    type: currentCatType,
    classification: cls,
    category: cat,
    order: maxOrder + 1
  });

  document.getElementById('cat-cls-input').value = '';
  document.getElementById('cat-name-input').value = '';
  renderCategoriesList();
  toast('科目を追加しました');
}

function deleteCategoryByRef(index) {
  const cat = categoriesEdited[index];
  if (!cat) return;
  if (!confirm(`「${cat.classification}」の「${cat.category}」を削除しますか？`)) return;
  categoriesEdited.splice(index, 1);
  renderCategoriesList();
  toast('科目を削除しました');
}

function editCategory(index) {
  currentCatEditIndex = index;
  renderCategoriesList();
}

function cancelEditCategory() {
  currentCatEditIndex = -1;
  renderCategoriesList();
}

function saveEditCategory(index) {
  const newCls = document.getElementById('edit-cat-cls').value.trim();
  const newCat = document.getElementById('edit-cat-name').value.trim();

  if (!newCls) { toast('科目分類を入力してください'); return; }
  if (!newCat) { toast('科目名を入力してください'); return; }

  categoriesEdited[index].classification = newCls;
  categoriesEdited[index].category = newCat;
  currentCatEditIndex = -1;
  renderCategoriesList();
  toast('科目を更新しました');
}

// 科目(categories)にはidが無く、並び替え時に配列順=シート行順の前提も崩れるため、
// 他エンティティのような行単位の追加・更新・削除ではなく、保存時に一括で洗い替える。
// 編集は「保存」を押すまでcategoriesEditedという作業コピー上で行われるため、
// 連打や複数タブでの同時編集さえなければ実務上のリスクは小さい。
// saveSheet()は内部でエラーを捕捉し失敗バナーで通知するため、ここでtry/catchしても
// 失敗を検知できない（常に成功トーストが出てしまう）。保存失敗の通知は
// 画面上部の失敗バナー（updateSaveFailBanner）に委ねる。
async function saveCategories() {
  const rows = categoriesEdited.map(c => [c.type, c.classification, c.category, c.order || 0]);
  await saveSheet(async () => {
    await sheetsClear(SH.CATEGORIES);
    if (rows.length > 0) {
      await sheetsAppend(SH.CATEGORIES, rows);
    }
  });
  S.categories = categoriesEdited;
  initializeCategories();
  render();
  closeM('m-categories');
  toast('科目設定を保存しました ✓');
  renderCategoriesPage();
}

/* FAB は常時表示（スクロール制御なし） */
/* ================================================================
   CATEGORIES PAGE — 科目管理画面に一覧表示
================================================================ */
function renderCategoriesPage() {
  const el = document.getElementById('categories-page-content');
  if (!el) return;

  const incCats = S.categories.filter(c => c.type === 'income');
  const expCats = S.categories.filter(c => c.type === 'expense');

  function groupHtml(cats, type) {
    if (cats.length === 0) {
      return '<div class="empty" style="padding:20px 0">科目がありません</div>';
    }
    const grouped = {};
    cats.forEach(c => {
      if (!grouped[c.classification]) grouped[c.classification] = [];
      grouped[c.classification].push(c);
    });
    return Object.entries(grouped).map(([cls, items]) => `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:var(--tx3);text-transform:uppercase;
             letter-spacing:.5px;margin-bottom:6px;padding:0 4px">${escapeHtml(cls)}</div>
        <div style="display:flex;flex-direction:column;gap:3px">
          ${items.map(cat => `
            <div class="flex flex-between card-item">
              <span class="text-base">${escapeHtml(cat.category)}</span>
              <div class="flex flex-gap-5">
                <button class="btn bs sm btn-xs-custom"
                  data-click-action="openCategoryModalWithEdit" data-type="${type}" data-cls="${escapeHtml(cls)}" data-category="${escapeHtml(cat.category)}">編集</button>
                <button class="btn bd sm btn-xs-custom"
                  data-click-action="deleteCategoryDirect" data-type="${type}" data-cls="${escapeHtml(cls)}" data-category="${escapeHtml(cat.category)}">削除</button>
              </div>
            </div>`).join('')}
        </div>
      </div>`).join('');
  }

  el.innerHTML = `
    <div class="cat-page-grid">
      <div class="card">
        <div class="flex-between-mb-14">
          <div class="flex-center-gap-8">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--grn);display:inline-block"></span>
            <span class="text-base-bold">収入科目</span>
          </div>
          <button class="btn bp sm" data-click-action="openCategoryModalForType" data-type="income">＋ 追加</button>
        </div>
        ${groupHtml(incCats, 'income')}
      </div>
      <div class="card">
        <div class="flex-between-mb-14">
          <div class="flex-center-gap-8">
            <span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></span>
            <span class="text-base-bold">支出科目</span>
          </div>
          <button class="btn bp sm" data-click-action="openCategoryModalForType" data-type="expense">＋ 追加</button>
        </div>
        ${groupHtml(expCats, 'expense')}
      </div>
    </div>`;
}

// 科目管理ページから直接削除
// saveSheet()は内部でエラーを捕捉し失敗バナーで通知するため、ここでのtry/catchは
// 機能しない（saveCategories()と同様）。
async function deleteCategoryDirect(type, cls, catName) {
  if (!confirm(`「${cls}」の「${catName}」を削除しますか？`)) return;
  S.categories = S.categories.filter(c =>
    !(c.type === type && c.classification === cls && c.category === catName));
  const rows = S.categories.map(c => [c.type, c.classification, c.category, c.order || 0]);
  await saveSheet(async () => {
    await sheetsClear(SH.CATEGORIES);
    if (rows.length > 0) await sheetsAppend(SH.CATEGORIES, rows);
  });
  initializeCategories();
  renderCategoriesPage();
  toast('科目を削除しました');
}

// 種別を指定してモーダルを開く（新規追加のみ表示）
function openCategoryModalForType(type) {
  openCategoryModal('add');
  setTimeout(() => {
    if (type === 'expense') {
      const btn = document.getElementById('cat-type-expense');
      if (btn) switchCatType('expense', btn);
    }
  }, 50);
}

// 編集状態でモーダルを開く（新規追加カードは非表示）
function openCategoryModalWithEdit(type, cls, catName) {
  openCategoryModal('edit');
  setTimeout(() => {
    if (type === 'expense') {
      const btn = document.getElementById('cat-type-expense');
      if (btn) switchCatType('expense', btn);
    }
    setTimeout(() => {
      const idx = categoriesEdited.findIndex(c =>
        c.type === type && c.classification === cls && c.category === catName);
      if (idx >= 0) editCategory(idx);
    }, 50);
  }, 50);
}

Object.assign(CLICK_ACTIONS, {
  switchCatType: (el) => switchCatType(el.dataset.type, el),
  saveEditCategory: (el) => saveEditCategory(Number(el.dataset.index)),
  editCategory: (el) => editCategory(Number(el.dataset.index)),
  deleteCategoryByRef: (el) => deleteCategoryByRef(Number(el.dataset.index)),
  openCategoryModalWithEdit: (el) => openCategoryModalWithEdit(el.dataset.type, el.dataset.cls, el.dataset.category),
  deleteCategoryDirect: (el) => deleteCategoryDirect(el.dataset.type, el.dataset.cls, el.dataset.category),
  openCategoryModalForType: (el) => openCategoryModalForType(el.dataset.type),
});
