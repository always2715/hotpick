// 텔레그램 자동 게시 API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { keyword, summary, rank, slug, type } = req.body;

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;

  if (!BOT_TOKEN || !CHANNEL_ID) {
    return res.status(400).json({ error: 'Telegram not configured' });
  }

  try {
    let message = '';

    if (type === 'top10') {
      // TOP 10 정기 업데이트
      const { trends } = req.body;
      message = `📊 *실시간 검색순위 TOP 10*\n\n`;
      (trends || []).slice(0, 10).forEach((t, i) => {
        const badge = i === 0 ? '🔥' : i < 3 ? '⭐' : '·';
        message += `${badge} ${i+1}위 ${t.topTitle || t.displayTitle || t.keyword}\n`;
      });
      message += `\n🔗 [전체 TOP 20 보기](https://stellate.co.kr)`;
    } else {
      // 개별 키워드 알림
      const emoji = rank <= 3 ? '🔥' : '📈';
      message = `${emoji} *${rank}위 진입*\n\n*${keyword}*\n\n${summary || ''}\n\n🔗 [자세히 보기](https://stellate.co.kr/${slug})\n\n#실시간트렌드 #STELLATE`;
    }

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }),
      }
    );

    const data = await response.json();
    if (data.ok) {
      return res.status(200).json({ success: true, messageId: data.result.message_id });
    }
    return res.status(500).json({ success: false, error: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
