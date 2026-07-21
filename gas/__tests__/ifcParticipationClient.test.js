const {
  validateYearMonth,
  buildParticipationUrl,
  fetchParticipation,
} = require('../src/ifcParticipationClient');

describe('validateYearMonth', () => {
  test('"YYYY/MM"形式は許可される', () => {
    expect(validateYearMonth('2026/07')).toBeNull();
  });

  test('不正な形式はエラーを返す', () => {
    expect(validateYearMonth('2026-07')).toEqual({
      success: false,
      message: "yearMonthは 'YYYY/MM' 形式で指定してください",
    });
  });
});

describe('buildParticipationUrl', () => {
  test('ベースURL・yearMonth・categoryからURLを組み立てる', () => {
    const url = buildParticipationUrl('https://example.a.run.app/', '2026/07', 'women');
    expect(url).toBe('https://example.a.run.app/api/external/participation?yearMonth=2026%2F07&category=women');
  });

  test('categoryを省略するとmenになる', () => {
    const url = buildParticipationUrl('https://example.a.run.app', '2026/07');
    expect(url).toContain('category=men');
  });
});

describe('fetchParticipation', () => {
  const baseArgs = { baseUrl: 'https://example.a.run.app', apiKey: 'secret', yearMonth: '2026/07', category: 'men' };

  test('正常系: 200でmemberParticipationCountsを返す', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({
        success: true,
        memberParticipationCounts: { '田中': 3, '佐藤': 1 },
        yearMonth: '2026/07',
        category: 'men',
      }),
    });

    const result = await fetchParticipation({ ...baseArgs, fetcher, timeoutMs: 1000 });

    expect(result.success).toBe(true);
    expect(result.memberParticipationCounts).toEqual({ '田中': 3, '佐藤': 1 });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/api/external/participation'),
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } })
    );
  });

  test('401: APIキー不一致・未指定のエラーがそのまま伝わる', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      status: 401,
      body: JSON.stringify({ success: false, message: '認証に失敗しました' }),
    });

    const result = await fetchParticipation({ ...baseArgs, fetcher, timeoutMs: 1000 });

    expect(result).toEqual({ success: false, status: 401, message: '認証に失敗しました' });
  });

  test('400: yearMonth形式が不正な場合はfetcherを呼ばずに即エラーを返す', async () => {
    const fetcher = jest.fn();

    const result = await fetchParticipation({ ...baseArgs, yearMonth: '2026-07', fetcher, timeoutMs: 1000 });

    expect(result.success).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  test('400: IFC側がyearMonth形式エラーを返すケースもそのまま伝わる', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      status: 400,
      body: JSON.stringify({ success: false, message: "yearMonthは 'YYYY/MM' 形式で指定してください" }),
    });

    const result = await fetchParticipation({ ...baseArgs, fetcher, timeoutMs: 1000 });

    expect(result).toEqual({ success: false, status: 400, message: "yearMonthは 'YYYY/MM' 形式で指定してください" });
  });

  test('タイムアウト: timeoutMsより応答が遅い場合はtimeout扱いになる', async () => {
    const fetcher = jest.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve({
        status: 200,
        body: JSON.stringify({ success: true, memberParticipationCounts: {} }),
      }), 500);
    }));

    const result = await fetchParticipation({ ...baseArgs, fetcher, timeoutMs: 50 });

    expect(result).toEqual({
      success: false,
      status: 'timeout',
      message: 'IFC参加日数APIへの接続がタイムアウトしました',
    });
  });
});
