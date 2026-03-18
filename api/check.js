const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data: subscriptions, error: dbError } = await supabase
    .from('subscriptions')
    .select('*');

  if (dbError) {
    return res.status(500).json({ error: 'Could not fetch subscriptions' });
  }

  let checked = 0, notified = 0;

  for (const sub of subscriptions || []) {
    try {
      const response = await fetch(sub.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobWatch/1.0)' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) continue;

      const html = await response.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50000);

      // First time seeing this URL — save snapshot, no email yet
      if (!sub.last_snapshot) {
        await supabase
          .from('subscriptions')
          .update({ last_snapshot: text })
          .eq('id', sub.id);
        checked++;
        continue;
      }

      // Page changed — send email!
      if (text !== sub.last_snapshot) {
        await resend.emails.send({
          from: process.env.NOTIFY_FROM_EMAIL,
          to: sub.email,
          subject: `🚨 New jobs may be posted at ${new URL(sub.url).hostname}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
              <h2>👀 JobWatch Alert</h2>
              <p style="color:#555;margin-bottom:24px">
                The careers page you're tracking has changed —
                there may be new job postings!
              </p>
              <a href="${sub.url}"
                 style="background:black;color:white;padding:12px 24px;
                        text-decoration:none;border-radius:6px;
                        display:inline-block;font-weight:600">
                View Careers Page →
              </a>
              <hr style="margin:32px 0;border:none;border-top:1px solid #eee"/>
              <p style="color:#aaa;font-size:12px">Tracking: ${sub.url}</p>
            </div>
          `
        });

        await supabase
          .from('subscriptions')
          .update({ last_snapshot: text })
          .eq('id', sub.id);

        notified++;
      }

      checked++;
    } catch (err) {
      console.error(`Error checking ${sub.url}:`, err);
    }
  }

  return res.status(200).json({ checked, notified, timestamp: new Date().toISOString() });
};
