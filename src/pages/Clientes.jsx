import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import { useIsMobile } from '../hooks/useIsMobile'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const DEPOT = { lat: -32.9310777, lng: -68.8202575 }

// ── TomTom Traffic API (incidencias en tiempo real) ──────────────────
// Clave gratuita en: developer.tomtom.com → Register → My Apps → New app
// Sin tarjeta de crédito. Poné tu clave aquí:
const TOMTOM_KEY = 'XpjKwEibOWeRIK91HHoleJhw2g2V8lXS'

const ROUTE_COLORS  = ['#16a34a', '#3b82f6', '#f59e0b']
const ROUTE_LABELS  = ['Ruta principal', 'Alternativa 1', 'Alternativa 2']
const INCIDENT_ICON = { 1: '💥', 6: '🚦', 7: '⚠️', 8: '🚧', 9: '🔨', 13: '🚗' }
const INCIDENT_MAG  = { 1: '#eab308', 2: '#f97316', 3: '#dc2626', 4: '#dc2626' }

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [obras, setObras] = useState([])
  const [loading, setLoading] = useState(true)
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [showObraForm, setShowObraForm] = useState(null)
  const [user, setUser] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => {
    checkUser()
    cargarDatos()
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) navigate('/login')
    else setUser(user)
  }

  async function cargarDatos() {
    setLoading(true)
    const [cRes, oRes] = await Promise.all([
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('obras').select('*').order('nombre'),
    ])
    if (cRes.data) setClientes(cRes.data)
    if (oRes.data) setObras(oRes.data)
    setLoading(false)
  }

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371
    const dL = (lat2 - lat1) * Math.PI / 180
    const dG = (lng2 - lng1) * Math.PI / 180
    const x = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dG/2)**2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
  }

  return (
    <div style={styles.container}>
      <Header active="clientes" user={user} />

      <main style={{ ...styles.main, padding: isMobile ? 12 : 24 }}>
        <div style={styles.toolbar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={styles.toolbarTitle}>Clientes ({clientes.length})</h2>
            <div style={styles.busquedaWrap}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
                <circle cx="9" cy="9" r="6" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
              </svg>
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar cliente..."
                style={styles.busquedaInput}
              />
            </div>
          </div>
          <button onClick={() => setShowClienteForm(true)} style={styles.btnPrimary}>
            + Nuevo cliente
          </button>
        </div>

        {loading ? (
          <div style={styles.empty}>Cargando...</div>
        ) : clientes.length === 0 ? (
          <div style={styles.empty}>
            No hay clientes cargados. Hacé clic en "+ Nuevo cliente" para empezar.
          </div>
        ) : (
          <div style={styles.clientesList}>
            {(busqueda.trim() ? clientes.filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase())) : clientes).map(c => {
              const cObras = obras.filter(o => o.cliente_id === c.id)
              return (
                <ClienteCard
                  key={c.id}
                  cliente={c}
                  obras={cObras}
                  onAddObra={() => setShowObraForm(c.id)}
                  onReload={cargarDatos}
                  haversineKm={haversineKm}
                />
              )
            })}
          </div>
        )}
      </main>

      {showClienteForm && (
        <ClienteForm
          onClose={() => setShowClienteForm(false)}
          onSaved={() => { setShowClienteForm(false); cargarDatos() }}
        />
      )}

      {showObraForm && (
        <ObraForm
          clienteId={showObraForm}
          cliente={clientes.find(c => c.id === showObraForm)}
          onClose={() => setShowObraForm(null)}
          onSaved={() => { setShowObraForm(null); cargarDatos() }}
        />
      )}
    </div>
  )
}

