function getMemberAttrInMonth(memberId, ym) {
  const period = S.memberPeriods.find(p =>
    p.member_id === memberId &&
    p.start_ym <= ym &&
    (!p.end_ym || ym <= p.end_ym)
  );
  return period ? period.attr : null;
}

function getPrevMonth(ym) {
  const [year, month] = ym.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function getMemberStatus(memberId, currentYm) {
  const attr = getMemberAttrInMonth(memberId, currentYm);
  if (attr) return 'active';  // 現役

  // OB/OG判定：最後の期間の終了月が今月より前の部員
  const periods = S.memberPeriods.filter(p => p.member_id === memberId);
  if (periods.length === 0) return 'unknown';  // 期間が登録されていない

  const lastPeriod = periods.sort((a, b) => (b.end_ym || '9999').localeCompare(a.end_ym || '9999'))[0];
  if (lastPeriod.end_ym && lastPeriod.end_ym < currentYm) {
    return 'ob';  // OB/OG
  }

  return 'unknown';
}

function getMemberLastAttr(memberId) {
  const periods = S.memberPeriods.filter(p => p.member_id === memberId);
  if (periods.length === 0) return null;

  const lastPeriod = periods.sort((a, b) => (b.end_ym || b.start_ym).localeCompare(a.end_ym || a.start_ym))[0];
  return lastPeriod.attr;
}

function sortedMembers() {
  // 属性の正はmember_periods側にあるため、現時点の属性で第2ソートキーを求める
  const currentYm = toYM(new Date());
  return [...S.members].sort((a,b) => {
    const gd = getGradeAge(a.grade) - getGradeAge(b.grade);
    if (gd !== 0) return gd;
    const aOrder = ATTR_ORDER[getMemberAttrInMonth(a.id, currentYm)] ?? 99;
    const bOrder = ATTR_ORDER[getMemberAttrInMonth(b.id, currentYm)] ?? 99;
    return aOrder - bOrder;
  });
}

function memberToRow(m) {
  return [m.id, m.name, m.grade];
}

function periodToRow(p) {
  return [p.id, p.member_id, p.start_ym, p.end_ym || '', p.attr];
}

function renderMembers() {
  populateGradeSelects();
  const fa = document.getElementById('f-attr')?.value  || '';
  const fg = document.getElementById('f-grade')?.value || '';
  const today = new Date();
  const currentYm = toYM(today);

  let ms   = sortedMembers();

  // 属性でフィルター（未指定時はOB/OGを除外する。OB/OGはプルダウンで明示的に選んだ時のみ表示）
  ms = ms.filter(m => {
    const status = getMemberStatus(m.id, currentYm);
    if (fa === 'ob') return status === 'ob';
    if (status === 'ob') return false;
    if (!fa) return true;
    const attr = getMemberAttrInMonth(m.id, currentYm);
    return attr === fa;
  });

  // 学年でフィルター
  if (fg) ms = ms.filter(m => m.grade===fg);

  const tb = document.getElementById('m-tbody');
  if (!tb) return;

  tb.innerHTML = ms.length===0
    ? '<tr><td colspan="5" class="empty">部員がいません</td></tr>'
    : ms.map(m => {
        const currentAttr = getMemberAttrInMonth(m.id, currentYm);
        const status = getMemberStatus(m.id, currentYm);

        let attrDisplay;
        if (status === 'ob') {
          attrDisplay = obBadge();
        } else if (currentAttr) {
          attrDisplay = attrBadge(currentAttr);
        } else {
          attrDisplay = '<span style="color:var(--tx3)">-</span>';
        }

        return `<tr class="member-row" id="member-row-${m.id}">
          <td class="text-center"><input type="checkbox" class="member-checkbox" value="${m.id}" data-change-action="memberCheckboxChange" data-id="${m.id}"></td>
          <td class="text-center text-secondary-color">${m.grade}</td>
          <td class="font-semibold">${escapeHtml(m.name)}</td>
          <td class="text-center">${attrDisplay}</td>
          <td class="text-center"><button class="btn bs sm" data-click-action="openEdit" data-id="${m.id}">編集</button></td>
        </tr>`;
      }).join('');
  updateBulkButtons();
}

function updateMemberRowStyle(memberId) {
  const row = document.getElementById(`member-row-${memberId}`);
  const checkbox = row?.querySelector('.member-checkbox');
  if (row && checkbox?.checked) {
    row.classList.add('member-row-selected');
  } else if (row) {
    row.classList.remove('member-row-selected');
  }
}

async function addMember() {
  const firstName = document.getElementById('ma-first-name').value.trim();
  const lastName  = document.getElementById('ma-last-name').value.trim();
  const grade     = document.getElementById('ma-grade').value;
  const attr      = document.getElementById('ma-attr').value;
  const startYm   = document.getElementById('ma-start-ym').value;
  if (!firstName) { toast('姓を入力してください'); return; }
  if (!lastName)  { toast('名を入力してください'); return; }
  if (!startYm)   { toast('入部月を入力してください'); return; }
  const name = `${firstName} ${lastName}`;
  const newMemberId = nid++;
  // 属性の正はmember_periods側で持つため、member自体にはattrを持たせない
  const m = { id:newMemberId, name, grade };
  S.members.push(m);

  // 期間情報を追加
  const p = { id: nid++, member_id: newMemberId, start_ym: startYm, end_ym: '', attr: attr };
  S.memberPeriods.push(p);

  document.getElementById('ma-first-name').value = '';
  document.getElementById('ma-last-name').value = '';
  document.getElementById('ma-start-ym').value = '';
  closeM('m-add'); toast('追加しました ✓');
  render();
  await Promise.all([
    saveSheet(() => sheetsAppend(SH.MEMBERS, [memberToRow(m)])),
    saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, [periodToRow(p)])),
  ]);
}

