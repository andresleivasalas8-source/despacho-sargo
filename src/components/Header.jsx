import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useIsMobile } from '../hooks/useIsMobile'

const NAV = [
  { key: 'flota',         label: 'Flota',         path: '/' },
  { key: 'clientes',      label: 'Clientes',      path: '/clientes' },
  { key: 'pedidos',       label: 'Pedidos',       path: '/pedidos' },
  { key: 'planificacion', label: 'Planificación', path: '/planificacion' },
]

export default function Header({ active, user, gpsAge: gpsAgeProp }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [localGpsAge, setLocalGpsAge] = useState(null)

  // Si la página padre pasa gpsAge lo usa directamente.
  // Si no (Clientes, Pedidos, Planificación), consulta gps_actual aquí mismo.
  useEffect(() => {
    if (gpsAgeProp !== undefined) return

    async function fetchAge() {
      const { data } = await supabase
        .from('gps_actual')
        .select('ts')
        .order('ts', { ascending: false })
        .limit(1)
        .single()
      if (data?.ts) {
        setLocalGpsAge(Math.round((Date.now() - new Date(data.ts).getTime()) / 1000))
      }
    }

    fetchAge()
    const id = setInterval(fetchAge, 30000)
    return () => clearInterval(id)
  }, [gpsAgeProp])

  const gpsAge   = gpsAgeProp !== undefined ? gpsAgeProp : localGpsAge
  const gpsActive = gpsAge !== null && gpsAge < 60
  const gpsLabel  = gpsAge === null
    ? 'Sin GPS'
    : gpsAge < 60
      ? `GPS · ${gpsAge}s`
      : `GPS · ${Math.round(gpsAge / 60)}min`

  async function logout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <header className="app-header">

      {/* Fila 1: logo + derecha (GPS + user + salir) */}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', height: isMobile ? 62 : '100%' }}>

        {/* Logo */}
        <div style={{ ...s.logoWrap, height: isMobile ? 62 : '100%' }}>
          <img src="/logo-sargo.png" alt="Sargo" style={{ ...s.logo, width: isMobile ? 165 : 200, transform: isMobile ? 'scale(1.5)' : 'scale(1.55)' }} />
          <div style={s.logoFade} />
        </div>

        {/* Spacer en desktop — la nav llena este espacio */}
        {!isMobile && (
          <nav style={s.nav}>
            {NAV.map(item => {
              const isActive = item.key === active
              return (
                <button
                  key={item.key}
                  onClick={isActive ? undefined : () => navigate(item.path)}
                  className={`nav-btn${isActive ? ' nav-btn-active' : ''}`}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        )}

        {isMobile && <div style={{ flex: 1 }} />}

        {/* Zona derecha */}
        <div style={{ ...s.right, minWidth: isMobile ? 'auto' : 200, padding: isMobile ? '0 12px' : '0 20px', gap: isMobile ? 8 : 10 }}>
          <div className="gps-chip">
            <div
              className={gpsActive ? 'status-dot' : undefined}
              style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: gpsActive ? '#4ade80' : 'rgba(255,255,255,0.35)' }}
            />
            {!isMobile && <span>{gpsLabel}</span>}
          </div>

          {!isMobile && (
            <div style={s.userIcon} title={user?.email}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
              </svg>
            </div>
          )}

          <button onClick={logout} className="logout-btn-header" style={{ fontSize: isMobile ? 11 : 12, padding: isMobile ? '5px 10px' : '6px 14px' }}>
            Salir
          </button>
        </div>
      </div>

      {/* Fila 2 (solo mobile): navegación full-width */}
      {isMobile && (
        <nav className="app-header-nav">
          {NAV.map(item => {
            const isActive = item.key === active
            return (
              <button
                key={item.key}
                onClick={isActive ? undefined : () => navigate(item.path)}
                className={`nav-btn${isActive ? ' nav-btn-active' : ''}`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      )}
    </header>
  )
}

const s = {
  logoWrap: {
    position: 'relative',
    height: '100%',
    flexShrink: 0,
    overflow: 'hidden',
    background: '#F03226',
  },
  logo: {
    height: '100%',
    width: 200,
    objectFit: 'cover',
    objectPosition: 'center center',
    display: 'block',
    transform: 'scale(1.55)',
    mixBlendMode: 'lighten',
  },
  logoFade: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 55,
    height: '100%',
    background: 'linear-gradient(to right, transparent, #F03226)',
    pointerEvents: 'none',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    flex: 1,
    padding: '0 8px',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 20px',
    flexShrink: 0,
    minWidth: 200,
  },
  userIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.20)',
    color: 'rgba(255,255,255,0.75)',
    flexShrink: 0,
    cursor: 'default',
  },
}
