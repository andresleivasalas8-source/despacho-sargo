import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import { useIsMobile } from '../hooks/useIsMobile'

const HORA_INICIO = 6
const HORA_FIN = 20
const SLOT_MIN = 30
const CAPACIDAD_MIXER = 7
const T_CARGA = 15
const SLOT_PX = 36 // ancho fijo de cada slot en píxeles

export default function Planificacion() {
  const isMobile = useIsMobile()
  const [user, setUser] = useState(null)
  const [pedidos, setPedidos] = useState([])
  const [obras, setObras] = useState([])
  const [clientes, setClientes] = useState([])
  const [unidades, setUnidades] = useState([])
  const [loading, setLoading] = useState(true)
  const [fechaSelec, setFechaSelec] = useState(() => new Date().toISOString().slice(0, 10))
  const [draggingId, setDraggingId] = useState(null)
  const [dragOffset, setDragOffset] = useState(0) // en minutos
  const [savingId, setSavingId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    checkUser()
    cargarDatos()

    const channel = supabase
      .channel('planif_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        if (!draggingId) cargarDatos()
      })
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
    const [pRes, oRes, cRes, uRes] = await Promise.all([
      supabase.from('pedidos').select('*').eq('fecha', fechaSelec).order('horario'),
      supabase.from('obras').select('*'),
      supabase.from('clientes').select('*'),
      supabase.from('unidades').select('*').eq('operativo', true),
    ])
    if (pRes.data) setPedidos(pRes.data)
    if (oRes.data) setObras(oRes.data)
    if (cRes.data) setClientes(cRes.data)
    if (uRes.data) setUnidades(uRes.data)
    setLoading(false)
  }


  // ─── Generar slots de tiempo ──────────────────────────────────────
  const slots = useMemo(() => {
    const arr = []
    const totalMin = (HORA_FIN - HORA_INICIO) * 60
    const cantSlots = totalMin / SLOT_MIN
    for (let i = 0; i < cantSlots; i++) {
      const min = HORA_INICIO * 60 + i * SLOT_MIN
      const h = Math.floor(min / 60)
      const m = min % 60
      arr.push({
        idx: i,
        min,
        label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        esHoraEntera: m === 0,
      })
    }
    return arr
  }, [])

  // ─── Calcular plan de cada pedido (con horario ajustado si está dragging) ─
  function calcularPlanPedido(pedido) {
    const obra = obras.find(o => o.id === pedido.obra_id)
    if (!obra) return null

    const tIda = obra.t_ida_maps || 30
    const tDescarga = obra.desc_min || 30
    const tVuelta = tIda
    const tCicloTotal = T_CARGA + tIda + tDescarga + tVuelta
    const frecMin = obra.frec_min || 30

    const cantViajes = Math.ceil(parseFloat(pedido.m3) / CAPACIDAD_MIXER)
    const mixersSimul = frecMin > 0 ? Math.ceil(tCicloTotal / frecMin) : cantViajes

    const [hh, mm] = pedido.horario.split(':').map(Number)
    let startMin = hh * 60 + mm

    // Si este pedido se está arrastrando, sumar el offset
    if (draggingId === pedido.id) {
      startMin += dragOffset
      // Limitar a horario laboral
      startMin = Math.max(HORA_INICIO * 60, Math.min(HORA_FIN * 60 - tCicloTotal, startMin))
    }

    const viajes = []
    for (let i = 0; i < cantViajes; i++) {
      const offset = frecMin > 0 ? Math.floor(i / mixersSimul) * tCicloTotal + (i % mixersSimul) * frecMin : i * tCicloTotal
      const cargaInicio = startMin + offset
      const cargaFin = cargaInicio + T_CARGA
      const idaFin = cargaFin + tIda
      const descargaFin = idaFin + tDescarga
      const vueltaFin = descargaFin + tVuelta
      viajes.push({
        nro: i + 1,
        cargaInicio, cargaFin, idaFin, descargaFin, vueltaFin,
        ocupadoDesde: cargaInicio,
        ocupadoHasta: vueltaFin,
      })
    }

    return {
      pedido, obra, cantViajes, mixersSimul, tCicloTotal, viajes,
      conBomba: pedido.con_bomba,
      startMin,
      isDragging: draggingId === pedido.id,
    }
  }

  const planes = pedidos.map(calcularPlanPedido).filter(Boolean)

  // ─── Calcular ocupación por slot ──────────────────────────────────
  function calcularOcupacionMixers() {
    const ocup = slots.map(() => 0)
    planes.forEach(plan => {
      plan.viajes.forEach(v => {
        slots.forEach((s, idx) => {
          const slotIni = s.min
          const slotFin = s.min + SLOT_MIN
          if (v.ocupadoDesde < slotFin && v.ocupadoHasta > slotIni) ocup[idx]++
        })
      })
    })
    return ocup
  }

  function calcularOcupacionBombas() {
    const ocup = slots.map(() => 0)
    planes.forEach(plan => {
      if (!plan.conBomba) return
      const inicio = plan.viajes[0]?.cargaInicio + (plan.obra.t_ida_maps || 30)
      const fin = plan.viajes[plan.viajes.length-1]?.descargaFin
      slots.forEach((s, idx) => {
        const slotIni = s.min
        const slotFin = s.min + SLOT_MIN
        if (inicio < slotFin && fin > slotIni) ocup[idx]++
      })
    })
    return ocup
  }

  const ocupMixers = calcularOcupacionMixers()
  const ocupBombas = calcularOcupacionBombas()

  const cantMixers = unidades.filter(u => u.tipo === 'mixer').length
  const cantBombas = unidades.filter(u => u.tipo === 'bomba').length

  function getColorOcupacion(ocupados, total) {
    if (ocupados === 0) return { bg: '#f8fafc', fg: '#cbd5e1' }
    const pct = (ocupados / total) * 100
    if (pct > 100) return { bg: '#dc2626', fg: '#fff' }
    if (pct >= 90) return { bg: '#fecaca', fg: '#991b1b' }
    if (pct >= 70) return { bg: '#fef3c7', fg: '#92400e' }
    return { bg: '#dcfce7', fg: '#166534' }
  }

  function getObraNombre(id) {
    return obras.find(o => o.id === id)?.nombre || '—'
  }

  // ─── DRAG HANDLERS ────────────────────────────────────────────────
  const dragStartRef = useRef({ x: 0, plan: null })

  function handleMouseDown(e, plan) {
    e.preventDefault()
    dragStartRef.current = { x: e.clientX, plan }
    setDraggingId(plan.pedido.id)
    setDragOffset(0)

    function handleMove(ev) {
      const dx = ev.clientX - dragStartRef.current.x
      // Convertir píxeles a minutos
      const minutosCrudos = (dx / SLOT_PX) * SLOT_MIN
      // Snap a slots de 30 min
      const minutosSnap = Math.round(minutosCrudos / SLOT_MIN) * SLOT_MIN
      setDragOffset(minutosSnap)
    }

    async function handleUp() {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)

      const finalOffset = (() => {
        // Capturar el último offset desde el state usando una función
        let offset = 0
        setDragOffset(o => { offset = o; return o })
        return offset
      })()

      // Esperar el siguiente tick para tener el offset actualizado
      setTimeout(async () => {
        const planOriginal = dragStartRef.current.plan
        const [hh, mm] = planOriginal.pedido.horario.split(':').map(Number)
        const newMin = hh * 60 + mm + finalOffset
        const newH = Math.floor(newMin / 60)
        const newM = newMin % 60
        const newHorario = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`

        if (finalOffset !== 0) {
          setSavingId(planOriginal.pedido.id)
          await supabase.from('pedidos').update({ horario: newHorario }).eq('id', planOriginal.pedido.id)
          setSavingId(null)
          await cargarDatos()
        }
        setDraggingId(null)
        setDragOffset(0)
      }, 0)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }

  // ─── Renderizado ──────────────────────────────────────────────────
  function renderBarraCapacidad(ocupacion, total, titulo) {
    return (
      <section style={{...styles.card, marginTop: 12}}>
        <h2 style={styles.cardTitle}>{titulo} · {total} disponibles</h2>
        <div style={styles.scrollWrap}>
          <div style={{display: 'flex', minWidth: 'fit-content'}}>
            <div style={styles.lblColFijo}>Hora</div>
            <div style={{display: 'flex'}}>
              {slots.map(s => (
                <div key={s.idx} style={{...styles.slotHead, width: SLOT_PX, fontWeight: s.esHoraEntera ? 600 : 400, color: s.esHoraEntera ? '#0f172a' : '#94a3b8'}}>
                  {s.esHoraEntera ? s.label : ''}
                </div>
              ))}
            </div>
          </div>
          <div style={{display: 'flex', minWidth: 'fit-content', marginTop: 4}}>
            <div style={styles.lblColFijo}>Ocupación</div>
            <div style={{display: 'flex', gap: 1}}>
              {ocupacion.map((ocup, idx) => {
                const col = getColorOcupacion(ocup, total)
                return (
                  <div key={idx} style={{...styles.slotCell, width: SLOT_PX - 1, background: col.bg, color: col.fg}}>
                    {ocup > 0 ? ocup : ''}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div style={styles.container}>
      <Header active="planificacion" user={user} />

      <main style={{ ...styles.main, padding: isMobile ? 12 : 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase' }}>Planificación</h2>
        <div style={styles.toolbar}>
          <div style={styles.fechaWrap}>
            <label style={styles.fechaLabel}>Fecha</label>
            <input type="date" value={fechaSelec} onChange={e => setFechaSelec(e.target.value)} style={styles.fechaInput} />
            <button onClick={() => setFechaSelec(new Date().toISOString().slice(0, 10))} style={styles.btnHoy}>Hoy</button>
          </div>
          <div style={styles.summary}>
            <span><strong>{pedidos.length}</strong> pedidos · <strong>{pedidos.reduce((s,p) => s + parseFloat(p.m3), 0)}m³</strong> total</span>
            <span style={styles.sep}>·</span>
            <span>Recursos: <strong>{cantMixers}</strong> mixers · <strong>{cantBombas}</strong> bombas</span>
          </div>
        </div>

        {loading ? (
          <div style={styles.empty}>Cargando...</div>
        ) : pedidos.length === 0 ? (
          <div style={styles.empty}>No hay pedidos para esta fecha.</div>
        ) : (
          <>
            {renderBarraCapacidad(ocupMixers, cantMixers, 'Capacidad MIXERS')}
            {renderBarraCapacidad(ocupBombas, cantBombas, 'Capacidad BOMBAS')}

            {/* GANTT */}
            <section style={{...styles.card, marginTop: 12}}>
              <h2 style={styles.cardTitle}>Gantt de pedidos</h2>
              <div style={styles.scrollWrap}>
                <div style={{display: 'flex', minWidth: 'fit-content'}}>
                  <div style={styles.lblColPedido}>Pedido</div>
                  <div style={{display: 'flex'}}>
                    {slots.map(s => (
                      <div key={s.idx} style={{...styles.slotHead, width: SLOT_PX, fontWeight: s.esHoraEntera ? 600 : 400, color: s.esHoraEntera ? '#0f172a' : '#94a3b8'}}>
                        {s.esHoraEntera ? s.label : ''}
                      </div>
                    ))}
                  </div>
                </div>

                {planes.map(plan => {
                  const startSlotIdx = (plan.startMin - HORA_INICIO * 60) / SLOT_MIN
                  const endMin = plan.viajes[plan.viajes.length-1].ocupadoHasta
                  const widthSlots = (endMin - plan.startMin) / SLOT_MIN
                  const left = startSlotIdx * SLOT_PX
                  const width = widthSlots * SLOT_PX

                  // Calcular hora ajustada para mostrar mientras arrastra
                  const hAjuste = Math.floor(plan.startMin / 60)
                  const mAjuste = plan.startMin % 60
                  const horarioMostrar = `${String(hAjuste).padStart(2, '0')}:${String(mAjuste).padStart(2, '0')}`

                  return (
                    <div key={plan.pedido.id} style={{display: 'flex', minWidth: 'fit-content', marginTop: 4}}>
                      <div style={styles.lblColPedidoData}>
                        <div style={styles.pedidoLblTop}>
                          <strong>{getObraNombre(plan.pedido.obra_id)}</strong>
                          {plan.conBomba && <span style={styles.bombaTag}>BOMBA</span>}
                          {savingId === plan.pedido.id && <span style={styles.savingTag}>guardando...</span>}
                        </div>
                        <div style={styles.pedidoLblBot}>
                          <span style={{color: plan.isDragging ? '#3b82f6' : '#64748b', fontWeight: plan.isDragging ? 700 : 400}}>
                            {horarioMostrar}
                          </span>
                          {' · '}{plan.pedido.m3}m³ · {plan.cantViajes} viajes · {plan.mixersSimul} mixers simul
                        </div>
                      </div>
                      <div style={{position: 'relative', height: 36, width: slots.length * SLOT_PX, background: '#fafafa', borderRadius: 4}}>
                        <div
                          onMouseDown={(e) => handleMouseDown(e, plan)}
                          style={{
                            position: 'absolute',
                            left, width, top: 2, bottom: 2,
                            cursor: plan.isDragging ? 'grabbing' : 'grab',
                            userSelect: 'none',
                            transition: plan.isDragging ? 'none' : 'left 0.2s',
                            opacity: plan.isDragging ? 0.85 : 1,
                            boxShadow: plan.isDragging ? '0 4px 12px rgba(59,130,246,0.4)' : 'none',
                          }}
                          title="Arrastrá para mover el pedido"
                        >
                          {plan.viajes.map((v, i) => {
                            const inicio = plan.viajes[0].ocupadoDesde
                            const fin = plan.viajes[plan.viajes.length-1].ocupadoHasta
                            const range = fin - inicio
                            const lf = ((v.ocupadoDesde - inicio) / range) * 100
                            const wd = ((v.ocupadoHasta - v.ocupadoDesde) / range) * 100
                            return (
                              <div key={i} style={{
                                position: 'absolute',
                                left: `${lf}%`,
                                width: `${wd}%`,
                                top: 0, bottom: 0,
                                background: i % 2 === 0 ? '#3b82f6' : '#60a5fa',
                                borderRadius: 3,
                                fontSize: 10,
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                overflow: 'hidden',
                                pointerEvents: 'none',
                              }}>{v.nro}</div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={styles.legend}>
                <span>💡 <strong>Arrastrá las barras azules</strong> para mover el horario del pedido. La capacidad de arriba se actualiza en vivo.</span>
              </div>
              <div style={styles.legend}>
                <span><span style={{...styles.legendBox, background: '#dcfce7', borderColor: '#16a34a'}}></span> Holgado</span>
                <span><span style={{...styles.legendBox, background: '#fef3c7', borderColor: '#d97706'}}></span> Al límite (≥70%)</span>
                <span><span style={{...styles.legendBox, background: '#fecaca', borderColor: '#dc2626'}}></span> Saturado (≥90%)</span>
                <span><span style={{...styles.legendBox, background: '#dc2626'}}></span> Excedido</span>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

// ─── ESTILOS ────────────────────────────────────────────────────────
const styles = {
  container: { minHeight: '100vh', background: 'transparent', fontFamily: "'Syne', system-ui, sans-serif" },
  main: { maxWidth: 1500, margin: '0 auto', padding: 24 },
  toolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' },
  fechaWrap: { display: 'flex', alignItems: 'center', gap: 10 },
  fechaLabel: { fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' },
  fechaInput: { padding: '8px 12px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, fontFamily: 'inherit' },
  btnHoy: { fontSize: 12, padding: '8px 12px', background: '#fff', border: '1px solid #cbd5e1', color: '#475569', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' },
  summary: { fontSize: 12, color: '#475569', display: 'flex', gap: 8, alignItems: 'center' },
  sep: { color: '#cbd5e1' },
  empty: { textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0' },
  card: { background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' },
  cardTitle: { fontSize: 17, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", fontStyle: 'italic', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#475569', marginBottom: 12 },
  scrollWrap: { overflowX: 'auto', paddingBottom: 4 },
  lblColFijo: { width: 120, fontSize: 11, fontWeight: 600, color: '#475569', display: 'flex', alignItems: 'center', padding: '6px 10px', background: '#f8fafc', borderRadius: 4, flexShrink: 0 },
  lblColPedido: { width: 260, fontSize: 11, fontWeight: 600, color: '#475569', padding: '8px 10px', background: '#f8fafc', borderRadius: 4, flexShrink: 0 },
  lblColPedidoData: { width: 260, padding: '8px 10px', background: '#f8fafc', borderRadius: 4, fontSize: 12, flexShrink: 0 },
  slotHead: { fontSize: 9, textAlign: 'center', padding: '4px 0', fontFamily: 'monospace', flexShrink: 0 },
  slotCell: { fontSize: 11, fontWeight: 600, textAlign: 'center', padding: '8px 0', borderRadius: 3, fontFamily: 'monospace', flexShrink: 0 },
  pedidoLblTop: { display: 'flex', alignItems: 'center', gap: 6 },
  pedidoLblBot: { fontSize: 10, color: '#64748b', fontFamily: 'monospace', marginTop: 2 },
  bombaTag: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#ede9fe', color: '#7c3aed' },
  savingTag: { fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e' },
  legend: { display: 'flex', gap: 18, marginTop: 12, fontSize: 11, color: '#475569', flexWrap: 'wrap' },
  legendBox: { display: 'inline-block', width: 12, height: 12, borderRadius: 3, marginRight: 4, verticalAlign: 'middle', border: '1px solid' },
}