function openEdit(id) {
  const m = S.members.find(m => m.id===id); if (!m) return;
  document.getElementById('me-id').value = id;
  const [firstName, lastName] = (m.name + ' ').split(' ');
  document.getElementById('me-first-name').value = firstName;
  document.getElementById('me-last-name').value = lastName.trim();
  document.getElementById('me-grade').value = m.grade;

  // 現在の属性を表示
  const today = new Date();
  const currentYm = toYM(today);
  const currentAttr = getMemberAttrInMonth(m.id, currentYm);
  if (currentAttr) {
    document.getElementById('me-current-attr').innerHTML = attrBadge(currentAttr);
    document.getElementById('new-period-attr').value = currentAttr;
  } else {
    document.getElementById('me-current-attr').innerHTML = '<span style="color:var(--tx3)">未設定</span>';
    document.getElementById('new-period-attr').value = 'male';
  }

  switchEditTab('basic');
  renderMemberPeriods(id);
  openM('m-edit');
}

function switchEditTab(tab) {
  const tabBasic = document.getElementById('tab-basic');
  const tabPeriods = document.getElementById('tab-periods');
  const contentBasic = document.getElementById('tab-basic-content');
  const contentPeriods = document.getElementById('tab-periods-content');

  if (tab === 'basic') {
    tabBasic?.classList.remove('bs');
    tabBasic?.classList.add('bp');
    tabPeriods?.classList.remove('bp');
    tabPeriods?.classList.add('bs');
    contentBasic.style.display = 'block';
    contentPeriods.style.display = 'none';
  } else {
    tabBasic?.classList.remove('bp');
    tabBasic?.classList.add('bs');
    tabPeriods?.classList.remove('bs');
    tabPeriods?.classList.add('bp');
    contentBasic.style.display = 'none';
    contentPeriods.style.display = 'block';
  }
}

