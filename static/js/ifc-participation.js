/* ================================================================
   IFC参加日数API 連携
   このアプリ専用のGAS Webアプリ(プロキシ)経由でIFCの参加日数を取得し、
   氏名で部員と突き合わせて練習参加回数(practice_count)に反映する。
   IFC本体・APIキーへは直接アクセスしない（詳細はgas/README.md参照）。
================================================================ */

// 全角/半角スペースや全角英数字などの表記ゆれを吸収するための正規化。
// 小書きの「ヶ/ヵ」はNFKCでは大きい「ケ/カ」に揃わないため個別に吸収する(例: 藤ヶ谷/藤ケ谷)。
// 比較専用であり、表示用の氏名はそのまま使う。
function normalizeMemberName(name) {
  if (name == null) return '';
  return String(name).normalize('NFKC').replace(/\s+/g, '').replace(/ヶ/g, 'ケ').replace(/ヵ/g, 'カ');
}

// IFCのレスポンスを部員1人ごとの配列に揃える。
// members配列(姓・名付き)があればそれを使い、無い旧形式では
// memberParticipationCounts(表示名→参加日数)から組み立てる。
function toIfcParticipationEntries(result) {
  if (Array.isArray(result.members)) return result.members;
  return Object.entries(result.memberParticipationCounts || {}).map(
    ([displayName, count]) => ({ displayName, participationCount: count })
  );
}

// IFCから返る部員一覧を現在の部員名簿(S.members)と氏名で突き合わせる。
// IFC側で姓・名が入力済みなら「姓＋名」のフルネームで、未入力なら表示名で照合する
// (名簿のnameは「姓 名」形式のため、表示名(苗字だけ等)は通常一致しない)。
// 同じ正規化結果になる部員が複数いる場合は誤反映を避けるためambiguousに回す。
function matchIfcParticipationToMembers(entries) {
  const normalizedToMembers = {};
  S.members.forEach(m => {
    const key = normalizeMemberName(m.name);
    if (!key) return;
    (normalizedToMembers[key] = normalizedToMembers[key] || []).push(m);
  });

  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  (entries || []).forEach(entry => {
    const fullNameKey = normalizeMemberName(`${entry.lastName || ''}${entry.firstName || ''}`);
    const key = fullNameKey || normalizeMemberName(entry.displayName);
    const label = entry.displayName || `${entry.lastName || ''} ${entry.firstName || ''}`.trim();
    const candidates = (key && normalizedToMembers[key]) || [];
    if (candidates.length === 1) matched.push({ member: candidates[0], count: Number(entry.participationCount) || 0 });
    else if (candidates.length === 0) unmatched.push(label);
    else ambiguous.push(label);
  });

  return { matched, unmatched, ambiguous };
}

function toIfcYearMonth(ym) {
  return ym.replace('-', '/');
}

async function fetchIfcParticipation(yearMonth, category) {
  const params = new URLSearchParams({ yearMonth, category: category || 'men' });
  if (IFC_PROXY_TOKEN) params.set('token', IFC_PROXY_TOKEN);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IFC_PROXY_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${IFC_PROXY_URL}?${params}`, { signal: controller.signal });
  } catch (e) {
    return { success: false, message: e.name === 'AbortError' ? 'IFCとの通信がタイムアウトしました' : 'IFCとの通信に失敗しました' };
  } finally {
    clearTimeout(timer);
  }

  try {
    return await res.json();
  } catch (e) {
    return { success: false, message: 'IFCから不正な応答がありました' };
  }
}

async function importIfcParticipation(el) {
  if (!IFC_PROXY_URL) {
    toast('IFC連携が未設定です(config.jsのIFC_PROXY_URLを設定してください)');
    return;
  }

  const ym = document.getElementById('fee-month')?.value;
  if (!ym) { toast('対象月を選択してください'); return; }
  const category = document.getElementById('ifc-category')?.value || 'men';

  if (el) el.disabled = true;
  try {
    const result = await fetchIfcParticipation(toIfcYearMonth(ym), category);
    if (!result.success) {
      toast(`IFCからの取得に失敗しました: ${result.message || '不明なエラー'}`);
      return;
    }

    const { matched, unmatched, ambiguous } = matchIfcParticipationToMembers(toIfcParticipationEntries(result));
    for (const { member, count } of matched) {
      await setPrac(member.id, ym, count);
    }

    const parts = [`${matched.length}件反映`];
    if (unmatched.length) parts.push(`未一致${unmatched.length}件(${unmatched.join('、')})`);
    if (ambiguous.length) parts.push(`氏名重複${ambiguous.length}件(${ambiguous.join('、')})`);
    // 氏名一覧が入ると読むのに時間がかかるため、通常のトースト(2.2秒)より長く表示する
    toast(`IFC参加日数: ${parts.join(' / ')}`, 6000);
  } finally {
    if (el) el.disabled = false;
  }
}

CLICK_ACTIONS.importIfcParticipation = (el) => importIfcParticipation(el);
