# despacho-sargo — Contexto para Claude Code

App de despacho de hormigón para Hormigones Sargo (Mendoza).

## Comandos

```powershell
npm run dev      # http://localhost:5173
npm run build    # producción
```

## Arquitectura

```
src/App.jsx            ← router + geofence engine (window._procesarGeo)
src/lib/supabase.js    ← cliente Supabase (credenciales hardcodeadas, publishable key)
src/pages/
  Dashboard.jsx        ← Flota + GPS watchdog + panel unidades
  Pedidos.jsx          ← pedidos + Live Trips + CargaModal + FinalizarModal + EditarViaje
  Planificacion.jsx    ← Gantt drag&drop + curvas de capacidad
  Clientes.jsx         ← CRUD clientes y obras con coordenadas GPS
  Login.jsx            ← auth Supabase
```

## Lo más importante

`window._procesarGeo` está definido en App.jsx. El script WARA lo llama después de cada sync GPS para detectar transiciones de etapa de los viajes (cargando → viaje → obra → volviendo → done) por geofence.

Depósito: `{ lat: -32.9310777, lng: -68.8202575 }` — aparece en Dashboard.jsx, Clientes.jsx y App.jsx. Si cambia hay que actualizarlo en los tres.

## Patrones del proyecto

- Inline styles en objetos `styles` al final de cada archivo (no CSS modules, no Tailwind)
- Sin TypeScript — todo JSX puro
- Auth check en cada página con `supabase.auth.getUser()` + redirect a `/login`
- Realtime via `supabase.channel().on('postgres_changes')` en cada página que lo necesita
- No hay tests

## Supabase

URL: kptqhtaemrikmeubnerz.supabase.co
Publishable key en src/lib/supabase.js (segura, puede estar en el código)
Tablas: clientes, obras, unidades, pedidos, viajes, gps_actual, gps_log, ciclos_hist
