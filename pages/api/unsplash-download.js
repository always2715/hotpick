import { requireAdmin } from '../../lib/adminAuth';
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (!requireAdmin(req, res)) return;

  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  const downloadLocation = req.body?.downloadLocation;
  if (!accessKey || !downloadLocation) {
    return res.status(400).json({ success: false, error: 'Unsplash configuration or download location missing' });
  }

  try {
    const url = new URL(downloadLocation);
    if (url.protocol !== 'https:' || url.hostname !== 'api.unsplash.com' || !url.pathname.endsWith('/download')) {
      return res.status(400).json({ success: false, error: 'Invalid Unsplash download location' });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ success: false, error: 'Unsplash download tracking failed' });
    }

    return res.status(200).json({ success: true });
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid request' });
  }
}
