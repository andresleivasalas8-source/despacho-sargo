import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import { useIsMobile } from '../hooks/useIsMobile'

const TIPOS_HORMIGON = ['H-8', 'H-13', 'H-17', 'H-21', 'H-25', 'H-30', 'H-35', 'H-40', 'H ALIVIANADO', 'HDRC']
const DEPOT = { lat: -32.9310777, lng: -68.8202575 }

export default function Pedidos() {
  const isMobile = useIsMobile()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientes] = useState([])
  const [obras, setObras] = useState([])
  const [viajes, setViajes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCargaModal, setShowCargaModal] = useState(null)
  const [showEditModal, setShowEditModal] = useState(null)
  const [showFinalizarModal, setShowFinalizarModal] = useState(null)
  const [showEditViajeModal, setShowEditViajeModal] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [gpsActual, setGpsActual] = useState([])
  const [fechaSelec, setFechaSelec] = useState(() => new Date().toISOString().slice(0, 10))
  const navigate = useNavigate()

  useEffect(() => {
    checkUser()
    cargarDatos()

    const channel = supabase
      .channel('pedidos_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => cargarDatos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, () => cargarDatos())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fechaSelec])

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) navigate('/login')
    else setUser(user)
  }

  async function cargarDatos() {
    setLoading(true)
    const [pRes, cRes, oRes, uRes, gRes] = await Promise.all([
      supabase.from('pedidos').select('*').eq('fecha', fechaSelec).order('horario'),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('obras').select('*'),
      supabase.from('unidades').select('*'),
      supabase.from('gps_actual').select('*'),
    ])
    if (pRes.data) setPedidos(pRes.data)
    if (cRes.data) setClientes(cRes.data)
    if (oRes.data) setObras(oRes.data)
    if (uRes.data) setUnidades(uRes.data)
    if (gRes.data) setGpsActual(gRes.data)

    // Cargar viajes solo de los pedidos de esta fecha + activos de otras fechas
    const pedidoIds = pRes.data?.map(p => p.id) || []
    const vRes = pedidoIds.length > 0
      ? await supabase.from('viajes').select('*').in('pedido_id', pedidoIds)
      : { data: [] }
    setViajes(vRes.data || [])

    setLoading(false)
  }

  async function cancelarViaje(viaje) {
    if (!confirm(`¿Cancelar este viaje? Se eliminará permanentemente.`)) return
    await supabase.from('viajes').delete().eq('id', viaje.id)
  }

  async function eliminarPedido(p) {
    if (!confirm(`¿Eliminar pedido de "${getObraNombre(p.obra_id)}" y todos sus viajes?`)) return
    await supabase.from('pedidos').delete().eq('id', p.id)
  }

  function getClienteNombre(id) {
    return clientes.find(c => c.id === id)?.nombre || '—'
  }
  function getObraNombre(id) {
    return obras.find(o => o.id === id)?.nombre || '—'
  }

  function getEstadoPedido(p) {
    const pViajes = viajes.filter(v => v.pedido_id === p.id && v.estado !== 'cancelado')
    const m3Entregados = pViajes
      .filter(v => v.estado === 'done')
      .reduce((s, v) => s + parseFloat(v.m3_cargado), 0)
    const m3EnCurso = pViajes
      .filter(v => ['cargando', 'viaje', 'obra', 'volviendo'].includes(v.estado))
      .reduce((s, v) => s + parseFloat(v.m3_cargado), 0)
    const m3Restante = parseFloat(p.m3) - m3Entregados - m3EnCurso

    const ahora = new Date()
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes()
    const [hh, mm] = p.horario.split(':').map(Number)
    const horarioMin = hh * 60 + mm
    const minAtraso = ahoraMin - horarioMin
    const esHoy = p.fecha === new Date().toISOString().slice(0, 10)

    let alertColor = '#cbd5e1'
    let alertLabel = `programado para ${p.horario.slice(0, 5)}`
    let alertIcon = ''

    if (p.estado === 'completo') {
      alertColor = '#16a34a'
      alertLabel = `Completado · ${m3Entregados}m³ entregados`
      alertIcon = '✓'
    } else if (esHoy && pViajes.length === 0 && m3Restante > 0) {
      if (minAtraso > 15) {
        alertColor = '#dc2626'
        alertLabel = `ATRASADO ${minAtraso}min`
        alertIcon = '🔴'
      } else if (minAtraso > 0) {
        alertColor = '#d97706'
        alertLabel = `retrasado ${minAtraso}min`
        alertIcon = '🟡'
      } else if (minAtraso > -15) {
        alertColor = '#16a34a'
        alertLabel = `próximo en ${Math.abs(minAtraso)}min`
      }
    } else if (esHoy && pViajes.length > 0 && m3Restante > 0) {
      const obra = obras.find(o => o.id === p.obra_id)
      const frecMin = obra?.frec_min || 30
      const ultimoViaje = [...pViajes].sort((a, b) =>
        (b.cargando_at || '').localeCompare(a.cargando_at || '')
      )[0]
      if (ultimoViaje?.cargando_at) {
        const ult = new Date(ultimoViaje.cargando_at)
        const desdeUltimo = Math.floor((Date.now() - ult.getTime()) / 60000)
        if (desdeUltimo > frecMin + 15) {
          alertColor = '#dc2626'
          alertLabel = `frecuencia atrasada ${desdeUltimo}min`
          alertIcon = '🔴'
        } else if (desdeUltimo > frecMin) {
          alertColor = '#d97706'
          alertLabel = `frec demorada ${desdeUltimo}min`
          alertIcon = '🟡'
        } else {
          alertColor = '#16a34a'
          alertLabel = `en tiempo (${desdeUltimo}/${frecMin}min)`
        }
      }
    } else if (m3Restante <= 0 && pViajes.length > 0 && p.estado !== 'completo') {
      alertColor = '#3b82f6'
      alertLabel = 'listo para finalizar'
      alertIcon = '🔵'
    }

    const m3Total = p.m3_real != null ? parseFloat(p.m3_real) : parseFloat(p.m3)
    const pct = Math.round((m3Entregados / m3Total) * 100)
    return { m3Entregados, m3EnCurso, m3Restante, alertColor, alertLabel, alertIcon, pct, viajes: pViajes }
  }

  return (
    <div style={styles.container}>
      <Header active="pedidos" user={user} />

      <main style={{ ...styles.main, padding: isMobile ? 12 : 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase' }}>Pedidos</h2>
        <div style={styles.toolbar}>
          <div style={styles.fechaWrap}>
            <label style={styles.fechaLabel}>Fecha</label>
            <input
              type="date"
              value={fechaSelec}
              onChange={e => setFechaSelec(e.target.value)}
              style={styles.fechaInput}
            />
            <button onClick={() => setFechaSelec(new Date().toISOString().slice(0, 10))} style={styles.btnHoy}>Hoy</button>
          </div>
          <button onClick={() => setShowForm(true)} style={styles.btnPrimary}>
            + Nuevo pedido
          </button>
        </div>
{/* ── LIVE TRIPS ── */}
        {(() => {
          const viajesActivos = viajes.filter(v => v.estado !== 'done' && v.estado !== 'cancelado' && pedidos.some(p => p.id === v.pedido_id))
          if (viajesActivos.length === 0) return null
          return (
            <section style={{...styles.liveTripsSection}}>
              <h2 className="section-title">Live Trips · {viajesActivos.length} {viajesActivos.length === 1 ? 'viaje activo' : 'viajes activos'}</h2>
              <div style={styles.tripsList}>
                {viajesActivos.map(v => {
                  const ped = pedidos.find(p => p.id === v.pedido_id)
                  const unidad = unidades.find(u => u.id === v.unidad_id)
                  const obra = obras.find(o => o.id === ped?.obra_id)
                  const cli = clientes.find(c => c.id === ped?.cliente_id)
                  const gps = gpsActual.find(g => g.unidad_id === v.unidad_id)
                  const tIda = obra?.t_ida_maps || 30
                  const tDesc = obra?.desc_min || 30
                  const tiempos = { cargando: 15, viaje: tIda, obra: tDesc, volviendo: tIda }

                  return (
                    <TripCard
                      key={v.id}
                      viaje={v}
                      pedido={ped}
                      unidad={unidad}
                      obra={obra}
                      cliente={cli}
                      gps={gps}
                      tiemposEsperados={tiempos}
                      onCancelar={() => cancelarViaje(v)}
                      onEditar={() => setShowEditViajeModal(v)}
                    />
                  )
                })}
              </div>
            </section>
          )
        })()}

        <h2 className="section-title">Pedidos del día</h2>
        {loading ? (
          <div style={styles.empty}>Cargando...</div>
        ) : pedidos.length === 0 ? (
          <div style={styles.empty}>
            No hay pedidos para esta fecha.
            <br />
            <button onClick={() => setShowForm(true)} style={{ ...styles.btnPrimary, marginTop: 14 }}>
              + Crear primer pedido
            </button>
          </div>
        ) : (
          <div style={styles.pedidosList}>
            {pedidos.map(p => {
              const e = getEstadoPedido(p)
              const completo = p.estado === 'completo'
              return (
                <div
                  key={p.id}
                  style={{
                    ...styles.pedidoCard,
                    borderColor: e.alertColor,
                    background: e.alertIcon === '🔴' ? '#fef2f2' : e.alertIcon === '🟡' ? '#fffbeb' : completo ? '#f0fdf4' : '#fff',
                    opacity: completo ? 0.85 : 1,
                  }}
                >
                  <div style={styles.pedidoHeader}>
                    <div style={{ flex: 1 }}>
                      <div style={styles.pedidoTitle}>
                        {e.alertIcon && <span>{e.alertIcon}</span>}
                        <strong style={styles.clienteNameMain}>{getClienteNombre(p.cliente_id)}</strong>
                        <span style={styles.horario}>{p.horario.slice(0, 5)}</span>
                        <span style={styles.tag}>
                          {p.m3_real != null ? `${p.m3_real}m³ (real)` : `${p.m3}m³`}
                        </span>
                        {p.corte != null && (
                          <span style={styles.tagCorte}>
                            {p.corte > 0 ? `+${p.corte}m³ corte` : '+ corte'}
                          </span>
                        )}
                        <span style={styles.tagTipo}>{p.tipo_hormigon}</span>
                        {p.con_bomba && <span style={styles.tagBomba}>BOMBA</span>}
                        {completo && <span style={styles.tagCompleto}>COMPLETO</span>}
                      </div>
                      <div style={styles.obraNameSub}>
                        {getObraNombre(p.obra_id)}
                        {p.observaciones && <span style={styles.obs}> · {p.observaciones}</span>}
                      </div>
                      <div style={{ ...styles.alertText, color: e.alertColor }}>{e.alertLabel}</div>
                    </div>
                    <div style={styles.pedidoMeta}>
                      <div style={styles.metaLine}>
                        Entregado: <strong>{e.m3Entregados}/{p.m3_real != null ? p.m3_real : p.m3}m³</strong> ({e.pct}%)
                      </div>
                      {e.m3EnCurso > 0 && (
                        <div style={{ ...styles.metaLine, color: '#3b82f6' }}>
                          En curso: {e.m3EnCurso}m³ ({e.viajes.filter(v => v.estado !== 'done').length} mixers)
                        </div>
                      )}
                      {e.m3Restante > 0 && !completo && (
                        <div style={{ ...styles.metaLine, color: '#d97706' }}>
                          Restan: {e.m3Restante}m³
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${Math.min(100, e.pct)}%` }}></div>
                    {e.m3EnCurso > 0 && !completo && (
                      <div style={{
                        ...styles.progressInProgress,
                        width: `${(e.m3EnCurso / parseFloat(p.m3_real != null ? p.m3_real : p.m3)) * 100}%`,
                        left: `${e.pct}%`,
                      }}></div>
                    )}
                  </div>

                  <div style={styles.pedidoActions}>
                    {!completo && e.m3Restante > 0 && (
                      <button onClick={() => setShowCargaModal(p)} style={styles.btnIniciar}>
                        + Iniciar carga
                      </button>
                    )}
                    {!completo && e.viajes.filter(v => v.estado === 'done').length > 0 && (
                      <button onClick={() => setShowFinalizarModal(p)} style={styles.btnFinalizar}>
                        ✓ Finalizar
                      </button>
                    )}
                    {!completo && (
                      <button onClick={() => setShowEditModal(p)} style={styles.btnSm}>
                        ✎ Editar
                      </button>
                    )}
                    <button onClick={() => eliminarPedido(p)} style={styles.btnSmDanger}>✕ Eliminar</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {showForm && (
        <PedidoForm
          fecha={fechaSelec}
          clientes={clientes}
          obras={obras}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); cargarDatos() }}
        />
      )}

      {showCargaModal && (
        <CargaModal
          pedido={showCargaModal}
          obras={obras}
          clientes={clientes}
          onClose={() => setShowCargaModal(null)}
          onSaved={() => { setShowCargaModal(null); cargarDatos() }}
          getEstadoPedido={getEstadoPedido}
        />
      )}

      {showEditModal && (
        <EditarPedidoModal
          pedido={showEditModal}
          clientes={clientes}
          obras={obras}
          onClose={() => setShowEditModal(null)}
          onSaved={() => { setShowEditModal(null); cargarDatos() }}
        />
      )}
{showEditViajeModal && (
        <EditarViajeModal
          viaje={showEditViajeModal}
          unidades={unidades}
          onClose={() => setShowEditViajeModal(null)}
          onSaved={() => { setShowEditViajeModal(null); cargarDatos() }}
        />
      )}
      {showFinalizarModal && (
        <FinalizarPedidoModal
          pedido={showFinalizarModal}
          obras={obras}
          clientes={clientes}
          onClose={() => setShowFinalizarModal(null)}
          onSaved={() => { setShowFinalizarModal(null); cargarDatos() }}
          getEstadoPedido={getEstadoPedido}
        />
      )}
    </div>
  )
}
// ─── COMPONENTE: TARJETA DE VIAJE ACTIVO ────────────────────────────
function TripCard({ viaje, pedido, unidad, obra, cliente, gps, tiemposEsperados, onCancelar, onEditar }) {
  const ETAPAS = [
    { key: 'cargando', lbl: 'Cargando', tsField: 'cargando_at' },
    { key: 'viaje', lbl: 'Camino a obra', tsField: 'viaje_at' },
    { key: 'obra', lbl: 'En obra', tsField: 'obra_at' },
    { key: 'volviendo', lbl: 'Volviendo', tsField: 'volviendo_at' },
  ]
  const etapaActualIdx = ETAPAS.findIndex(e => e.key === viaje.estado)
  const ahora = Date.now()
  let tEtapaActualMin = 0
  if (etapaActualIdx >= 0) {
    const ts = viaje[ETAPAS[etapaActualIdx].tsField]
    if (ts) tEtapaActualMin = Math.floor((ahora - new Date(ts).getTime()) / 60000)
  }
  const tEsperadoActual = tiemposEsperados[viaje.estado] || 0
  const pctActual = tEsperadoActual > 0 ? Math.min(100, (tEtapaActualMin / tEsperadoActual) * 100) : 0
  const atrasado = tEsperadoActual > 0 && tEtapaActualMin > tEsperadoActual

  let colorActual = '#3b82f6'
  if (atrasado) colorActual = tEtapaActualMin > tEsperadoActual * 1.5 ? '#dc2626' : '#d97706'
  else if (viaje.estado === 'cargando') colorActual = '#f59e0b'
  else if (viaje.estado === 'obra') colorActual = '#8b5cf6'

  return (
    <div style={{...stylesTrip.card, borderLeftColor: colorActual}}>
      <div style={stylesTrip.head}>
        <div style={{flex: 1}}>
          <div style={stylesTrip.headTop}>
            <strong style={stylesTrip.unidadName}>
              {unidad ? `${unidad.nombre}${unidad.patente ? ' · ' + unidad.patente : ''}` : 'Mixer ?'}
            </strong>
            <span style={stylesTrip.m3Tag}>{viaje.m3_cargado}m³</span>
            {pedido && <span style={stylesTrip.tipoTag}>{pedido.tipo_hormigon}</span>}
          </div>
          <div style={stylesTrip.subtitle}>
            <strong>{obra?.nombre || '—'}</strong> · {cliente?.nombre || '—'}
          </div>
        </div>
        <div style={stylesTrip.headRight}>
          <div style={{...stylesTrip.estadoChip, background: colorActual + '15', color: colorActual, borderColor: colorActual}}>
            {ETAPAS[etapaActualIdx]?.lbl || viaje.estado}
          </div>
          <button onClick={onEditar} style={stylesTrip.btnEditar} title="Editar viaje">✎</button>
          <button onClick={onCancelar} style={stylesTrip.btnCancelar} title="Cancelar viaje">✕</button>
        </div>
      </div>

      <div style={stylesTrip.etapas}>
        {ETAPAS.map((etapa, idx) => {
          const completada = idx < etapaActualIdx
          const actual = idx === etapaActualIdx
          const ts = viaje[etapa.tsField]
          const tEsperado = tiemposEsperados[etapa.key]
          let tReal = null
          if (completada && ts) {
            const siguiente = ETAPAS[idx + 1]
            const tsSig = siguiente ? viaje[siguiente.tsField] : null
            if (tsSig) tReal = Math.round((new Date(tsSig).getTime() - new Date(ts).getTime()) / 60000)
          } else if (actual) {
            tReal = tEtapaActualMin
          }
          const tDif = tReal !== null && tEsperado ? tReal - tEsperado : null
          return (
            <div key={etapa.key} style={stylesTrip.etapaCol}>
              <div style={{...stylesTrip.etapaCircle, background: completada ? '#16a34a' : actual ? colorActual : '#e2e8f0', color: completada || actual ? '#fff' : '#94a3b8'}}>
                {completada ? '✓' : idx + 1}
              </div>
              <div style={{...stylesTrip.etapaLbl, color: completada || actual ? '#0f172a' : '#94a3b8', fontWeight: actual ? 600 : 400}}>{etapa.lbl}</div>
              <div style={stylesTrip.etapaTimes}>
                {tReal !== null ? (
                  <span style={{color: actual && atrasado ? '#dc2626' : completada && tDif > 5 ? '#d97706' : completada ? '#16a34a' : '#475569', fontWeight: 500}}>
                    {tReal}min
                  </span>
                ) : (
                  <span style={{color: '#cbd5e1'}}>—</span>
                )}
                {tEsperado > 0 && <span style={stylesTrip.tEsperado}> / {tEsperado}min</span>}
              </div>
            </div>
          )
        })}
      </div>

      {etapaActualIdx >= 0 && tEsperadoActual > 0 && (
        <div style={stylesTrip.progressWrap}>
          <div style={stylesTrip.progressBar}>
            <div style={{...stylesTrip.progressFill, width: `${pctActual}%`, background: colorActual}}></div>
          </div>
          <div style={stylesTrip.progressLabel}>
            {atrasado ? (
              <span style={{color: '#dc2626', fontWeight: 600}}>⚠ Atrasado {tEtapaActualMin - tEsperadoActual}min</span>
            ) : (
              <span style={{color: '#475569'}}>{tEtapaActualMin}/{tEsperadoActual}min · faltan {tEsperadoActual - tEtapaActualMin}min</span>
            )}
          </div>
        </div>
      )}

      {gps && (
        <div style={stylesTrip.gpsLine}>
          <span style={{color: '#64748b'}}>📍</span>
          {gps.vel > 0 && <span>{gps.vel} km/h · </span>}
          <span>motor: {gps.motor ? 'ON' : 'OFF'}</span>
        </div>
      )}
    </div>
  )
}

// ─── MODAL DE EDITAR VIAJE ──────────────────────────────────────────
function EditarViajeModal({ viaje, unidades, onClose, onSaved }) {
  const [unidadId, setUnidadId] = useState(viaje.unidad_id)
  const [m3, setM3] = useState(String(viaje.m3_cargado))
  const [estado, setEstado] = useState(viaje.estado)
  const [saving, setSaving] = useState(false)
  const mixers = unidades.filter(u => u.tipo === 'mixer' && u.operativo)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const upd = {
      unidad_id: unidadId,
      m3_cargado: parseFloat(m3),
      estado,
    }
    // Si el estado cambió, registrar timestamp
    const ahora = new Date().toISOString()
    if (estado !== viaje.estado) {
      if (estado === 'viaje' && !viaje.viaje_at) upd.viaje_at = ahora
      if (estado === 'obra' && !viaje.obra_at) upd.obra_at = ahora
      if (estado === 'volviendo' && !viaje.volviendo_at) upd.volviendo_at = ahora
      if (estado === 'done' && !viaje.done_at) upd.done_at = ahora
    }
    const { error } = await supabase.from('viajes').update(upd).eq('id', viaje.id)
    setSaving(false)
    if (error) { alert('Error: ' + error.message); return }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Editar viaje</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Mixer asignado</label>
          <select value={unidadId} onChange={e => setUnidadId(e.target.value)} required style={styles.input}>
            {mixers.map(u => <option key={u.id} value={u.id}>{u.nombre} - {u.patente}</option>)}
          </select>
        </div>

        <div style={styles.row2}>
          <div style={styles.formGroup}>
            <label style={styles.label}>m³ cargados</label>
            <input type="number" value={m3} onChange={e => setM3(e.target.value)} min="0.5" max="14" step="0.5" required style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Estado actual</label>
            <select value={estado} onChange={e => setEstado(e.target.value)} style={styles.input}>
              <option value="cargando">Cargando</option>
              <option value="viaje">Camino a obra</option>
              <option value="obra">En obra</option>
              <option value="volviendo">Volviendo</option>
              <option value="done">Completado</option>
            </select>
          </div>
        </div>

        <div style={styles.warningBox}>
          ℹ Modificar el estado manualmente sobreescribe la detección automática por GPS. Usá esto solo si el GPS no detectó bien una transición.
        </div>

        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}
// ─── MODAL DE INICIAR CARGA ─────────────────────────────────────────
function CargaModal({ pedido, obras, clientes, onClose, onSaved, getEstadoPedido }) {
  const [unidades, setUnidades] = useState([])
  const [gpsActual, setGpsActual] = useState([])
  const [unidadId, setUnidadId] = useState('')
  const [m3, setM3] = useState('7')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function cargar() {
      const [uRes, gRes] = await Promise.all([
        supabase.from('unidades').select('*').eq('tipo', 'mixer').eq('operativo', true).order('nombre'),
        supabase.from('gps_actual').select('*'),
      ])
      if (uRes.data) setUnidades(uRes.data)
      if (gRes.data) setGpsActual(gRes.data)
    }
    cargar()
  }, [])

  function distEnPlanta(unidadId) {
    const gps = gpsActual.find(g => g.unidad_id === unidadId)
    if (!gps) return null
    const R = 6371000
    const dL = (DEPOT.lat - gps.lat) * Math.PI / 180
    const dG = (DEPOT.lng - gps.lng) * Math.PI / 180
    const x = Math.sin(dL/2)**2 + Math.cos(gps.lat*Math.PI/180) * Math.cos(DEPOT.lat*Math.PI/180) * Math.sin(dG/2)**2
    return Math.round(R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)))
  }

  const mixersOrdenados = [...unidades].map(u => {
    const dist = distEnPlanta(u.id)
    return { ...u, dist }
  }).sort((a, b) => {
    if (a.dist === null && b.dist === null) return 0
    if (a.dist === null) return 1
    if (b.dist === null) return -1
    return a.dist - b.dist
  })

  const m3Restante = getEstadoPedido(pedido).m3Restante
  const obraNombre = obras.find(o => o.id === pedido.obra_id)?.nombre || '—'
  const clienteNombre = clientes.find(c => c.id === pedido.cliente_id)?.nombre || '—'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!unidadId) {
      alert('Seleccioná un mixer')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('viajes').insert({
      pedido_id: pedido.id,
      unidad_id: unidadId,
      m3_cargado: parseFloat(m3),
      estado: 'cargando',
      cargando_at: new Date().toISOString(),
    })

    if (pedido.estado === 'pendiente') {
      await supabase.from('pedidos').update({ estado: 'en_curso' }).eq('id', pedido.id)
    }

    setSaving(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Iniciar carga</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        <div style={styles.cargaInfo}>
          <div><strong>{obraNombre}</strong> · {clienteNombre}</div>
          <div style={styles.cargaSubinfo}>
            {pedido.tipo_hormigon} · Pedido total: {pedido.m3}m³ · Restante: <strong>{m3Restante}m³</strong>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Mixer a asignar (en planta primero)</label>
          <select value={unidadId} onChange={e => setUnidadId(e.target.value)} required style={styles.input}>
            <option value="">— Seleccioná un mixer —</option>
            {mixersOrdenados.map(u => {
              const enPlanta = u.dist !== null && u.dist <= 200
              const label = u.dist === null
                ? `${u.nombre} - ${u.patente} (sin GPS)`
                : enPlanta
                  ? `✓ ${u.nombre} - ${u.patente} · en planta (${u.dist}m)`
                  : `${u.nombre} - ${u.patente} · a ${u.dist < 1000 ? u.dist + 'm' : (u.dist/1000).toFixed(1) + 'km'}`
              return <option key={u.id} value={u.id}>{label}</option>
            })}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>m³ a cargar</label>
          <input
            type="number" value={m3} onChange={e => setM3(e.target.value)}
            min="0.5" max="14" step="0.5" required style={styles.input}
          />
          <small style={styles.hint}>
            Capacidad mixer: 7m³. Si el restante es menor, ajustá.
          </small>
        </div>

        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Iniciando...' : 'Iniciar carga'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── MODAL DE EDITAR PEDIDO ─────────────────────────────────────────
function EditarPedidoModal({ pedido, clientes, obras, onClose, onSaved }) {
  const [m3, setM3] = useState(String(pedido.m3))
  const [tipoHormigon, setTipoHormigon] = useState(pedido.tipo_hormigon)
  const [conBomba, setConBomba] = useState(pedido.con_bomba)
  const [observaciones, setObservaciones] = useState(pedido.observaciones || '')
  const [tieneCorte, setTieneCorte] = useState(pedido.corte != null)
  const [corte, setCorte] = useState(pedido.corte != null && pedido.corte > 0 ? String(pedido.corte) : '')
  const [horario, setHorario] = useState(pedido.horario.slice(0, 5))
  const [fechaPed, setFechaPed] = useState(pedido.fecha)
  const [obraId, setObraId] = useState(pedido.obra_id)
  const [clienteId, setClienteId] = useState(pedido.cliente_id)
  const [saving, setSaving] = useState(false)

  const obrasFiltradas = obras.filter(o => o.cliente_id === clienteId)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('pedidos').update({
      cliente_id: clienteId,
      obra_id: obraId,
      fecha: fechaPed,
      horario: horario + ':00',
      m3: parseFloat(m3),
      tipo_hormigon: tipoHormigon,
      con_bomba: conBomba,
      observaciones: observaciones.trim() || null,
      corte: tieneCorte ? (corte !== '' ? parseFloat(corte) : 0) : null,
    }).eq('id', pedido.id)
    setSaving(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Editar pedido</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        <div style={styles.row2}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Fecha</label>
            <input type="date" value={fechaPed} onChange={e => setFechaPed(e.target.value)} required style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Horario entrega</label>
            <input type="time" value={horario} onChange={e => setHorario(e.target.value)} required style={styles.input} />
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Cliente</label>
          <select value={clienteId} onChange={e => { setClienteId(e.target.value); setObraId('') }} required style={styles.input}>
            <option value="">— Seleccioná un cliente —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Obra</label>
          <select value={obraId} onChange={e => setObraId(e.target.value)} required disabled={!clienteId} style={styles.input}>
            <option value="">{clienteId ? '— Seleccioná una obra —' : '— Primero elegí un cliente —'}</option>
            {obrasFiltradas.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
        </div>

        <div style={styles.row3}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Total m³</label>
            <input type="number" value={m3} onChange={e => setM3(e.target.value)} min="0.5" max="500" step="0.5" required style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Tipo hormigón</label>
            <select value={tipoHormigon} onChange={e => setTipoHormigon(e.target.value)} required style={styles.input}>
              {TIPOS_HORMIGON.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>¿Con bomba?</label>
            <select value={conBomba ? 'si' : 'no'} onChange={e => setConBomba(e.target.value === 'si')} style={styles.input}>
              <option value="no">Sin bomba</option>
              <option value="si">Con bomba</option>
            </select>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Más corte</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 400, fontSize: 13, color: '#475569', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={tieneCorte}
                onChange={e => { setTieneCorte(e.target.checked); if (!e.target.checked) setCorte('') }}
                style={{ width: 'auto', cursor: 'pointer', accentColor: '#16a34a' }}
              />
              ¿Tiene corte?
            </label>
            {tieneCorte && (
              <input
                type="number"
                value={corte}
                onChange={e => setCorte(e.target.value)}
                placeholder="m³ (opcional)"
                min="0" max="7" step="0.5"
                style={{ ...styles.input, width: 140 }}
              />
            )}
          </div>
          {tieneCorte && <small style={styles.hint}>Dejá vacío para indicar "más corte" sin cantidad exacta.</small>}
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Observaciones</label>
          <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)} style={styles.input} placeholder="Ej: pluma 30m, acceso por calle lateral, etc." />
        </div>

        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── MODAL DE FINALIZAR PEDIDO ──────────────────────────────────────
function FinalizarPedidoModal({ pedido, obras, clientes, onClose, onSaved, getEstadoPedido }) {
  const estado = getEstadoPedido(pedido)
  const [m3Real, setM3Real] = useState(String(estado.m3Entregados))
  const [observacionesFinal, setObservacionesFinal] = useState('')
  const [saving, setSaving] = useState(false)

  const obraNombre = obras.find(o => o.id === pedido.obra_id)?.nombre || '—'
  const clienteNombre = clientes.find(c => c.id === pedido.cliente_id)?.nombre || '—'
  const m3Pedido = parseFloat(pedido.m3)
  const m3RealNum = parseFloat(m3Real) || 0
  const diff = m3RealNum - m3Pedido
  const tieneViajesEnCurso = estado.m3EnCurso > 0

  async function handleSubmit(e) {
    e.preventDefault()
    if (tieneViajesEnCurso) {
      if (!confirm('Hay viajes en curso. ¿Estás seguro de finalizar el pedido?')) return
    }
    setSaving(true)

    const obsActual = pedido.observaciones || ''
    const obsFinal = observacionesFinal.trim()
      ? (obsActual ? obsActual + ' · ' : '') + 'CIERRE: ' + observacionesFinal.trim()
      : obsActual

    const { error } = await supabase.from('pedidos').update({
      estado: 'completo',
      m3_real: m3RealNum,
      observaciones: obsFinal || null,
    }).eq('id', pedido.id)

    setSaving(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Finalizar pedido</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        <div style={styles.cargaInfo}>
          <div><strong>{obraNombre}</strong> · {clienteNombre}</div>
          <div style={styles.cargaSubinfo}>
            {pedido.tipo_hormigon} · {pedido.horario.slice(0, 5)}
          </div>
        </div>

        <div style={styles.resumenBox}>
          <div style={styles.resumenRow}>
            <span style={styles.resumenLbl}>Pedido inicial:</span>
            <strong>{m3Pedido}m³</strong>
          </div>
          <div style={styles.resumenRow}>
            <span style={styles.resumenLbl}>Entregado real:</span>
            <strong style={{color: '#16a34a'}}>{estado.m3Entregados}m³ en {estado.viajes.filter(v => v.estado === 'done').length} viajes</strong>
          </div>
          {estado.m3EnCurso > 0 && (
            <div style={styles.resumenRow}>
              <span style={styles.resumenLbl}>En curso (no contados):</span>
              <strong style={{color: '#3b82f6'}}>{estado.m3EnCurso}m³</strong>
            </div>
          )}
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>m³ FINAL del pedido</label>
          <input
            type="number" value={m3Real} onChange={e => setM3Real(e.target.value)}
            min="0" max="500" step="0.1" required autoFocus style={styles.input}
          />
          <small style={styles.hint}>
            {diff > 0 && <span style={{color: '#d97706'}}>⬆ {diff.toFixed(1)}m³ más que lo pedido</span>}
            {diff < 0 && <span style={{color: '#3b82f6'}}>⬇ {Math.abs(diff).toFixed(1)}m³ menos que lo pedido</span>}
            {diff === 0 && <span style={{color: '#16a34a'}}>✓ Coincide con el pedido inicial</span>}
          </small>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Motivo del ajuste (opcional)</label>
          <input
            type="text" value={observacionesFinal} onChange={e => setObservacionesFinal(e.target.value)}
            style={styles.input}
            placeholder="Ej: el cliente pidió 2m³ más, sobró 1m³, etc."
          />
        </div>

        {tieneViajesEnCurso && (
          <div style={styles.warningBox}>
            ⚠ Hay {estado.viajes.filter(v => v.estado !== 'done').length} viajes en curso. Si finalizás ahora, esos viajes quedarán marcados como activos pero el pedido pasará a "completo".
          </div>
        )}

        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={{...styles.btnPrimary, background: '#16a34a'}}>
            {saving ? 'Finalizando...' : '✓ Finalizar pedido'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── FORMULARIO DE NUEVO PEDIDO ─────────────────────────────────────
function PedidoForm({ fecha, clientes, obras, onClose, onSaved }) {
  const [clienteId, setClienteId] = useState('')
  const [obraId, setObraId] = useState('')
  const [m3, setM3] = useState('7')
  const [tipoHormigon, setTipoHormigon] = useState('H-25')
  const [conBomba, setConBomba] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  const [tieneCorte, setTieneCorte] = useState(false)
  const [corte, setCorte] = useState('')
  const [horario, setHorario] = useState(() => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [fechaPed, setFechaPed] = useState(fecha)
  const [saving, setSaving] = useState(false)

  const obrasFiltradas = obras.filter(o => o.cliente_id === clienteId)

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371
    const dL = (lat2 - lat1) * Math.PI / 180
    const dG = (lng2 - lng1) * Math.PI / 180
    const x = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dG/2)**2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x))
  }

  const obra = obras.find(o => o.id === obraId)
  const distInfo = obra
    ? (obra.dist_km_maps
        ? `${obra.dist_km_maps}km (Maps) · ${obra.t_ida_maps || '—'}min ida`
        : `${haversineKm(DEPOT.lat, DEPOT.lng, parseFloat(obra.lat), parseFloat(obra.lng)).toFixed(1)}km (estimado)`)
    : null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!clienteId || !obraId) {
      alert('Seleccioná cliente y obra')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('pedidos').insert({
      fecha: fechaPed,
      horario: horario + ':00',
      cliente_id: clienteId,
      obra_id: obraId,
      m3: parseFloat(m3),
      tipo_hormigon: tipoHormigon,
      con_bomba: conBomba,
      observaciones: observaciones.trim() || null,
      corte: tieneCorte ? (corte !== '' ? parseFloat(corte) : 0) : null,
      estado: 'pendiente',
    })
    setSaving(false)
    if (error) {
      alert('Error: ' + error.message)
      return
    }
    onSaved()
  }

  return (
    <div style={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={handleSubmit} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Nuevo pedido de hormigón</h3>
          <button type="button" onClick={onClose} style={styles.btnClose}>✕</button>
        </div>

        <div style={styles.row2}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Fecha</label>
            <input type="date" value={fechaPed} onChange={e => setFechaPed(e.target.value)}
              min={new Date().toISOString().slice(0, 10)} required style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Horario entrega</label>
            <input type="time" value={horario} onChange={e => setHorario(e.target.value)} required style={styles.input} />
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Cliente</label>
          <select value={clienteId} onChange={e => { setClienteId(e.target.value); setObraId('') }} required style={styles.input}>
            <option value="">— Seleccioná un cliente —</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Obra</label>
          <select value={obraId} onChange={e => setObraId(e.target.value)} required disabled={!clienteId} style={styles.input}>
            <option value="">{clienteId ? '— Seleccioná una obra —' : '— Primero elegí un cliente —'}</option>
            {obrasFiltradas.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
          </select>
          {distInfo && <div style={styles.distInfo}>📍 {distInfo}</div>}
        </div>

        <div style={styles.row3}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Total m³</label>
            <input type="number" value={m3} onChange={e => setM3(e.target.value)}
              min="0.5" max="500" step="0.5" required style={styles.input} />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Tipo hormigón</label>
            <select value={tipoHormigon} onChange={e => setTipoHormigon(e.target.value)} required style={styles.input}>
              {TIPOS_HORMIGON.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>¿Con bomba?</label>
            <select value={conBomba ? 'si' : 'no'} onChange={e => setConBomba(e.target.value === 'si')} style={styles.input}>
              <option value="no">Sin bomba</option>
              <option value="si">Con bomba</option>
            </select>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Más corte</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 400, fontSize: 13, color: '#475569', textTransform: 'none', letterSpacing: 0 }}>
              <input
                type="checkbox"
                checked={tieneCorte}
                onChange={e => { setTieneCorte(e.target.checked); if (!e.target.checked) setCorte('') }}
                style={{ width: 'auto', cursor: 'pointer', accentColor: '#16a34a' }}
              />
              ¿Tiene corte?
            </label>
            {tieneCorte && (
              <input
                type="number"
                value={corte}
                onChange={e => setCorte(e.target.value)}
                placeholder="m³ (opcional)"
                min="0" max="7" step="0.5"
                style={{ ...styles.input, width: 140 }}
              />
            )}
          </div>
          {tieneCorte && <small style={styles.hint}>Dejá vacío para indicar "más corte" sin cantidad exacta.</small>}
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>Observaciones</label>
          <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)}
            style={styles.input} placeholder="Ej: pluma 30m, acceso por calle lateral, etc." />
        </div>

        <div style={styles.modalActions}>
          <button type="button" onClick={onClose} style={styles.btnSecondary}>Cancelar</button>
          <button type="submit" disabled={saving} style={styles.btnPrimary}>
            {saving ? 'Guardando...' : 'Guardar pedido'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── ESTILOS ────────────────────────────────────────────────────────
const styles = {
  container: { minHeight: '100vh', background: 'transparent', fontFamily: "'Syne', system-ui, sans-serif" },
  main: { maxWidth: 1100, margin: '0 auto', padding: 24 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  fechaWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  fechaLabel: { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  fechaInput: { padding: '8px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, fontFamily: 'inherit' },
  btnHoy: { fontSize: 12, padding: '8px 12px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { background: '#fff', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  btnSm: { fontSize: 11, padding: '5px 12px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' },
  btnSmDanger: { fontSize: 11, padding: '5px 10px', background: '#fff', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' },
  empty: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' },
  pedidosList: { display: 'flex', flexDirection: 'column', gap: 10 },
  pedidoCard: { borderRadius: 10, border: '2px solid', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  pedidoHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 },
  pedidoTitle: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  obraName: { fontSize: 14, color: '#0f172a' },
  clienteNameMain: { fontSize: 17, color: '#0f172a', fontWeight: 700 },
  obraNameSub: { fontSize: 13, color: '#64748b', fontFamily: 'monospace', marginBottom: 2 },
  horario: { fontSize: 13, fontFamily: 'monospace', color: '#475569', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 },
  tag: { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a' },
  tagTipo: { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#e2e8f0', color: '#475569' },
  tagBomba: { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#ede9fe', color: '#7c3aed' },
  tagCompleto: { fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#16a34a', color: '#fff' },
  tagCorte: { fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' },
  clienteName: { fontSize: 12, color: '#64748b', fontFamily: 'monospace' },
  obs: { fontStyle: 'italic' },
  alertText: { fontSize: 12, fontWeight: 600, marginTop: 4, fontFamily: 'monospace' },
  pedidoMeta: { textAlign: 'right' },
  metaLine: { fontSize: 12, fontFamily: 'monospace', color: '#475569', marginBottom: 2 },
  progressBar: { height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', position: 'relative', marginBottom: 10 },
  progressFill: { height: '100%', background: '#16a34a', transition: 'width 0.3s' },
  progressInProgress: { position: 'absolute', top: 0, height: '100%', background: '#3b82f6', opacity: 0.6 },
  pedidoActions: { display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' },
  btnIniciar: { fontSize: 11, padding: '5px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  btnFinalizar: { fontSize: 11, padding: '5px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 },
  modal: { background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { fontSize: 15, fontWeight: 600, margin: 0, color: '#0f172a' },
  btnClose: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: '#94a3b8', padding: 4 },
  formGroup: { marginBottom: 12 },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5 },
  input: { width: '100%', padding: '8px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', fontFamily: 'inherit' },
  hint: { display: 'block', fontSize: 11, color: '#94a3b8', marginTop: 4 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 },
  distInfo: { fontSize: 11, fontFamily: 'monospace', color: '#16a34a', marginTop: 4, fontWeight: 500 },
  cargaInfo: { background: '#f1f5f9', padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#0f172a' },
  cargaSubinfo: { fontSize: 11, fontFamily: 'monospace', color: '#64748b', marginTop: 4 },
  resumenBox: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14 },
  resumenRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' },
  resumenLbl: { color: '#64748b' },
  warningBox: { background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', padding: 12, borderRadius: 8, fontSize: 12, marginBottom: 14, lineHeight: 1.5 },
  modalActions: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 },
  cardTitle: { fontSize: 20, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', marginBottom: 12 },
  liveTripsSection: { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: 18 },
  tripsList: { display: 'flex', flexDirection: 'column', gap: 12 },
}

const stylesTrip = {
  card: { background: '#fff', border: '1px solid #e2e8f0', borderLeft: '4px solid', borderRadius: 10, padding: 14 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  headTop: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  unidadName: { fontSize: 14, color: '#0f172a' },
  m3Tag: { fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a' },
  tipoTag: { fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#e2e8f0', color: '#475569' },
  subtitle: { fontSize: 12, color: '#475569' },
  headRight: { display: 'flex', alignItems: 'center', gap: 6 },
  estadoChip: { fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 5, border: '1px solid', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' },
  btnEditar: { fontSize: 12, padding: '4px 10px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  btnCancelar: { fontSize: 12, padding: '4px 10px', background: '#fff', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
  etapas: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 12 },
  etapaCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  etapaCircle: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 },
  etapaLbl: { fontSize: 10, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.3px' },
  etapaTimes: { fontSize: 10, fontFamily: 'monospace' },
  tEsperado: { color: '#94a3b8' },
  progressWrap: { marginBottom: 8 },
  progressBar: { height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', transition: 'width 0.3s' },
  progressLabel: { fontSize: 10, fontFamily: 'monospace', textAlign: 'right' },
  gpsLine: { fontSize: 10, fontFamily: 'monospace', color: '#475569', display: 'flex', gap: 6, alignItems: 'center', paddingTop: 8, borderTop: '1px solid #f1f5f9' },
}