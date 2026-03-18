const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { email, url } = req.body;

  if (!email || !url) {
    return res.status(400).json({ error: 'Missing email or URL' });
  }

  const { error } = await supabase
    .from('subscriptions')
    .insert({ email, url });

  if (error) {
    console.error('Supabase error:', error);
    return res.status(500).json({ error: 'Could not save to database' });
  }

  return res.status(200).json({ ok: true });
};