// ─── COMPONENTE: TARJETA DE CLIENTE ─────────────────────────────────
function ClienteCard({ cliente, obras, onAddObra, onReload, haversineKm }) {
  const isMobile = useIsMobile()
  async function deleteCliente() {
    if (!confirm(`¿Eliminar cliente "${cliente.nombre}" y todas sus obras?`)) return
    await supabase.from('clientes').delete().eq('id', cliente.id)
    onReload()
  }

  async function deleteObra(obraId, obraNombre) {
    if (!confirm(`¿Eliminar la obra "${obraNombre}"?`)) return
    await supabase.from('obras').delete().eq('id', obraId)
    onReload()
  }

  return (
    <div style={styles.card}>
      <div style={styles.clienteHeader}>
        <div>
          <strong style={{ ...styles.clienteName, fontSize: isMobile ? 14 : 16 }}>{cliente.nombre}</strong>
          {cliente.telefono && <span style={{ ...styles.clienteTel, fontSize: isMobile ? 11 : 13 }}>· {cliente.telefono}</span>}
        </div>
        <div style={styles.clienteActions}>
          <button onClick={onAddObra} style={styles.btnSm}>+ Obra</button>
          <button onClick={deleteCliente} style={styles.btnSmDanger}>✕</button>
        </div>
      </div>

      {obras.length === 0 ? (
        <div style={styles.noObras}>Sin obras registradas</div>
      ) : (
        <div style={styles.obrasList}>
          {obras.map(o => {
            const distHav = haversineKm(DEPOT.lat, DEPOT.lng, parseFloat(o.lat), parseFloat(o.lng))
            return (
              <div key={o.id} style={styles.obraRow}>
                <div style={{ flex: 1 }}>
                  <div style={{ ...styles.obraName, fontSize: isMobile ? 13 : 15 }}>{o.nombre}</div>
                  {o.direccion && (
                    <div style={{ ...styles.obraDireccion, fontSize: isMobile ? 11 : 13 }}>{o.direccion}</div>
                  )}
                  <div style={styles.obraTags}>
                    <span style={{ ...styles.tag, ...styles.tagGreen }}>
                      {o.dist_km_maps ? `${o.dist_km_maps} km` : `${distHav.toFixed(1)} km ≈`}
                    </span>
                    {o.t_ida_maps && (
                      <span style={{ ...styles.tag, ...styles.tagBlue }}>{o.t_ida_maps} min</span>
                    )}
                    {o.frec_min > 0 && (
                      <span style={{ ...styles.tag, ...styles.tagNeutral }}>c/{o.frec_min}min</span>
                    )}
                    <span style={{ ...styles.tag, ...styles.tagGray }}>desc. {o.desc_min}min</span>
                  </div>
                </div>
                <button onClick={() => deleteObra(o.id, o.nombre)} style={styles.btnSmDanger}>✕</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTE: FORMULARIO NUEVO CLIENTE ───────────────────────────
function ClienteForm({ onClose, onSaved }) {
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('clientes').insert({
      nombre: nombre.trim(),
      telefono: telefono.trim() || null,
      email: email.trim() || null,
    })
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Nuevo cliente</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Nombre / Razón social</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus style={styles.input} placeholder="Constructora Ejemplo SA" />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Teléfono</label>
          <input type="text" value={telefono} onChange={e => setTelefono(e.target.value)} style={styles.input} placeholder="261-4123456" />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} placeholder="contacto@ejemplo.com" />
        </div>
        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar cliente'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── COMPONENTE: FORMULARIO NUEVA OBRA ──────────────────────────────
function ObraForm({ clienteId, cliente, onClose, onSaved }) {
  const isMobile = useIsMobile()
  const [nombre, setNombre] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [hoveredIdx, setHoveredIdx] = useState(-1)
  const [coords, setCoords] = useState(null)
  const [direccion, setDireccion] = useState('')
  const [tIdaMaps, setTIdaMaps] = useState('')
  const [distKmMaps, setDistKmMaps] = useState('')
  const [frecMin, setFrecMin] = useState('30')
  const [descMin, setDescMin] = useState('30')
  const [saving, setSaving] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [rutaOk, setRutaOk] = useState(false)
  const [rutasInfo, setRutasInfo] = useState([])
  const [incidentes, setIncidentes] = useState([])
  const [mostrarCoordsManual, setMostrarCoordsManual] = useState(false)
  const [latManual, setLatManual] = useState('')
  const [lngManual, setLngManual] = useState('')
  const mapDivRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const routeLayersRef = useRef([])
  const incidentLayersRef = useRef([])
  const searchTimer = useRef(null)

  useEffect(() => {
    if (!mapDivRef.current) return
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView([DEPOT.lat, DEPOT.lng], 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(map)
    const depotIcon = L.divIcon({
      className: '',
      html: '<div style="background:#F03226;width:12px;height:12px;border-radius:2px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.4)"></div>',
      iconSize: [12, 12], iconAnchor: [6, 6],
    })
    L.marker([DEPOT.lat, DEPOT.lng], { icon: depotIcon }).addTo(map).bindPopup('Depósito Sargo')
    map.on('click', e => {
      const lat = parseFloat(e.latlng.lat.toFixed(6))
      const lng = parseFloat(e.latlng.lng.toFixed(6))
      setCoords({ lat, lng })
      setRutaOk(false)
    })
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; routeLayersRef.current = []; incidentLayersRef.current = [] }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !coords) return
    if (markerRef.current) {
      markerRef.current.setLatLng([coords.lat, coords.lng])
    } else {
      const icon = L.divIcon({
        className: '',
        html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      const marker = L.marker([coords.lat, coords.lng], { icon, draggable: true }).addTo(map)
      marker.on('dragend', e => {
        const ll = e.target.getLatLng()
        setCoords({ lat: parseFloat(ll.lat.toFixed(6)), lng: parseFloat(ll.lng.toFixed(6)) })
        setRutaOk(false)
        setRutasInfo([])
        setIncidentes([])
        routeLayersRef.current.forEach(l => l.remove()); routeLayersRef.current = []
        incidentLayersRef.current.forEach(l => l.remove()); incidentLayersRef.current = []
      })
      markerRef.current = marker
    }
    map.setView([coords.lat, coords.lng], 15)
  }, [coords])

  function handleSearch(value) {
    setSearchQuery(value)
    setSearchResults([])
    clearTimeout(searchTimer.current)
    if (value.trim().length < 4) return
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      try {
        const q = encodeURIComponent(value + ', Mendoza, Argentina')
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&limit=5&countrycodes=ar`, { headers: { 'Accept-Language': 'es' } })
        setSearchResults(await res.json())
      } catch { /* silent */ }
      finally { setSearching(false) }
    }, 500)
  }

  function selectResult(r) {
    const lat = parseFloat(r.lat)
    const lng = parseFloat(r.lon)
    setCoords({ lat, lng })
    const parts = r.display_name.split(',')
    setSearchQuery(parts.slice(0, 2).join(',').trim())
    setDireccion(parts.slice(0, 3).join(',').trim())
    setSearchResults([])
    setRutaOk(false)
  }

  function limpiarCapas() {
    routeLayersRef.current.forEach(l => l.remove()); routeLayersRef.current = []
    incidentLayersRef.current.forEach(l => l.remove()); incidentLayersRef.current = []
  }

  async function calcularRuta() {
    if (!coords) return
    setCalculando(true)
    limpiarCapas()
    setRutasInfo([])
    setIncidentes([])

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${DEPOT.lng},${DEPOT.lat};${coords.lng},${coords.lat}?overview=full&geometries=geojson&alternatives=true`
      const data = await fetch(url).then(r => r.json())
      const routes = data.routes ?? []
      if (!routes.length) throw new Error('Sin ruta')

      const map = mapRef.current
      const info = []

      routes.slice(0, 3).forEach((route, i) => {
        const latlngs = route.geometry.coordinates.map(([lng, lat]) => [lat, lng])
        const layer = L.polyline(latlngs, {
          color:     ROUTE_COLORS[i],
          weight:    i === 0 ? 5 : 4,
          opacity:   i === 0 ? 0.82 : 0.52,
          dashArray: i === 0 ? null : '10 7',
        }).addTo(map)
        routeLayersRef.current.push(layer)
        info.push({
          label:    ROUTE_LABELS[i],
          color:    ROUTE_COLORS[i],
          min:      Math.round(route.duration / 60),
          km:       (route.distance / 1000).toFixed(1),
        })
      })

      // Usar la ruta principal (índice 0) para los campos del formulario
      setTIdaMaps(String(info[0].min))
      setDistKmMaps(String(info[0].km))
      setRutasInfo(info)
      setRutaOk(true)

      // Encuadrar mapa sobre la ruta principal
      map.fitBounds(routeLayersRef.current[0].getBounds(), { padding: [28, 28] })

      // Incidencias TomTom (solo si hay clave configurada)
      if (TOMTOM_KEY) {
        const b = routeLayersRef.current[0].getBounds().pad(0.15)
        const bbox = `${b.getWest().toFixed(5)},${b.getSouth().toFixed(5)},${b.getEast().toFixed(5)},${b.getNorth().toFixed(5)}`
        try {
          const iData = await fetch(
            `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_KEY}&bbox=${bbox}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description},from,to,delay}}}&language=es-ES&timeValidityFilter=present`
          ).then(r => r.json())

          const incidents = iData.incidents ?? []
          setIncidentes(incidents.map(inc => ({
            desc:     inc.properties?.events?.[0]?.description ?? 'Incidencia',
            from:     inc.properties?.from ?? '',
            to:       inc.properties?.to ?? '',
            delay:    inc.properties?.delay ?? 0,
            mag:      inc.properties?.magnitudeOfDelay ?? 1,
            cat:      inc.properties?.iconCategory ?? 0,
            coords:   inc.geometry?.type === 'Point' ? inc.geometry.coordinates : inc.geometry?.coordinates?.[0],
          })))

          incidents.forEach(inc => {
            const c = inc.geometry?.type === 'Point' ? inc.geometry.coordinates : inc.geometry?.coordinates?.[0]
            if (!c) return
            const mag  = inc.properties?.magnitudeOfDelay ?? 1
            const cat  = inc.properties?.iconCategory ?? 0
            const icon = L.divIcon({
              className: '',
              html: `<div style="background:${INCIDENT_MAG[mag] ?? '#eab308'};width:10px;height:10px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer"></div>`,
              iconSize: [10, 10], iconAnchor: [5, 5],
            })
            const desc = inc.properties?.events?.[0]?.description ?? 'Incidencia'
            const from = inc.properties?.from ? ` · desde ${inc.properties.from}` : ''
            const layer = L.marker([c[1], c[0]], { icon })
              .addTo(map)
              .bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:12px"><b>${desc}</b>${from}</div>`)
            incidentLayersRef.current.push(layer)
          })
        } catch { /* incidencias opcionales, no bloquear */ }
      }
    } catch {
      alert('No se pudo calcular la ruta. Ingresá los datos manualmente.')
    } finally {
      setCalculando(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!coords) { alert('Ubicá la obra en el mapa'); return }
    setSaving(true)
    const { error } = await supabase.from('obras').insert({
      cliente_id: clienteId,
      nombre: nombre.trim(),
      direccion: direccion.trim() || null,
      lat: coords.lat,
      lng: coords.lng,
      frec_min: parseInt(frecMin) || 30,
      desc_min: parseInt(descMin) || 30,
      t_ida_maps: tIdaMaps ? parseInt(tIdaMaps) : null,
      dist_km_maps: distKmMaps ? parseFloat(distKmMaps) : null,
    })
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={{ ...sO.wideModal, maxWidth: isMobile ? '100%' : 900, padding: isMobile ? 16 : 24 }}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Nueva obra · {cliente?.nombre}</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        {/* 2-column layout — en mobile: 1 columna */}
        <div style={{ ...sO.twoCol, gridTemplateColumns: isMobile ? '1fr' : '1fr 1.55fr' }}>

          {/* LEFT: todos los campos + route box */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>

            <div style={styles.formGroup}>
              <label style={styles.label}>Nombre de la obra</label>
              <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus style={styles.input} placeholder="Edificio Centro / Casa Calle X" />
            </div>

            <div style={{ ...styles.formGroup, position: 'relative', zIndex: 10 }}>
              <label style={styles.label}>Buscar dirección</label>
              <div style={{ position: 'relative' }}>
                <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)} style={styles.input} autoComplete="off" placeholder="Ej: Av. San Martín 1250, Godoy Cruz" />
                {searching && <span style={sO.spinner}>buscando…</span>}
              </div>
              {searchResults.length > 0 && (
                <div style={sO.dropdown}>
                  {searchResults.map((r, i) => (
                    <div key={i} style={{ ...sO.dropItem, background: hoveredIdx === i ? '#f1f5f9' : '#fff' }} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(-1)} onClick={() => selectResult(r)}>
                      <div style={sO.dropMain}>{r.display_name.split(',')[0]}</div>
                      <div style={sO.dropSub}>{r.display_name.split(',').slice(1, 4).join(',')}</div>
                    </div>
                  ))}
                </div>
              )}
              <small style={styles.hint}>Escribí y elegí de la lista · o hacé clic en el mapa</small>
            </div>

            {/* Coordenadas GPS manuales */}
            <div style={{ marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setMostrarCoordsManual(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: mostrarCoordsManual ? '#f1f5f9' : '#fff',
                  border: '1px solid #cbd5e1', borderRadius: 6,
                  padding: '6px 12px', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, color: '#475569', fontFamily: 'inherit',
                  width: '100%', justifyContent: 'center', marginBottom: mostrarCoordsManual ? 8 : 0,
                }}
              >
                📍 Coordenadas GPS manuales {mostrarCoordsManual ? '▲' : '▼'}
              </button>
              {mostrarCoordsManual && (
                <div style={sO.coordsManualWrap}>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>
                    Google Maps: clic derecho en el punto → copiar coordenadas
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label style={styles.label}>Latitud</label>
                      <input type="text" value={latManual} onChange={e => setLatManual(e.target.value)} style={styles.input} placeholder="-32.9310" />
                    </div>
                    <div>
                      <label style={styles.label}>Longitud</label>
                      <input type="text" value={lngManual} onChange={e => setLngManual(e.target.value)} style={styles.input} placeholder="-68.8202" />
                    </div>
                  </div>
                  <button type="button" onClick={() => {
                    const lat = parseFloat(latManual)
                    const lng = parseFloat(lngManual)
                    if (isNaN(lat) || isNaN(lng)) { alert('Ingresá coordenadas válidas'); return }
                    setCoords({ lat, lng })
                    setMostrarCoordsManual(false)
                  }} style={{ ...sO.btnRuta, marginBottom: 0 }}>
                    Confirmar ubicación
                  </button>
                </div>
              )}
            </div>

            <div style={styles.row2}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Frecuencia entrega</label>
                <select value={frecMin} onChange={e => setFrecMin(e.target.value)} style={styles.input}>
                  <option value="0">Sin frecuencia</option>
                  <option value="15">c/15min</option>
                  <option value="20">c/20min</option>
                  <option value="30">c/30min</option>
                  <option value="45">c/45min</option>
                  <option value="60">c/60min</option>
                  <option value="90">c/90min</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Descarga en obra</label>
                <select value={descMin} onChange={e => setDescMin(e.target.value)} style={styles.input}>
                  <option value="20">20min</option>
                  <option value="30">30min</option>
                  <option value="40">40min</option>
                  <option value="45">45min</option>
                  <option value="60">60min</option>
                  <option value="90">90min</option>
                </select>
              </div>
            </div>

            {/* Route box — ocupa el espacio restante de la columna izquierda */}
            <div style={{ ...sO.routeBox, flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
              <button type="button" onClick={calcularRuta} disabled={!coords || calculando} style={{ ...sO.btnRuta, opacity: !coords ? 0.5 : 1 }}>
                {calculando ? 'Calculando…' : rutaOk ? '↻ Recalcular ruta' : '🗺 Calcular tiempo y distancia'}
              </button>
              <div style={styles.row2}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Tiempo ida (min)</label>
                  <input type="number" value={tIdaMaps} onChange={e => setTIdaMaps(e.target.value)} min="1" max="120" style={styles.input} placeholder="—" />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Distancia (km)</label>
                  <input type="number" value={distKmMaps} onChange={e => setDistKmMaps(e.target.value)} min="0.5" max="100" step="0.1" style={styles.input} placeholder="—" />
                </div>
              </div>
              {rutasInfo.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
                  {rutasInfo.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: "'DM Sans', sans-serif" }}>
                      <div style={{ width: i === 0 ? 22 : 18, height: i === 0 ? 4 : 0, borderRadius: 2, background: i === 0 ? r.color : 'none', flexShrink: 0, borderTop: i > 0 ? `3px dashed ${r.color}` : 'none', opacity: i === 0 ? 1 : 0.7 }} />
                      <span style={{ color: '#475569', fontWeight: i === 0 ? 600 : 400 }}>
                        {r.label} — {r.min} min · {r.km} km
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {incidentes.length > 0 && (
                <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 7, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>
                    ⚠️ {incidentes.length} incidencia{incidentes.length > 1 ? 's' : ''} en el recorrido
                  </div>
                  {incidentes.slice(0, 3).map((inc, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#92400e', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>
                      {INCIDENT_ICON[inc.cat] ?? '⚠️'} {inc.desc}{inc.delay > 60 ? ` · +${Math.round(inc.delay/60)}min de demora` : ''}
                    </div>
                  ))}
                </div>
              )}
              {rutaOk && incidentes.length === 0 && TOMTOM_KEY && (
                <div style={sO.rutaOk}>✓ Ruta calculada · sin incidencias reportadas</div>
              )}
              {rutaOk && !TOMTOM_KEY && (
                <div style={sO.rutaOk}>✓ Calculado automáticamente · podés ajustar si lo necesitás</div>
              )}
            </div>
          </div>

          {/* RIGHT: mapa */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            <div style={{ ...sO.mapWrapLg, ...(isMobile ? { flex: 'none', height: 220, minHeight: 220 } : {}) }}>
              <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
              {!coords && <div style={sO.mapHint}>Buscá una dirección o hacé clic aquí para ubicar la obra</div>}
            </div>
            {coords && (
              <div style={sO.coordsRow}>
                ✓ {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                <span style={{ color: '#94a3b8', marginLeft: 8 }}>· Arrastrá el pin para ajustar</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving || !coords} style={{ ...styles.btnPrimary, opacity: !coords ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar obra'}
          </button>
        </div>
      </form>
    </div>
  )
}

const sO = {
  wideModal: { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 900, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1.55fr', gap: 20, alignItems: 'stretch', marginBottom: 16 },
  spinner: { position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8', pointerEvents: 'none' },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,.12)', zIndex: 1000, maxHeight: 220, overflowY: 'auto' },
  dropItem: { padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' },
  dropMain: { fontSize: 12, color: '#0f172a', fontWeight: 500 },
  dropSub: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  mapWrapLg: { position: 'relative', flex: 1, minHeight: 260, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' },
  mapWrap: { position: 'relative', height: 210, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', marginBottom: 6 },
  mapHint: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248,250,252,0.72)', fontSize: 12, color: '#94a3b8', pointerEvents: 'none', textAlign: 'center', padding: 20 },
  coordsRow: { fontSize: 11, fontFamily: 'monospace', color: '#16a34a', fontWeight: 500 },
  routeBox: { background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 12 },
  btnRuta: { background: '#16a34a', color: '#fff', border: 'none', padding: '9px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%', marginBottom: 10 },
  rutaOk: { fontSize: 11, color: '#16a34a', fontWeight: 500, fontFamily: 'monospace', marginTop: 4 },
  coordsManualWrap: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 },
}

// ─── ESTILOS ────────────────────────────────────────────────────────
const styles = {
  container: { minHeight: '100vh', background: 'transparent', fontFamily: "'Syne', system-ui, sans-serif" },
  main: { maxWidth: 1100, margin: '0 auto', padding: 24 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  toolbarTitle: { fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase', margin: 0 },
  busquedaWrap: { display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px', minWidth: 180 },
  busquedaInput: { border: 'none', outline: 'none', fontSize: 13, color: '#0f172a', background: 'transparent', fontFamily: 'inherit', width: '100%' },
  btnPrimary: { background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { background: '#fff', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSm: { fontSize: 13, padding: '6px 13px', background: '#fff', border: '1px solid #16a34a', color: '#16a34a', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 },
  btnSmDanger: { fontSize: 12, padding: '5px 10px', background: '#fff', border: '1px solid #cbd5e1', color: '#94a3b8', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' },
  empty: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' },
  clientesList: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  clienteHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  clienteName: { fontSize: 16, fontWeight: 600, color: '#0f172a' },
  clienteTel: { fontSize: 13, fontFamily: 'monospace', color: '#64748b', marginLeft: 8 },
  clienteActions: { display: 'flex', gap: 6 },
  noObras: { fontSize: 11, fontFamily: 'monospace', color: '#94a3b8', padding: '6px 0' },
  obrasList: { display: 'flex', flexDirection: 'column', gap: 6 },
  obraRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' },
  obraName: { fontSize: 15, color: '#0f172a', fontWeight: 600, marginBottom: 4 },
  obraDireccion: { fontSize: 13, color: '#94a3b8', fontFamily: "'DM Sans', sans-serif", marginBottom: 6 },
  obraTags: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  tag: { fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap', letterSpacing: '0.02em' },
  tagGreen:   { background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' },
  tagBlue:    { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' },
  tagGray:    { background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' },
  tagNeutral: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' },
  btnClose: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', padding: 4 },
  formGroup: { marginBottom: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 },
  input: { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', fontFamily: 'inherit' },
  hint: { display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 4 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 },
}
