// ═══════════════════════════════════════════════════════════════════
//  SARGO GPS SYNC — pegar en consola de apps.visionblo.com/rb/
//
//  Qué hace: lee los datos GPS que WARA ya tiene cargados en pantalla
//  y los manda a la app de despacho cada 30 segundos.
//
//  Para detener: _sargoSync.detener()
//  Para forzar sync ya: _sargoSync.syncAhora()
// ═══════════════════════════════════════════════════════════════════

;(function () {

  const SUPABASE_URL = 'https://kptqhtaemrikmeubnerz.supabase.co'
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwdHFodGFlbXJpa21ldWJuZXJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0OTE2OTIsImV4cCI6MjA2MjA2NzY5Mn0.avU2YeeyZ-VtWSXm3hHKDg_1LvUos5dJ5UwCgXDCBM0'
  const INTERVALO_MS = 30_000
  const LOG = '[SARGO GPS]'

  // WARA movil_id → nombre de unidad en la app
  const WARA_MAP = {
    106966: '104',
    80128:  '106',
    105592: '107',
    139012: '110',
    80140:  '112',
    147214: '115',
    134008: '128',
    80224:  '130',
    152308: 'B101',
    105586: 'B102',
  }

  // ── Badge visual ───────────────────────────────────────────────────
  let badge, badgeTexto, badgeSub
  function crearBadge() {
    if (document.getElementById('sargo-badge')) return
    badge = document.createElement('div')
    badge.id = 'sargo-badge'
    Object.assign(badge.style, {
      position: 'fixed', bottom: '18px', right: '18px', zIndex: '99999',
      fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.6',
      padding: '8px 14px', borderRadius: '20px', color: '#fff',
      boxShadow: '0 4px 14px rgba(0,0,0,0.45)', border: '2px solid #475569',
      minWidth: '170px', textAlign: 'center', background: '#1e293b',
    })
    const titulo = document.createElement('strong')
    titulo.textContent = 'GPS SYNC · SARGO'
    badgeTexto = document.createElement('div')
    badgeSub   = document.createElement('div')
    Object.assign(badgeSub.style, { opacity: '0.65', fontSize: '10px' })
    badge.appendChild(titulo)
    badge.appendChild(badgeTexto)
    badge.appendChild(badgeSub)
    document.body.appendChild(badge)
  }
  function setBadge(estado, txt, sub) {
    if (!badge) return
    const c = { ok: ['#14532d','#16a34a'], warn: ['#78350f','#d97706'], error: ['#7f1d1d','#dc2626'], loading: ['#1e3a5f','#3b82f6'] }
    const [bg, bord] = c[estado] || c.loading
    badge.style.background  = bg
    badge.style.borderColor = bord
    badgeTexto.textContent  = txt
    badgeSub.textContent    = sub || ''
  }

  // ── Cargar UUIDs de Supabase (una sola vez) ────────────────────────
  let unidades = null
  async function cargarUnidades() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/unidades?select=id,nombre`, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
    })
    if (!r.ok) throw new Error('No se pudieron cargar unidades: HTTP ' + r.status)
    return r.json()
  }

  // ── Sync principal ─────────────────────────────────────────────────
  let syncCount  = 0
  let errorCount = 0

  async function sync() {
    const equipos = window.xdata?.equipos
    if (!equipos) {
      console.warn(LOG, 'window.xdata.equipos no disponible — ¿está WARA cargado con los móviles visibles?')
      setBadge('warn', 'Sin datos GPS', 'Esperando WARA...')
      return
    }

    if (!unidades) {
      unidades = await cargarUnidades()
      console.log(LOG, unidades.length + ' unidades cargadas de Supabase')
    }

    const rows = []
    for (const [key, eq] of Object.entries(equipos)) {
      const movilId = eq.movil_id ?? Number(key)
      const nombre  = WARA_MAP[movilId]
      if (!nombre) continue

      const unidad = unidades.find(u => u.nombre === nombre)
      if (!unidad) continue

      // Las coordenadas vienen como enteros × 10.000.000
      const pos      = eq.tramas?.posicion?.[0]
      const ignicion = eq.tramas?.ignicion?.[0]
      if (!pos) continue

      rows.push({
        unidad_id: unidad.id,
        lat:   pos.latitud   / 10_000_000,
        lng:   pos.longitud  / 10_000_000,
        vel:   pos.velocidad ?? 0,
        motor: ignicion?.presente ?? false,
        ts:    eq.fecha_ultimo_reporte ?? new Date().toISOString(),
      })
    }

    if (!rows.length) {
      console.warn(LOG, 'Sin posiciones válidas para las unidades de Sargo')
      setBadge('warn', '0 unidades mapeadas', 'Ver consola')
      return
    }

    const resp = await fetch(`${SUPABASE_URL}/rest/v1/gps_actual`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(rows),
    })

    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 120))
    }

    // Disparar engine de geofences en la app
    if (typeof window._procesarGeo === 'function') {
      window._procesarGeo(rows).catch(e => console.warn(LOG, '_procesarGeo:', e))
    }

    syncCount++
    errorCount = 0
    const hora = new Date().toTimeString().slice(0, 8)
    console.log(LOG, '✓ Sync #' + syncCount + ' · ' + hora + ' · ' + rows.length + ' unidades')
    setBadge('ok', '✓ ' + rows.length + ' unidades · ' + hora, 'sync #' + syncCount)
  }

  async function syncSeguro() {
    try {
      await sync()
    } catch (e) {
      errorCount++
      console.error(LOG, '✗ Error:', e.message)
      setBadge('error', '✗ Error (' + errorCount + ')', e.message.slice(0, 50))
      if (errorCount >= 5) {
        console.error(LOG, '5 errores seguidos — deteniendo. Recargá WARA y pegá el script de nuevo.')
        setBadge('error', '✗ DETENIDO', 'Recargar WARA y repetir')
        detener()
      }
    }
  }

  // ── Arranque ───────────────────────────────────────────────────────
  let intervaloId = null
  function detener() { clearInterval(intervaloId); intervaloId = null; console.log(LOG, 'Sync detenido.') }
  function iniciar() {
    if (intervaloId) { console.log(LOG, 'Ya está corriendo.'); return }
    crearBadge()
    setBadge('loading', 'Iniciando...', '')
    syncSeguro()
    intervaloId = setInterval(syncSeguro, INTERVALO_MS)
    console.log(LOG, 'Sync activo cada 30s.')
  }

  window._sargoSync = {
    detener,
    syncAhora: syncSeguro,
    estado: () => ({ syncCount, errorCount, unidades: unidades?.length }),
  }

  iniciar()

  console.log(LOG, 'Comandos: _sargoSync.detener() | _sargoSync.syncAhora() | _sargoSync.estado()')

})()
