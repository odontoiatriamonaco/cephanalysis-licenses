/**
 * CephAnalysis Pro — License Check v3.0 (2026-03-18)
 * Da includere in index.html PRIMA di ceph-core.js
 *
 * Logica PC per tipo licenza:
 *   trial    → 1 PC  (bloccato al primo utilizzo)
 *   standard → 1 PC  (bloccato al primo utilizzo)
 *   pro      → 3 PC  (modificabile dal pannello, default 3)
 *   lifetime → ∞ PC  (nessun blocco)
 *   group    → N PC  (definito da maxDevices)
 */

(function() {
  'use strict';

  const LICENSE_URL  = 'https://raw.githubusercontent.com/odontoiatriamonaco/cephanalysis-licenses/main/ceph-licenses.json';
  const REGISTER_URL = 'https://cephanalysis-licenses.vercel.app/api/register-device';
  const LS_KEY       = 'ceph_license_key';
  const LS_CACHE     = 'ceph_license_cache';
  const LS_BROWSER   = 'ceph_browser_id';
  const CHECK_EVERY  = 24 * 60 * 60 * 1000; // 24h

  // ── BROWSER ID ────────────────────────────────────────────────────────────
  function getBrowserId() {
    let id = localStorage.getItem(LS_BROWSER);
    if (!id) {
      id = 'bx-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(LS_BROWSER, id);
    }
    return id;
  }

  function safeJSON(str) { try { return JSON.parse(str); } catch { return null; } }

  // ── MAX DEVICES PER TIPO ──────────────────────────────────────────────────
  function getMaxDevices(lic) {
    if (lic.type === 'lifetime') return Infinity;
    if (lic.type === 'group')    return lic.maxDevices || 10;
    if (lic.type === 'pro')      return lic.maxDevices || 3;
    return 1; // trial, standard
  }

  // ── FETCH JSON LICENZE ────────────────────────────────────────────────────
  async function fetchLicenses() {
    const res = await fetch(LICENSE_URL + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // ── REGISTRA DISPOSITIVO via Vercel Function ──────────────────────────────
  // Chiama /api/register-device che aggiorna il JSON su GitHub server-side
  async function registerDevice(key, browserId) {
    try {
      const res = await fetch(REGISTER_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key, browserId })
      });
      if (!res.ok) console.warn('[CephLicense] Registrazione fallita:', res.status);
    } catch(e) {
      console.warn('[CephLicense] Registrazione offline:', e.message);
    }
  }

  // ── VALIDAZIONE ───────────────────────────────────────────────────────────
  async function validateLicense(key) {
    const browserId = getBrowserId();

    try {
      const data = await fetchLicenses();
      const lic  = data.licenses[key];

      if (!lic)        return { valid: false, reason: 'Chiave non trovata' };
      if (!lic.active) return { valid: false, reason: 'Licenza disattivata' };

      // Scadenza
      if (lic.expires) {
        const exp = new Date(lic.expires); exp.setHours(23, 59, 59);
        if (exp < new Date()) return {
          valid: false, expired: true,
          reason: 'Licenza scaduta il ' + lic.expires + ' — contatta lo studio per il rinnovo'
        };
      }

      const maxDevices = getMaxDevices(lic);
      const devices    = Array.isArray(lic.devices) ? lic.devices : [];

      // Lifetime → accesso libero
      if (maxDevices === Infinity) {
        localStorage.setItem(LS_CACHE, JSON.stringify({ key, lic, checkedAt: Date.now() }));
        return { valid: true, lic };
      }

      // Dispositivo già registrato → OK
      if (devices.includes(browserId)) {
        localStorage.setItem(LS_CACHE, JSON.stringify({ key, lic, checkedAt: Date.now() }));
        return { valid: true, lic, deviceCount: devices.length, maxDevices };
      }

      // Slot disponibili → registra
      if (devices.length < maxDevices) {
        registerDevice(key, browserId); // best-effort, non blocca
        // Aggiorna cache locale con il nuovo device
        const licCached = Object.assign({}, lic);
        licCached.devices = devices.concat([browserId]);
        localStorage.setItem(LS_CACHE, JSON.stringify({ key, lic: licCached, checkedAt: Date.now() }));
        return {
          valid: true, lic, newDevice: true,
          deviceCount: devices.length + 1, maxDevices
        };
      }

      // Slot esauriti
      const typeLabel = lic.type === 'pro' ? 'Pro (' + maxDevices + ' PC)' : 'gruppo (' + maxDevices + ' PC)';
      return {
        valid: false,
        reason: 'Licenza ' + typeLabel + ' esaurita — tutti i ' + maxDevices + ' PC autorizzati sono già attivi.\nContatta lo studio per aggiungere dispositivi.'
      };

    } catch (err) {
      // OFFLINE: usa cache locale
      const cached = safeJSON(localStorage.getItem(LS_CACHE));
      if (cached && cached.key === key) {
        const age = Date.now() - (cached.checkedAt || 0);
        if (age < 7 * 24 * 60 * 60 * 1000) {
          console.log('[CephLicense] Offline — cache di ' + Math.round(age / 86400000) + 'gg fa');
          return { valid: true, lic: cached.lic, offline: true };
        }
      }
      return { valid: false, reason: 'Impossibile verificare la licenza (offline da >7 giorni)' };
    }
  }

  // ── MODAL ATTIVAZIONE ─────────────────────────────────────────────────────
  function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'ceph-license-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#06080f;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Outfit,system-ui,sans-serif;';
    overlay.innerHTML = `
      <div style="background:#0c1120;border:1px solid rgba(139,92,246,.3);border-radius:16px;padding:2.5rem;width:420px;max-width:92vw;text-align:center;box-shadow:0 0 80px rgba(139,92,246,.1);">
        <div style="font-size:2.5rem;margin-bottom:.75rem">🧠</div>
        <h1 style="color:#e4e7ed;font-size:1.3rem;font-weight:700;margin-bottom:.25rem">CephAnalysis Pro</h1>
        <p style="color:#475569;font-size:.8rem;margin-bottom:2rem">Inserisci la chiave di licenza per continuare</p>
        <input id="ceph-lic-input" placeholder="CEPH-XXXX-XXXX-XXXX"
          style="width:100%;padding:.75rem 1rem;background:rgba(255,255,255,.05);border:1px solid rgba(139,92,246,.2);border-radius:8px;color:#e4e7ed;font-family:'JetBrains Mono',monospace;font-size:1rem;letter-spacing:.06em;text-align:center;outline:none;margin-bottom:1.25rem;"
          autocomplete="off" spellcheck="false">
        <div id="ceph-lic-error" style="color:#ef4444;font-size:.8rem;margin-bottom:.75rem;min-height:1.6em;line-height:1.5;white-space:pre-line"></div>
        <button id="ceph-lic-btn"
          style="width:100%;padding:.75rem;background:#8b5cf6;border:none;border-radius:8px;color:white;font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit;"
          onmouseover="this.style.background='#7c3aed'" onmouseout="this.style.background='#8b5cf6'">
          Attiva Licenza
        </button>
        <p style="color:#334155;font-size:.7rem;margin-top:1.5rem;line-height:1.6">
          Non hai una chiave? Contatta lo studio.<br>
          <a href="mailto:odontoiatria.monaco@gmail.com" style="color:#8b5cf6;text-decoration:none">odontoiatria.monaco@gmail.com</a>
        </p>
      </div>`;
    document.body.appendChild(overlay);

    const input  = document.getElementById('ceph-lic-input');
    const btn    = document.getElementById('ceph-lic-btn');
    const errDiv = document.getElementById('ceph-lic-error');

    input.addEventListener('input', function() {
      let v = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (v.startsWith('CEPH')) v = v.slice(4);
      const p = ['CEPH'];
      if (v.length > 0) p.push(v.slice(0, 4));
      if (v.length > 4) p.push(v.slice(4, 8));
      if (v.length > 8) p.push(v.slice(8, 12));
      this.value = p.join('-');
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });

    btn.addEventListener('click', async function() {
      const key = input.value.trim().toUpperCase();
      if (!/^CEPH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)) {
        errDiv.textContent = 'Formato non valido — CEPH-XXXX-XXXX-XXXX'; return;
      }
      btn.textContent = '⏳ Verifica in corso…'; btn.disabled = true; errDiv.textContent = '';

      const result = await validateLicense(key);
      if (result.valid) {
        localStorage.setItem(LS_KEY, key);
        overlay.style.cssText += 'opacity:0;transition:opacity .4s;';
        setTimeout(() => overlay.remove(), 400);
        showActivationBanner(result);
      } else {
        errDiv.textContent = '❌ ' + result.reason;
        if (result.expired) {
          const a = document.createElement('a');
          a.href = 'mailto:odontoiatria.monaco@gmail.com?subject=Rinnovo%20CephAnalysis%20Pro';
          a.style.cssText = 'display:block;color:#8b5cf6;font-size:.75rem;margin-top:.4rem;text-decoration:none;';
          a.textContent = '→ La tua chiave rimane la stessa. Clicca per richiedere il rinnovo.';
          errDiv.appendChild(a);
        }
        btn.textContent = 'Riprova'; btn.disabled = false;
      }
    });
    setTimeout(() => input.focus(), 100);
  }

  // ── MODAL LICENZA SCADUTA ─────────────────────────────────────────────────
  function showExpiredModal(reason) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Outfit,system-ui,sans-serif;';
    overlay.innerHTML = `
      <div style="background:#0c1120;border:1px solid rgba(239,68,68,.4);border-radius:16px;padding:2.5rem;width:400px;max-width:92vw;text-align:center;">
        <div style="font-size:2.5rem;margin-bottom:.75rem">⏱</div>
        <h2 style="color:#f87171;font-size:1.2rem;font-weight:700;margin-bottom:.75rem">Licenza scaduta</h2>
        <p style="color:#94a3b8;font-size:.85rem;margin-bottom:1.5rem;line-height:1.6">${reason}</p>
        <a href="mailto:odontoiatria.monaco@gmail.com?subject=Rinnovo%20CephAnalysis%20Pro"
          style="display:block;padding:.75rem;background:#8b5cf6;border-radius:8px;color:white;text-decoration:none;font-weight:700;font-size:.9rem;margin-bottom:.75rem;">
          📧 Richiedi rinnovo
        </a>
        <p style="color:#475569;font-size:.72rem;line-height:1.5;">
          ✅ La tua chiave rimane la stessa — non serve una nuova.<br>
          Dopo il rinnovo riapri CephAnalysis e funzionerà automaticamente.
        </p>
      </div>`;
    document.body.appendChild(overlay);
  }

  // ── BANNER ATTIVAZIONE ────────────────────────────────────────────────────
  function showActivationBanner(result) {
    const lic    = result.lic;
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#0c1120;border:1px solid rgba(34,197,94,.3);border-radius:10px;padding:.75rem 1.25rem;color:#22c55e;font-size:.8rem;font-family:Outfit,system-ui,sans-serif;z-index:9999;animation:cephSlideIn .3s ease;max-width:340px;line-height:1.5;';
    const exp    = lic.type === 'lifetime' ? '∞ Perpetua' : lic.expires ? 'Scade: ' + lic.expires : '';
    let txt      = '✅ CephAnalysis Pro — ' + lic.studio;
    if (exp) txt += '  ' + exp;
    if (result.maxDevices && result.maxDevices !== Infinity) {
      txt += '\n🖥 ' + result.deviceCount + '/' + result.maxDevices + ' PC attivi';
    }
    if (result.newDevice) txt += ' — questo PC è stato registrato.';
    if (result.offline)   txt += '\n📶 Modalità offline.';
    banner.textContent = txt;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 5000);
  }

  // ── BANNER SCADENZA IMMINENTE ─────────────────────────────────────────────
  function showExpiryWarning(lic) {
    if (!lic.expires || lic.type === 'lifetime') return;
    const days = Math.ceil((new Date(lic.expires) - new Date()) / 86400000);
    if (days > 30 || days < 0) return;
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(245,158,11,.92);color:#000;text-align:center;padding:.5rem;font-size:.82rem;font-weight:600;font-family:Outfit,system-ui,sans-serif;z-index:9998;cursor:pointer;';
    banner.innerHTML = '⚠️ Licenza in scadenza tra <strong>' + days + ' giorni</strong> (' + lic.expires + ') — <a href="mailto:odontoiatria.monaco@gmail.com?subject=Rinnovo%20CephAnalysis%20Pro" style="color:#000;font-weight:700;">richiedi rinnovo</a> &nbsp;<span style="opacity:.6">✕</span>';
    banner.onclick = () => banner.remove();
    document.body.appendChild(banner);
  }

  // ── ENTRY POINT ───────────────────────────────────────────────────────────
  async function init() {
    if (document.readyState === 'loading') {
      await new Promise(r => document.addEventListener('DOMContentLoaded', r));
    }

    const savedKey = localStorage.getItem(LS_KEY);
    if (!savedKey) { buildModal(); return; }

    const cached    = safeJSON(localStorage.getItem(LS_CACHE));
    const lastCheck = cached ? (cached.checkedAt || 0) : 0;

    if ((Date.now() - lastCheck) > CHECK_EVERY) {
      const result = await validateLicense(savedKey);
      if (!result.valid) {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(LS_CACHE);
        result.expired ? showExpiredModal(result.reason) : buildModal();
        return;
      }
      if (result.lic && result.lic.expires) showExpiryWarning(result.lic);
    } else if (cached && cached.lic && cached.lic.expires) {
      showExpiryWarning(cached.lic);
    }
  }

  init();

  const s = document.createElement('style');
  s.textContent = '@keyframes cephSlideIn{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}';
  document.head.appendChild(s);

})();
