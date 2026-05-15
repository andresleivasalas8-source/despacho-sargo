// ═══════════════════════════════════════════════════════════════════
//  SARGO GPS SYNC — pegar en consola de apps.visionblo.com/rb/
//
//  Qué hace: lee los datos GPS que WARA ya tiene cargados en pantalla,
//  los manda a la app de despacho cada 30 segundos, y actualiza
//  automáticamente el estado de los viajes según la ubicación del camión.
//
//  Para detener: _sargoSync.detener()
//  Para forzar sync ya: _sargoSync.syncAhora()
// ═══════════════════════════════════════════════════════════════════

;(function () {

  const SUPABASE_URL = 'https://kptqhtaemrikmeubnerz.supabase.co'
  const SUPABASE_KEY = 'sb_publishable_avU2YeeyZ-VtWSXm3hHKDg_1LvUos5d'
  const INTERVALO_MS = 30000
  const LOG = '[SARGO GPS]'

  const DEPOT = { lat: -32.9310777, lng: -68.8202575 }

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

  // ── Haversine ──────────────────────────────────────────────────────
  function haversineM(lat1, lng1, lat2, lng2) {
    const R = 6371000
    const dL = (lat2 - lat1) * Math.PI / 180
    const dG = (lng2 - lng1) * Math.PI / 180
    const x = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dG / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
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

  // ── API helper ─────────────────────────────────────────────────────
  function sbFetch(path, opts) {
    const headers = Object.assign({
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    }, opts && opts.headers)
    return fetch(SUPABASE_URL + path, Object.assign({}, opts, { headers }))
  }

  // ── Cargar UUIDs de Supabase (una sola vez) ────────────────────────
  let unidades = null
  async function cargarUnidades() {
    const r = await sbFetch('/rest/v1/unidades?select=id,nombre')
    if (!r.ok) throw new Error('No se pudieron cargar unidades: HTTP ' + r.status)
    return r.json()
  }

  // ── Geofences: actualiza estado de viajes activos ──────────────────
  async function procesarGeo(positions) {
    const [vRes, pRes, oRes] = await Promise.all([
      sbFetch('/rest/v1/viajes?select=id,estado,unidad_id,pedido_id&estado=in.(cargando,viaje,obra,volviendo)'),
      sbFetch('/rest/v1/pedidos?select=id,obra_id'),
      sbFetch('/rest/v1/obras?select=id,lat,lng'),
    ])

    const viajes  = vRes.ok  ? await vRes.json()  : []
    const pedidos = pRes.ok  ? await pRes.json()  : []
    const obras   = oRes.ok  ? await oRes.json()  : []

    if (!viajes.length) return

    const ahora = new Date().toISOString()

    for (const viaje of viajes) {
      const pos = positions.find(p => p.unidad_id === viaje.unidad_id)
      if (!pos) continue

      const pedido = pedidos.find(p => p.id === viaje.pedido_id)
      const obra   = pedido ? obras.find(o => o.id === pedido.obra_id) : null

      const distDeposito = haversineM(pos.lat, pos.lng, DEPOT.lat, DEPOT.lng)
      const distObra     = obra ? haversineM(pos.lat, pos.lng, parseFloat(obra.lat), parseFloat(obra.lng)) : null

      let update = null
      if      (viaje.estado === 'cargando'  && distDeposito > 200)                       update = { estado: 'viaje',    viaje_at:    ahora }
      else if (viaje.estado === 'viaje'     && distObra !== null && distObra < 400)       update = { estado: 'obra',     obra_at:     ahora }
      else if (viaje.estado === 'obra'      && distObra !== null && distObra > 400)       update = { estado: 'volviendo', volviendo_at: ahora }
      else if (viaje.estado === 'volviendo' && distDeposito < 200)                        update = { estado: 'done',     done_at:     ahora }

      if (update) {
        const r = await sbFetch('/rest/v1/viajes?id=eq.' + viaje.id, { method: 'PATCH', body: JSON.stringify(update) })
        if (r.ok) {
          console.log(LOG, 'Transicion: unidad ' + viaje.unidad_id + ' → ' + update.estado + ' (dist_deposito=' + Math.round(distDeposito) + 'm' + (distObra !== null ? ', dist_obra=' + Math.round(distObra) + 'm' : '') + ')')
        } else {
          console.warn(LOG, 'Error actualizando viaje ' + viaje.id + ':', await r.text())
        }
      }
    }
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
      const movilId = eq.movil_id != null ? eq.movil_id : Number(key)
      const nombre  = WARA_MAP[movilId]
      if (!nombre) continue

      const unidad = unidades.find(u => u.nombre === nombre)
      if (!unidad) continue

      const pos      = eq.tramas && eq.tramas.posicion && eq.tramas.posicion[0]
      const ignicion = eq.tramas && eq.tramas.ignicion && eq.tramas.ignicion[0]
      if (!pos) continue

      rows.push({
        unidad_id: unidad.id,
        lat:   pos.latitud   / 10000000,
        lng:   pos.longitud  / 10000000,
        vel:   pos.velocidad != null ? pos.velocidad : 0,
        motor: ignicion ? !!ignicion.presente : false,
        ts:    eq.fecha_ultimo_reporte || new Date().toISOString(),
      })
    }

    if (!rows.length) {
      console.warn(LOG, 'Sin posiciones validas para las unidades de Sargo')
      setBadge('warn', '0 unidades mapeadas', 'Ver consola')
      return
    }

    const resp = await sbFetch('/rest/v1/gps_actual', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    })

    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error('HTTP ' + resp.status + ': ' + txt.slice(0, 120))
    }

    // Geofences — corre en esta misma pestaña, no depende de la app
    await procesarGeo(rows)

    syncCount++
    errorCount = 0
    const hora = new Date().toTimeString().slice(0, 8)
    console.log(LOG, 'Sync #' + syncCount + ' · ' + hora + ' · ' + rows.length + ' unidades')
    setBadge('ok', rows.length + ' unidades · ' + hora, 'sync #' + syncCount)
  }

  async function syncSeguro() {
    try {
      await sync()
    } catch (e) {
      errorCount++
      console.error(LOG, 'Error:', e.message)
      setBadge('error', 'Error (' + errorCount + ')', e.message.slice(0, 50))
      if (errorCount >= 5) {
        console.error(LOG, '5 errores seguidos — deteniendose. Recarga WARA y pega el script de nuevo.')
        setBadge('error', 'DETENIDO', 'Recargar WARA y repetir')
        detener()
      }
    }
  }

  // ── Arranque ───────────────────────────────────────────────────────
  let intervaloId = null
  function detener() { clearInterval(intervaloId); intervaloId = null; console.log(LOG, 'Sync detenido.') }
  function iniciar() {
    if (intervaloId) { console.log(LOG, 'Ya esta corriendo.'); return }
    crearBadge()
    setBadge('loading', 'Iniciando...', '')
    syncSeguro()
    intervaloId = setInterval(syncSeguro, INTERVALO_MS)
    console.log(LOG, 'Sync activo cada 30s.')
  }

  window._sargoSync = {
    detener,
    syncAhora: syncSeguro,
    estado: function() { return { syncCount: syncCount, errorCount: errorCount, unidades: unidades ? unidades.length : 0 } },
  }

  iniciar()

  console.log(LOG, 'Comandos: _sargoSync.detener() | _sargoSync.syncAhora() | _sargoSync.estado()')

})()
