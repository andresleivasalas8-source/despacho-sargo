import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import { useIsMobile } from '../hooks/useIsMobile'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

const DEPOT = { lat: -32.9310777, lng: -68.8202575 }

function MixerIcon({ color = '#94a3b8', size = 36 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      {/* Cabina */}
      <rect x="2" y="10" width="18" height="18" rx="2" fill={color} opacity="0.9" />
      <rect x="4" y="12" width="7" height="7" rx="1" fill="#fff" opacity="0.7" />
      {/* Chasis */}
      <rect x="2" y="24" width="54" height="5" rx="1" fill={color} opacity="0.75" />
      {/* Tambor rotante */}
      <ellipse cx="38" cy="17" rx="14" ry="11" fill={color} opacity="0.85" />
      <ellipse cx="38" cy="17" rx="10" ry="7.5" fill={color} opacity="0.5" />
      {/* Espiral del tambor (líneas diagonales) */}
      <line x1="31" y1="11" x2="45" y2="23" stroke="#fff" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
      <line x1="35" y1="9" x2="45" y2="19" stroke="#fff" strokeWidth="1.5" opacity="0.3" strokeLinecap="round" />
      {/* Ruedas */}
      <circle cx="12" cy="30" r="5" fill="#1e293b" />
      <circle cx="12" cy="30" r="2.5" fill="#94a3b8" />
      <circle cx="44" cy="30" r="5" fill="#1e293b" />
      <circle cx="44" cy="30" r="2.5" fill="#94a3b8" />
      <circle cx="54" cy="30" r="5" fill="#1e293b" />
      <circle cx="54" cy="30" r="2.5" fill="#94a3b8" />
    </svg>
  )
}

function PumpIcon({ color = '#94a3b8', size = 36 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 60 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      {/* Cabina */}
      <rect x="2" y="10" width="16" height="18" rx="2" fill={color} opacity="0.9" />
      <rect x="4" y="12" width="6" height="6" rx="1" fill="#fff" opacity="0.7" />
      {/* Chasis */}
      <rect x="2" y="24" width="54" height="5" rx="1" fill={color} opacity="0.75" />
      {/* Cuerpo de la bomba */}
      <rect x="22" y="14" width="32" height="12" rx="2" fill={color} opacity="0.7" />
      {/* Brazo articulado de la bomba */}
      <line x1="38" y1="14" x2="50" y2="4" stroke={color} strokeWidth="3.5" strokeLinecap="round" opacity="0.9" />
      <line x1="50" y1="4" x2="58" y2="10" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      {/* Manguera colgante */}
      <line x1="58" y1="10" x2="58" y2="20" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.6" strokeDasharray="2 2" />
      {/* Estabilizadores */}
      <line x1="24" y1="29" x2="20" y2="35" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <line x1="50" y1="29" x2="54" y2="35" stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      {/* Ruedas */}
      <circle cx="11" cy="30" r="5" fill="#1e293b" />
      <circle cx="11" cy="30" r="2.5" fill="#94a3b8" />
      <circle cx="43" cy="30" r="5" fill="#1e293b" />
      <circle cx="43" cy="30" r="2.5" fill="#94a3b8" />
    </svg>
  )
}

