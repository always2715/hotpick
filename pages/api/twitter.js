// 트위터 자동 게시 API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { keyword, summary, rank, slug } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  const API_KEY = process.env.TWITTER_API_KEY;
  const API_SECRET = process.env.TWITTER_API_SECRET;
  const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN;
  const ACCESS_SECRET = process.env.TWITTER_ACCESS_TOKEN_SECRET;

  if (!API_KEY || !API_SECRET || !ACCESS_TOKEN || !ACCESS_SECRET) {
    return res.status(400).json({ error: 'Twitter API keys not configured' });
  }

  try {
    // 트윗 내용 생성
    const isTop3 = rank <= 3;
    const tweetText = isTop3
      ? `🔥 실시간 ${rank}위 진입\n\n${keyword}\n\n${summary || ''}\n\n자세히 보기 👇\nstellate.co.kr/${slug}\n\n#${keyword.replace(/ /g,'')} #실시간트렌드 #STELLATE`
      : `📈 검색순위 ${rank}위\n\n${keyword}\n\n${summary || ''}\n\nstellate.co.kr/${slug}\n\n#실시간트렌드 #STELLATE`;

    // OAuth 1.0a 서명 생성
    const oauth = generateOAuth(API_KEY, API_SECRET, ACCESS_TOKEN, ACCESS_SECRET, tweetText);

    const response = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': oauth,
      },
      body: JSON.stringify({ text: tweetText }),
    });

    const data = await response.json();
    if (data.data?.id) {
      return res.status(200).json({ success: true, tweetId: data.data.id });
    }
    return res.status(500).json({ success: false, error: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

function generateOAuth(apiKey, apiSecret, accessToken, accessSecret, tweetText) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Math.random().toString(36).substring(2);

  const params = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const paramStr = Object.keys(params).sort()
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');

  const baseStr = `POST&${encodeURIComponent('https://api.twitter.com/2/tweets')}&${encodeURIComponent(paramStr)}`;
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;

  // HMAC-SHA1 서명 (Node.js crypto)
  const crypto = require('crypto');
  const signature = crypto.createHmac('sha1', signingKey).update(baseStr).digest('base64');

  params['oauth_signature'] = signature;

  const authHeader = 'OAuth ' + Object.keys(params).sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(', ');

  return authHeader;
}
