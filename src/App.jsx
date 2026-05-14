import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clientes from './pages/Clientes'
import Pedidos from './pages/Pedidos'
import Planificacion from './pages/Planificacion'

const DEPOT = { lat: -32.9310777, lng: -68.8202575 }

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dL = (lat2 - lat1) * Math.PI / 180
  const dG = (lng2 - lng1) * Math.PI / 180
  const x = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dG / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

async function procesarGeo(positions) {
  try {
    const [viajesRes, pedidosRes, obrasRes] = await Promise.all([
      supabase.from('viajes').select('id, estado, unidad_id, pedido_id').in('estado', ['cargando', 'viaje', 'obra', 'volviendo']),
      supabase.from('pedidos').select('id, obra_id'),
      supabase.from('obras').select('id, lat, lng'),
    ])

    const viajes = viajesRes.data || []
    const pedidos = pedidosRes.data || []
    const obras = obrasRes.data || []

    if (!viajes.length) return

    const ahora = new Date().toISOString()

    for (const viaje of viajes) {
      const pos = positions.find(p => p.unidad_id === viaje.unidad_id)
      if (!pos) continue

      const pedido = pedidos.find(p => p.id === viaje.pedido_id)
      const obra = pedido ? obras.find(o => o.id === pedido.obra_id) : null

      const distDeposito = haversineM(pos.lat, pos.lng, DEPOT.lat, DEPOT.lng)
      const distObra = obra
        ? haversineM(pos.lat, pos.lng, parseFloat(obra.lat), parseFloat(obra.lng))
        : null

      let update = null

      if (viaje.estado === 'cargando' && distDeposito > 200) {
        update = { estado: 'viaje', viaje_at: ahora }
      } else if (viaje.estado === 'viaje' && distObra !== null && distObra < 400) {
        update = { estado: 'obra', obra_at: ahora }
      } else if (viaje.estado === 'obra' && distObra !== null && distObra > 400) {
        update = { estado: 'volviendo', volviendo_at: ahora }
      } else if (viaje.estado === 'volviendo' && distDeposito < 200) {
        update = { estado: 'done', done_at: ahora }
      }

      if (update) {
        const { error } = await supabase.from('viajes').update(update).eq('id', viaje.id)
        if (!error) {
          console.log(`[Geo] ${viaje.unidad_id}: ${viaje.estado} → ${update.estado}`)
        }
      }
    }
  } catch (err) {
    console.error('[Geo error]', err)
  }
}

export default function App() {
  useEffect(() => {
    window._procesarGeo = procesarGeo
    return () => { delete window._procesarGeo }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/planificacion" element={<Planificacion />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}