/* Badge color per status */
const BADGE = {
  '#16a34a': { background: 'rgba(22,163,74,0.10)',  color: '#16a34a', border: '1px solid rgba(22,163,74,0.22)' },
  '#3b82f6': { background: 'rgba(59,130,246,0.10)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.22)' },
  '#f59e0b': { background: 'rgba(245,158,11,0.10)', color: '#b45309', border: '1px solid rgba(245,158,11,0.22)' },
  '#94a3b8': { background: 'rgba(148,163,184,0.08)', color: '#64748b', border: '1px solid rgba(148,163,184,0.18)' },
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dL = (lat2 - lat1) * Math.PI / 180
  const dG = (lng2 - lng1) * Math.PI / 180
  const x = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dG / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function getEstado(gps) {
  if (!gps) return { lbl: 'Sin GPS', color: '#94a3b8', active: false }
  const dist = haversineKm(gps.lat, gps.lng, DEPOT.lat, DEPOT.lng) * 1000
  if (dist < 200)               return { lbl: 'En planta',     color: '#16a34a', dist, active: true }
  if (gps.motor && gps.vel > 3) return { lbl: 'En movimiento', color: '#3b82f6', dist, active: true }
  if (gps.motor)                return { lbl: 'Detenido',      color: '#f59e0b', dist, active: true }
  return { lbl: 'Apagado', color: '#94a3b8', dist, active: false }
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [gpsActual, setGpsActual] = useState([])
  const [loading, setLoading] = useState(true)
  const [, setTick] = useState(0)
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [selectedUnitId, setSelectedUnitId] = useState(null)
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  useEffect(() => {
    checkUser()
    cargarDatos()

    const channel = supabase
      .channel('dashboard_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gps_actual' }, () => cargarGPS())
      .subscribe()

    const interval = setInterval(() => setTick(t => t + 1), 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/login'); return }
    setUser(user)
  }

  async function cargarDatos() {
    setLoading(true)
    const [uRes, gRes] = await Promise.all([
      supabase.from('unidades').select('*').order('nombre'),
      supabase.from('gps_actual').select('*'),
    ])
    if (uRes.data) setUnidades(uRes.data)
    if (gRes.data) setGpsActual(gRes.data)
    setLoading(false)
  }

  async function cargarGPS() {
    const { data } = await supabase.from('gps_actual').select('*')
    if (data) setGpsActual(data)
  }

  const ultimoSync = gpsActual.length > 0
    ? Math.max(...gpsActual.map(g => new Date(g.ts).getTime()))
    : null
  const ageSec = ultimoSync ? Math.round((Date.now() - ultimoSync) / 1000) : null

  return (
    <div style={styles.container}>
      <Header active="flota" user={user} gpsAge={ageSec} />

      <main style={{ ...styles.main, padding: isMobile ? '12px' : '28px' }} className="page-enter">
        <section style={{ ...styles.section, padding: isMobile ? '14px 14px' : '24px 26px' }}>
          <div style={styles.fleetHeader}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase' }}>Flota</h2>
            {!loading && unidades.length > 0 && (() => {
              const counts = unidades.reduce((acc, u) => {
                const lbl = getEstado(gpsActual.find(g => g.unidad_id === u.id)).lbl
                acc[lbl] = (acc[lbl] || 0) + 1
                return acc
              }, {})
              return (
                <div style={styles.fleetStats}>
                  {counts['En planta']     > 0 && <span style={{ ...styles.statPill, background: 'rgba(22,163,74,0.10)',  color: '#16a34a', border: '1px solid rgba(22,163,74,0.22)' }}>{counts['En planta']} en planta</span>}
                  {counts['En movimiento'] > 0 && <span style={{ ...styles.statPill, background: 'rgba(59,130,246,0.10)', color: '#2563eb', border: '1px solid rgba(59,130,246,0.22)' }}>{counts['En movimiento']} en ruta</span>}
                  {counts['Detenido']      > 0 && <span style={{ ...styles.statPill, background: 'rgba(245,158,11,0.10)', color: '#b45309', border: '1px solid rgba(245,158,11,0.22)' }}>{counts['Detenido']} detenido{counts['Detenido'] > 1 ? 's' : ''}</span>}
                  {counts['Apagado']       > 0 && <span style={{ ...styles.statPill, background: 'rgba(148,163,184,0.08)', color: '#64748b', border: '1px solid rgba(148,163,184,0.18)' }}>{counts['Apagado']} apagado{counts['Apagado'] > 1 ? 's' : ''}</span>}
                  {counts['Sin GPS']       > 0 && <span style={{ ...styles.statPill, background: 'rgba(148,163,184,0.08)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.14)' }}>{counts['Sin GPS']} sin GPS</span>}
                </div>
              )
            })()}
          </div>

          {loading ? (
            <div style={styles.empty}>Cargando...</div>
          ) : (
            <div style={{ ...styles.fleetGrid, gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(5, minmax(0,1fr))' }}>
              {unidades.map((u, i) => {
                const gps    = gpsActual.find(g => g.unidad_id === u.id)
                const estado = getEstado(gps)
                const badge  = BADGE[estado.color] || BADGE['#94a3b8']

                return (
                  <div
                    key={u.id}
                    className="vehicle-card"
                    style={{
                      borderLeft: `3px solid ${estado.color}`,
                      animationDelay: `${i * 40}ms`,
                      cursor: 'pointer',
                    }}
                    title="Ver en mapa"
                    onClick={() => setSelectedVehicle({ unidad: u, gps, estado })}
                  >
                    {/* Fila 1: icono + nombre + hint mapa */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      {u.nombre?.startsWith('B')
                        ? <PumpIcon color={estado.color} size={36} />
                        : <MixerIcon color={estado.color} size={36} />
                      }
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="vehicle-name">{u.nombre}</div>
                        {u.patente && <div className="vehicle-plate">{u.patente}</div>}
                      </div>
                      <span style={styles.mapHint} title="Ver en mapa">⊕</span>
                    </div>

                    {/* Fila 2: badge de estado en su propia línea */}
                    <span className="status-badge" style={{ ...badge, display: 'inline-block', marginBottom: 8 }}>
                      {estado.lbl}
                    </span>

                    {/* Fila 3: info GPS */}
                    {gps ? (
                      <div className="vehicle-time">
                        {[
                          gps.vel > 0 && `${gps.vel} km/h`,
                          estado.dist !== undefined && (
                            estado.dist < 1000
                              ? `${Math.round(estado.dist)}m de planta`
                              : `${(estado.dist / 1000).toFixed(1)}km de planta`
                          ),
                        ].filter(Boolean).join(' · ')}
                      </div>
                    ) : (
                      <div className="vehicle-time" style={{ fontStyle: 'italic' }}>Sin señal GPS</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* ── Mapa en vivo ─────────────────────────────────── */}
        <section style={{ ...styles.section, padding: isMobile ? '14px 14px' : '24px 26px', marginTop: 12 }}>
          <div style={{ ...styles.fleetHeader, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase' }}>
              Mapa en vivo
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: "'DM Sans', sans-serif" }}>
                {gpsActual.length} unidades con señal
              </span>
              {!loading && (
                <UnitsDropdown
                  unidades={unidades}
                  gpsActual={gpsActual}
                  selectedUnitId={selectedUnitId}
                  onSelect={setSelectedUnitId}
                />
              )}
            </div>
          </div>
          {!loading && (
            <LiveFleetMap
              unidades={unidades}
              gpsActual={gpsActual}
              selectedUnitId={selectedUnitId}
              onSelectUnit={setSelectedUnitId}
            />
          )}
        </section>
      </main>
      {selectedVehicle && (
        <VehicleMapModal
          unidad={selectedVehicle.unidad}
          gps={selectedVehicle.gps}
          estado={selectedVehicle.estado}
          onClose={() => setSelectedVehicle(null)}
        />
      )}
    </div>
  )
}

// ─── DROPDOWN DE UNIDADES ────────────────────────────────────────────
function UnitsDropdown({ unidades, gpsActual, selectedUnitId, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
          background: open ? '#15803d' : '#16a34a',
          border: 'none', borderRadius: 7,
          padding: '6px 14px', cursor: 'pointer', color: '#fff',
          boxShadow: '0 2px 8px rgba(22,163,74,0.30)',
          transition: 'background 0.15s',
        }}
      >
        <svg width="13" height="11" viewBox="0 0 13 11" fill="none">
          <rect y="0" width="13" height="2" rx="1" fill="currentColor"/>
          <rect y="4.5" width="9" height="2" rx="1" fill="currentColor"/>
          <rect y="9" width="11" height="2" rx="1" fill="currentColor"/>
        </svg>
        Busca Flota
        <span style={{ fontSize: 9, opacity: 0.75 }}>{open ? '▲' : '▼'}</span>
      </button>

      {selectedUnitId && (
        <button
          onClick={() => onSelect(null)}
          title="Quitar selección"
          style={{
            width: 22, height: 22, borderRadius: '50%',
            background: '#dc2626', border: 'none',
            color: '#fff', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,.25)',
            flexShrink: 0,
          }}
        >
          ✕
        </button>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,.13)',
          zIndex: 10000, minWidth: 210, maxHeight: 320, overflowY: 'auto',
          padding: '6px 0',
        }}>
          {selectedUnitId && (
            <button
              onClick={() => { onSelect(null); setOpen(false) }}
              style={{
                width: '100%', textAlign: 'left', padding: '7px 14px',
                fontSize: 11, color: '#94a3b8', background: 'none', border: 'none',
                borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", marginBottom: 2,
              }}
            >
              ✕ Quitar selección
            </button>
          )}
          {unidades.map(u => {
            const gps    = gpsActual.find(g => g.unidad_id === u.id)
            const estado = getEstado(gps)
            const isSel  = selectedUnitId === u.id
            return (
              <button
                key={u.id}
                onClick={() => { onSelect(isSel ? null : u.id); setOpen(false) }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '9px 14px 9px 11px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: isSel ? `${estado.color}12` : 'none',
                  border: 'none', cursor: 'pointer',
                  borderLeft: `3px solid ${isSel ? estado.color : 'transparent'}`,
                  transition: 'background 0.12s',
                }}
              >
                <div style={{ width: 9, height: 9, borderRadius: '50%', background: estado.color, flexShrink: 0 }} />
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  fontWeight: isSel ? 700 : 500, color: '#0f172a', flex: 1,
                }}>
                  {u.nombre}
                </span>
                <span style={{
                  fontSize: 10, color: estado.color, fontWeight: 600,
                  fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                }}>
                  {estado.lbl}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── LIVE FLEET MAP ──────────────────────────────────────────────────
function LiveFleetMap({ unidades, gpsActual, selectedUnitId, onSelectUnit }) {
  const mapRef      = useRef(null)
  const mapInstance = useRef(null)
  const markers     = useRef([])

  // Inicializar mapa una sola vez
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return

    const map = L.map(mapRef.current, { zoomControl: true })
      .setView([DEPOT.lat, DEPOT.lng], 13)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map)

    const depotIcon = L.divIcon({
      className: '',
      html: '<div style="background:#F03226;width:14px;height:14px;border-radius:3px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    })
    L.marker([DEPOT.lat, DEPOT.lng], { icon: depotIcon })
      .addTo(map)
      .bindPopup('<strong>Depósito Sargo</strong><br><span style="font-size:11px;color:#64748b">Dep. Zapla, Godoy Cruz</span>')

    mapInstance.current = map
    return () => { map.remove(); mapInstance.current = null }
  }, [])

  // Actualizar markers en cada sync GPS o cambio de selección
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return

    markers.current.forEach(m => m.remove())
    markers.current = []

    const bounds = [[DEPOT.lat, DEPOT.lng]]

    unidades.forEach(u => {
      const gps    = gpsActual.find(g => g.unidad_id === u.id)
      if (!gps) return

      const estado = getEstado(gps)
      const isSel  = u.id === selectedUnitId

      const html = isSel
        ? `<div style="
            background: ${estado.color};
            color: #fff;
            font-family: 'DM Sans', sans-serif;
            font-size: 14px;
            font-weight: 800;
            padding: 6px 12px;
            border-radius: 8px;
            border: 3px solid #fff;
            box-shadow: 0 0 0 3px ${estado.color}, 0 4px 18px rgba(0,0,0,.45);
            white-space: nowrap;
            line-height: 1;
            transform: scale(1.15);
            transform-origin: bottom center;
          ">${u.nombre} ◀</div>`
        : `<div style="
            background: ${estado.color};
            color: #fff;
            font-family: 'DM Sans', sans-serif;
            font-size: 12px;
            font-weight: 700;
            padding: 4px 8px;
            border-radius: 7px;
            border: 2px solid rgba(255,255,255,0.9);
            box-shadow: 0 2px 8px rgba(0,0,0,.35);
            white-space: nowrap;
            line-height: 1;
          ">${u.nombre}</div>`

      const icon = L.divIcon({ className: '', html, iconAnchor: [20, 14], iconSize: null })

      const popup = `
        <div style="font-family:'DM Sans',sans-serif;min-width:130px;padding:2px 0">
          <div style="font-weight:700;font-size:15px;margin-bottom:5px">${u.nombre}</div>
          <div style="font-size:12px;color:${estado.color};font-weight:600;margin-bottom:3px">${estado.lbl}</div>
          ${gps.vel > 0 ? `<div style="font-size:11px;color:#64748b">${gps.vel} km/h</div>` : ''}
          ${u.patente ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${u.patente}</div>` : ''}
        </div>`

      const marker = L.marker([gps.lat, gps.lng], { icon, zIndexOffset: isSel ? 1000 : 0 })
        .addTo(map)
        .bindPopup(popup)
        .on('click', () => onSelectUnit(isSel ? null : u.id))

      markers.current.push(marker)
      bounds.push([gps.lat, gps.lng])

      // Si está seleccionado, centrar el mapa en él
      if (isSel) {
        map.setView([gps.lat, gps.lng], Math.max(map.getZoom(), 15), { animate: true })
        marker.openPopup()
      }
    })

    // Solo auto-fit si no hay selección activa
    if (!selectedUnitId && bounds.length > 1) {
      map.fitBounds(bounds, { padding: [44, 44], maxZoom: 15, animate: true })
    }
  }, [gpsActual, unidades, selectedUnitId])

  const mob = window.innerWidth < 768
  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: mob ? 260 : 460, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.06)' }}
    />
  )
}

// ─── MODAL INDIVIDUAL ────────────────────────────────────────────────
function VehicleMapModal({ unidad, gps, estado, onClose }) {
  const mapDivRef = useRef(null)

  useEffect(() => {
    if (!mapDivRef.current) return
    const center = gps ? [gps.lat, gps.lng] : [DEPOT.lat, DEPOT.lng]
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView(center, gps ? 15 : 14)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    // Depósito
    const depotIcon = L.divIcon({
      className: '',
      html: '<div style="background:#F03226;width:14px;height:14px;border-radius:3px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7],
    })
    L.marker([DEPOT.lat, DEPOT.lng], { icon: depotIcon })
      .addTo(map)
      .bindPopup('<strong>Depósito Sargo</strong><br>Dep. Zapla, Godoy Cruz')

    if (gps) {
      const vehicleIcon = L.divIcon({
        className: '',
        html: `<div style="background:${estado.color};width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.45)"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      })
      L.marker([gps.lat, gps.lng], { icon: vehicleIcon })
        .addTo(map)
        .bindPopup(`<strong>${unidad.nombre}</strong><br>${estado.lbl}${gps.vel > 0 ? '<br>' + gps.vel + ' km/h' : ''}`)
        .openPopup()

      L.polyline([[DEPOT.lat, DEPOT.lng], [gps.lat, gps.lng]], {
        color: estado.color, weight: 2, opacity: 0.35, dashArray: '6 6',
      }).addTo(map)
    }

    return () => { map.remove() }
  }, [])

  return (
    <div style={stylesMap.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={stylesMap.modal}>
        <div style={stylesMap.header}>
          <div>
            <div style={stylesMap.name}>{unidad.nombre}</div>
            {unidad.patente && <div style={stylesMap.plate}>{unidad.patente}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...stylesMap.badge, background: estado.color + '18', color: estado.color, border: `1px solid ${estado.color}44` }}>
              {estado.lbl}
            </span>
            <button onClick={onClose} style={stylesMap.btnClose}>✕</button>
          </div>
        </div>

        <div ref={mapDivRef} style={stylesMap.mapDiv} />

        <div style={stylesMap.footer}>
          {gps ? (
            <>
              <span>📍 {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}</span>
              {gps.vel > 0 && <span>· {gps.vel} km/h</span>}
              <span>· Motor: {gps.motor ? '🟢 ON' : '⚫ OFF'}</span>
            </>
          ) : (
            <span style={{ color: '#94a3b8' }}>Sin señal GPS — mostrando depósito</span>
          )}
        </div>
      </div>
    </div>
  )
}

const stylesMap = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  modal: { background: '#fff', borderRadius: 14, overflow: 'hidden', width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,.35)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #f1f5f9' },
  name: { fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 700, color: '#0f172a' },
  plate: { fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#94a3b8', letterSpacing: '0.04em', marginTop: 2 },
  badge: { fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.05em' },
  btnClose: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#94a3b8', padding: 4 },
  mapDiv: { width: '100%', height: 340 },
  footer: { display: 'flex', gap: 12, padding: '10px 18px', fontSize: 11, fontFamily: 'monospace', color: '#475569', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' },
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'transparent',
    fontFamily: "'Syne', system-ui, sans-serif",
    color: '#0f172a',
  },
  main: {
    maxWidth: 1400,
    margin: '0 auto',
    padding: '28px',
  },
  section: {
    background: 'rgba(255,255,255,0.82)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 18,
    border: '1px solid rgba(0,0,0,0.06)',
    padding: '24px 26px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04), 0 8px 28px rgba(0,0,0,0.06)',
  },
  fleetGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: 12,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  mapHint: {
    fontSize: 13,
    color: 'rgba(148,163,184,0.7)',
    lineHeight: 1,
    flexShrink: 0,
  },
  fleetHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
    flexWrap: 'wrap',
  },
  fleetStats: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  statPill: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 20,
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: 'nowrap',
  },
  empty: {
    textAlign: 'center',
    padding: 40,
    color: '#94a3b8',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
  },
}