function renderMemberPeriods(memberId) {
  const periods = S.memberPeriods.filter(p => p.member_id === memberId);
  const el = document.getElementById('periods-list');

  if (periods.length === 0) {
    el.innerHTML = '<div style="color:var(--tx3);font-size:12px;margin-bottom:12px">期間がありません</div>';
    return;
  }

  el.innerHTML = periods.map(p => `
    <div style="margin-bottom:12px;padding:10px;background:var(--sur);border-radius:6px;border:1px solid var(--bdr)">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div style="flex:1">
          <div style="font-size:12px;color:var(--tx2);margin-bottom:4px">${escapeHtml(p.start_ym)}${p.end_ym ? '〜' + escapeHtml(p.end_ym) : '〜継続中'}</div>
          <div style="font-weight:600">${ATTR_L[p.attr]}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn bs sm" data-click-action="openEditPeriod" data-id="${p.id}">編集</button>
          <button class="btn bd sm" data-click-action="deleteMemberPeriod" data-id="${p.id}">削除</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function addMemberPeriod() {
  const memberId = parseInt(document.getElementById('me-id').value);
  const startYm = document.getElementById('new-period-start').value;
  const endYm = document.getElementById('new-period-end').value;
  const attr = document.getElementById('new-period-attr').value;
  const btn = document.getElementById('new-period-btn');
  const editingPeriodId = btn.dataset.editingPeriodId ? parseInt(btn.dataset.editingPeriodId) : null;

  if (!startYm) { toast('開始月を入力してください'); return; }
  if (endYm && startYm > endYm) { toast('開始月と終了月の順序が正しくありません'); return; }

  if (editingPeriodId) {
    // 編集モード：既存期間を更新
    // 期間重複チェック（編集対象を除く）
    const overlapping = S.memberPeriods.find(p =>
      p.member_id === memberId &&
      p.id !== editingPeriodId &&
      p.start_ym <= (endYm || startYm) &&
      (!p.end_ym || p.end_ym >= startYm)
    );

    if (overlapping) {
      toast('指定された期間は既存の期間と重複しています');
      return;
    }

    const period = S.memberPeriods.find(p => p.id === editingPeriodId);
    if (period) {
      const beforeRow = periodToRow(period); // 楽観的ロック用：最後に読み込んだ時点の値
      const row = S.memberPeriods.findIndex(p => p.id === editingPeriodId) + 2;
      const unchanged = await assertRowUnchanged(SH.MEMBER_PERIODS, row, beforeRow).catch(() => true);
      if (!unchanged && !confirm('他の人がこの期間を更新しています。上書きしますか？')) {
        cancelEditPeriod();
        await loadAll();
        renderMemberPeriods(memberId);
        return;
      }
      period.start_ym = startYm;
      period.end_ym = endYm || '';
      period.attr = attr;
      toast('更新しました ✓');
      cancelEditPeriod();
      renderMemberPeriods(memberId);
      await saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(period)));
    } else {
      toast('更新しました ✓');
      cancelEditPeriod();
      renderMemberPeriods(memberId);
    }
    return;
  } else {
    // 追加モード：新しい期間を追加
    // 新しい期間の開始月より前で、終了月がない期間を自動で終了させる
    const continuingPeriods = S.memberPeriods.filter(p =>
      p.member_id === memberId &&
      p.start_ym < startYm &&
      !p.end_ym
    );

    // 期間重複チェック（自動終了される期間を除く）
    const overlapping = S.memberPeriods.find(p =>
      p.member_id === memberId &&
      !continuingPeriods.some(cp => cp.id === p.id) &&
      p.start_ym <= (endYm || startYm) &&
      (!p.end_ym || p.end_ym >= startYm)
    );

    if (overlapping) {
      toast('指定された期間は既存の期間と重複しています');
      return;
    }

    // 最後の継続中の期間を終了させる
    let closedPeriod = null;
    if (continuingPeriods.length > 0) {
      const lastContinuingPeriod = continuingPeriods.sort((a, b) => b.start_ym.localeCompare(a.start_ym))[0];
      const prevMonth = getPrevMonth(startYm);
      lastContinuingPeriod.end_ym = prevMonth;
      closedPeriod = lastContinuingPeriod;
      toast(`${ATTR_L[lastContinuingPeriod.attr]}の終了月を${prevMonth}に自動設定しました`);
    }

    const newPeriod = { id: nid++, member_id: memberId, start_ym: startYm, end_ym: endYm || '', attr: attr };
    S.memberPeriods.push(newPeriod);
    document.getElementById('new-period-start').value = '';
    document.getElementById('new-period-end').value = '';
    document.getElementById('new-period-attr').value = 'male';
    toast('期間を追加しました ✓');

    renderMemberPeriods(memberId);
    const ops = [saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, [periodToRow(newPeriod)]))];
    if (closedPeriod) {
      const closedRow = S.memberPeriods.findIndex(p => p.id === closedPeriod.id) + 2;
      ops.push(saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, closedRow, periodToRow(closedPeriod))));
    }
    await Promise.all(ops);
  }
}

async function deleteMemberPeriod(periodId) {
  if (!confirm('この期間を削除しますか？')) return;
  const memberId = parseInt(document.getElementById('me-id').value);
  const row = S.memberPeriods.findIndex(p => p.id === periodId) + 2;
  S.memberPeriods = S.memberPeriods.filter(p => p.id !== periodId);
  toast('削除しました');
  renderMemberPeriods(memberId);
  await saveSheet(() => sheetsDeleteRow(SH.MEMBER_PERIODS, row));
}

function openEditPeriod(periodId) {
  const period = S.memberPeriods.find(p => p.id === periodId);
  if (!period) return;

  // 入力欄に値を入力
  document.getElementById('new-period-start').value = period.start_ym;
  document.getElementById('new-period-end').value = period.end_ym || '';
  document.getElementById('new-period-attr').value = period.attr;

  // 編集モードに切り替え
  const btn = document.getElementById('new-period-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  btn.textContent = '保存';
  btn.dataset.editingPeriodId = periodId;
  cancelBtn.style.display = 'flex';

  // スクロールして入力欄を見やすく
  document.getElementById('new-period-start').scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.getElementById('new-period-start').focus();
}

function cancelEditPeriod() {
  // 入力欄をクリア
  document.getElementById('new-period-start').value = '';
  document.getElementById('new-period-end').value = '';
  document.getElementById('new-period-attr').value = 'male';

  // 追加モードに戻す
  const btn = document.getElementById('new-period-btn');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  btn.textContent = '期間を追加';
  delete btn.dataset.editingPeriodId;
  cancelBtn.style.display = 'none';
}

async function saveMember() {
  const id = parseInt(document.getElementById('me-id').value);
  const m  = S.members.find(m => m.id===id); if (!m) return;
  const beforeRow = memberToRow(m); // 楽観的ロック用：最後に読み込んだ時点の値
  const firstName = document.getElementById('me-first-name').value.trim();
  const lastName  = document.getElementById('me-last-name').value.trim();
  if (!firstName) { toast('姓を入力してください'); return; }
  if (!lastName)  { toast('名を入力してください'); return; }

  const row = S.members.findIndex(x => x.id === id) + 2;
  const unchanged = await assertRowUnchanged(SH.MEMBERS, row, beforeRow).catch(() => true);
  if (!unchanged && !confirm('他の人がこの部員情報を更新しています。上書きしますか？')) {
    closeM('m-edit');
    await loadAll();
    render();
    return;
  }

  m.name  = `${firstName} ${lastName}`;
  m.grade = document.getElementById('me-grade').value;
  closeM('m-edit'); toast('更新しました ✓');
  render();
  await saveSheet(() => sheetsUpdateRow(SH.MEMBERS, row, memberToRow(m)));
}

// 部員は削除せず、在籍中の期間を終了させて「退部」扱いにする
// （会計記録・練習回数等が孤児化し、部費回収率が実態と乖離するのを防ぐため）
async function deleteMember() {
  const id = parseInt(document.getElementById('me-id').value);
  const m  = S.members.find(m => m.id===id);
  const openPeriod = S.memberPeriods.find(p => p.member_id === id && !p.end_ym);
  if (!openPeriod) { toast('この部員は既に退部済みです'); return; }
  if (!confirm(`「${m?.name}」を退部にしますか？（部員情報や会計記録は保持されます）`)) return;

  const beforeRow = periodToRow(openPeriod); // 楽観的ロック用：最後に読み込んだ時点の値
  const row = S.memberPeriods.findIndex(p => p.id === openPeriod.id) + 2;
  const unchanged = await assertRowUnchanged(SH.MEMBER_PERIODS, row, beforeRow).catch(() => true);
  if (!unchanged && !confirm('他の人がこの部員の在籍期間を更新しています。上書きしますか？')) {
    closeM('m-edit');
    await loadAll();
    render();
    return;
  }

  const prevMonth = getPrevMonth(toYM(new Date()));
  openPeriod.end_ym = prevMonth;
  closeM('m-edit'); toast('退部にしました');
  render();
  await saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(openPeriod)));
}

/* ===== BULK OPERATIONS ===== */
function getSelectedMembers() {
  const checkboxes = document.querySelectorAll('.member-checkbox:checked');
  return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

function updateBulkButtons() {
  const selected = getSelectedMembers();
  const changeBtn = document.getElementById('bulk-change-btn');
  const deleteBtn = document.getElementById('bulk-delete-btn');
  if (changeBtn) changeBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
  if (deleteBtn) deleteBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';
}

function toggleSelectAll(checked) {
  document.querySelectorAll('.member-checkbox').forEach(cb => {
    cb.checked = checked;
    const memberId = parseInt(cb.value);
    updateMemberRowStyle(memberId);
  });
  updateBulkButtons();
}

function handleBulkAddFile(event) {
  const files = event.target?.files || event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file.name.toLowerCase().endsWith('.csv')) {
    toast('CSVファイルを選択してください');
    return;
  }
  readBulkAddFile(file);
}

function readBulkAddFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      document.getElementById('bulk-members-text').value = text;
      toast('CSVファイルを読み込みました ✓');
    } catch (err) {
      toast('ファイルの読み込みに失敗しました');
      console.error(err);
    }
  };
  reader.onerror = () => {
    toast('ファイルの読み込みに失敗しました');
  };
  reader.readAsText(file);
}

async function bulkAddMembers() {
  const text = document.getElementById('bulk-members-text').value.trim();
  if (!text) { toast('入力してください'); return; }
  const lines = text.split('\n').filter(l => l.trim());
  let added = 0;

  // 属性の日本語⇔英語マッピング
  const attrMap = {
    '男プレ': 'male',
    '女プレ': 'female',
    'マネージャー': 'manager',
    '幹部上': 'exec'
  };

  const today = new Date();
  const currentYm = toYM(today);
  const newMembers = [];
  const newPeriods = [];

  for (const line of lines) {
    const [firstName, lastName, grade, attrInput] = line.split(',').map(s => s.trim());
    if (!firstName || !lastName || !grade || !attrInput) {
      toast(`形式が違う行があります: ${line}`);
      return;
    }
    if (!getGradeOptions().includes(grade)) {
      toast(`学年が不正です: ${grade}`);
      return;
    }

    // 属性を日本語から英語コードに変換
    const attr = attrMap[attrInput] || attrInput;
    if (!['male','female','manager','exec'].includes(attr)) {
      toast(`属性が不正です: ${attrInput}`);
      return;
    }

    const name = `${firstName} ${lastName}`;
    const newMemberId = nid++;
    // 属性の正はmember_periods側で持つため、member自体にはattrを持たせない
    const m = { id:newMemberId, name, grade };
    S.members.push(m);
    newMembers.push(m);

    // memberPeriodsに期間を追加
    const p = { id: nid++, member_id: newMemberId, start_ym: currentYm, end_ym: '', attr: attr };
    S.memberPeriods.push(p);
    newPeriods.push(p);

    added++;
  }

  closeM('m-bulk-add');
  document.getElementById('bulk-members-text').value = '';
  toast(`${added}名追加しました ✓`);
  render();
  await Promise.all([
    saveSheet(() => sheetsAppend(SH.MEMBERS, newMembers.map(memberToRow))),
    saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, newPeriods.map(periodToRow))),
  ]);
}

function bulkChangeAttr() {
  const selected = getSelectedMembers();
  if (selected.length === 0) { toast('部員を選択してください'); return; }
  const preview = document.getElementById('bulk-change-preview');
  const names = selected.map(id => S.members.find(m => m.id===id)?.name).join(', ');
  preview.textContent = `選択中の部員: ${names}`;
  openM('m-bulk-change-attr');
}

async function confirmBulkChangeAttr() {
  const selected = getSelectedMembers();
  const newAttr = document.getElementById('bulk-change-to-attr').value;
  const startYm = document.getElementById('bulk-change-start-ym').value;

  if (!newAttr) { toast('属性を選択してください'); return; }
  if (!startYm) { toast('開始月を入力してください'); return; }

  let addedCount = 0;
  const closedPeriods = [];
  const newPeriods = [];
  selected.forEach(id => {
    // 新しい期間の開始月より前で、終了月がない期間を自動で終了させる
    const continuingPeriods = S.memberPeriods.filter(p =>
      p.member_id === id &&
      p.start_ym < startYm &&
      !p.end_ym
    );

    if (continuingPeriods.length > 0) {
      const lastContinuingPeriod = continuingPeriods.sort((a, b) => b.start_ym.localeCompare(a.start_ym))[0];
      const prevMonth = getPrevMonth(startYm);
      lastContinuingPeriod.end_ym = prevMonth;
      closedPeriods.push(lastContinuingPeriod);
    }

    // 新しい期間を追加
    const p = { id: nid++, member_id: id, start_ym: startYm, end_ym: '', attr: newAttr };
    S.memberPeriods.push(p);
    newPeriods.push(p);
    addedCount++;
  });

  closeM('m-bulk-change-attr');
  document.getElementById('bulk-change-start-ym').value = '';
  document.getElementById('bulk-change-to-attr').value = '';
  toast(`${addedCount}名の期間を追加しました ✓`);
  render();
  const ops = [saveSheet(() => sheetsAppend(SH.MEMBER_PERIODS, newPeriods.map(periodToRow)))];
  closedPeriods.forEach(cp => {
    const row = S.memberPeriods.findIndex(p => p.id === cp.id) + 2;
    ops.push(saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, row, periodToRow(cp))));
  });
  await Promise.all(ops);
}

// 部員は削除せず、在籍中の期間を終了させて「退部」扱いにする（deleteMember()と同じ方針）
async function bulkDelete() {
  const selected = getSelectedMembers();
  if (selected.length === 0) { toast('部員を選択してください'); return; }

  const prevMonth = getPrevMonth(toYM(new Date()));
  const targets = selected
    .map(id => ({ id, openPeriod: S.memberPeriods.find(p => p.member_id === id && !p.end_ym) }))
    .filter(t => t.openPeriod);
  if (targets.length === 0) { toast('選択した部員は既に退部済みです'); return; }

  const names = targets.map(t => S.members.find(m => m.id===t.id)?.name).join(', ');
  if (!confirm(`以下の${targets.length}名を退部にしますか？（部員情報や会計記録は保持されます）\n${names}`)) return;

  // 楽観的ロック：それぞれの在籍期間が最後に読み込んだ時点から変わっていないか確認
  targets.forEach(t => {
    t.row = S.memberPeriods.findIndex(p => p.id === t.openPeriod.id) + 2;
    t.beforeRow = periodToRow(t.openPeriod);
  });
  const conflicted = [];
  for (const t of targets) {
    const unchanged = await assertRowUnchanged(SH.MEMBER_PERIODS, t.row, t.beforeRow).catch(() => true);
    if (!unchanged) conflicted.push(t);
  }
  if (conflicted.length > 0) {
    const conflictNames = conflicted.map(t => S.members.find(m => m.id===t.id)?.name).join(', ');
    if (!confirm(`次の部員は他の人が在籍期間を更新しています: ${conflictNames}\nそれでも上書きしますか？`)) {
      await loadAll();
      render();
      return;
    }
  }

  targets.forEach(t => { t.openPeriod.end_ym = prevMonth; });
  toast(`${targets.length}名を退部にしました`);
  render();
  await Promise.all(targets.map(t =>
    saveSheet(() => sheetsUpdateRow(SH.MEMBER_PERIODS, t.row, periodToRow(t.openPeriod)))
  ));
}

Object.assign(CLICK_ACTIONS, {
  openEdit: (el) => openEdit(Number(el.dataset.id)),
  switchEditTab: (el) => switchEditTab(el.dataset.tab),
  openEditPeriod: (el) => openEditPeriod(Number(el.dataset.id)),
  deleteMemberPeriod: (el) => deleteMemberPeriod(Number(el.dataset.id)),
});

Object.assign(CHANGE_ACTIONS, {
  toggleSelectAll: (el) => toggleSelectAll(el.checked),
  memberCheckboxChange: (el) => {
    updateMemberRowStyle(Number(el.dataset.id));
    updateBulkButtons();
  },
  handleBulkAddFile: (el, e) => handleBulkAddFile(e),
});
