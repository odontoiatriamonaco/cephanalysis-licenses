/**
 * Vercel Function — register-device.js (2026-03-18 23:10)
 * POST /api/register-device
 * Body: { key: "CEPH-XXXX-XXXX-XXXX", browserId: "bx-..." }
 *
 * Aggiorna ceph-licenses.json su GitHub aggiungendo il browserId
 * all'array devices della licenza specificata.
 *
 * Variabili d'ambiente Vercel richieste:
 *   GITHUB_TOKEN  — Personal Access Token con permesso repo
 *   GITHUB_OWNER  — es. odontoiatriamonaco
 *   GITHUB_REPO   — es. cephanalysis-licenses
 *   GITHUB_FILE   — es. ceph-licenses.json
 */

const GITHUB_API = 'https://api.github.com';

export default async function handler(req, res) {
  // CORS — CephAnalysis può essere su qualsiasi dominio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { key, browserId } = req.body || {};
  if (!key || !browserId)  return res.status(400).json({ error: 'key e browserId richiesti' });

  // Valida formato chiave
  if (!/^CEPH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
    return res.status(400).json({ error: 'Formato chiave non valido' });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'odontoiatriamonaco';
  const repo  = process.env.GITHUB_REPO  || 'cephanalysis-licenses';
  const file  = process.env.GITHUB_FILE  || 'ceph-licenses.json';

  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN non configurato' });

  const url     = `${GITHUB_API}/repos/${owner}/${repo}/contents/${file}`;
  const headers = {
    'Authorization': `token ${token}`,
    'Accept':        'application/vnd.github.v3+json',
    'Content-Type':  'application/json'
  };

  try {
    // 1. Leggi file attuale
    const getRes  = await fetch(url, { headers });
    const getData = await getRes.json();
    if (!getRes.ok) return res.status(500).json({ error: 'Errore lettura GitHub: ' + getData.message });

    const sha      = getData.sha;
    const licenses = JSON.parse(Buffer.from(getData.content, 'base64').toString('utf8'));
    const lic      = licenses.licenses[key];

    if (!lic)        return res.status(404).json({ error: 'Chiave non trovata' });
    if (!lic.active) return res.status(403).json({ error: 'Licenza disattivata' });

    // 2. Controlla se già registrato
    const devices    = Array.isArray(lic.devices) ? lic.devices : [];
    const maxDevices = lic.maxDevices || (lic.type === 'pro' ? 3 : lic.type === 'group' ? 10 : 1);

    if (devices.includes(browserId)) {
      // Già registrato — aggiorna solo lastDeviceAt
      lic.lastDeviceAt = new Date().toISOString();
    } else if (devices.length >= maxDevices) {
      return res.status(403).json({
        error: 'Slot esauriti',
        current: devices.length,
        max: maxDevices
      });
    } else {
      // Nuovo dispositivo
      devices.push(browserId);
      lic.devices      = devices;
      lic.lastDeviceAt = new Date().toISOString();
      // Per licenze standard/trial salva anche browserId per retrocompatibilità
      if (lic.type === 'standard' || lic.type === 'trial') {
        lic.browserId   = browserId;
        lic.activatedAt = lic.activatedAt || new Date().toISOString();
      }
    }

    licenses._updated = new Date().toISOString().split('T')[0];

    // 3. Salva su GitHub
    const content = Buffer.from(JSON.stringify(licenses, null, 2)).toString('base64');
    const putRes  = await fetch(url, {
      method:  'PUT',
      headers,
      body: JSON.stringify({
        message: `Auto-registrazione PC: ${key} (${browserId.substring(0,12)})`,
        content,
        sha
      })
    });
    const putData = await putRes.json();
    if (!putRes.ok) return res.status(500).json({ error: 'Errore salvataggio: ' + putData.message });

    return res.status(200).json({
      success:     true,
      deviceCount: lic.devices.length,
      maxDevices
    });

  } catch (err) {
    console.error('[register-device] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
