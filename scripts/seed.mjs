/**
 * seed.mjs — crea usuario de prueba + datos iniciales en Supabase
 * Uso: node scripts/seed.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kptqhtaemrikmeubnerz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_avU2YeeyZ-VtWSXm3hHKDg_1LvUos5d'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── 1. Crear usuario de prueba ──────────────────────────────────────────────
const TEST_EMAIL    = 'andresleivasalas8@gmail.com'
const TEST_PASSWORD = 'Sargo2025!'

console.log('\n🔐 Creando usuario de prueba...')
const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email:    TEST_EMAIL,
  password: TEST_PASSWORD,
})

if (signUpError) {
  if (signUpError.message.includes('already registered')) {
    console.log('   ℹ️  El usuario ya existe — OK, continuando.')
  } else {
    console.error('   ❌ Error al crear usuario:', signUpError.message)
  }
} else {
  console.log('   ✅ Usuario creado. Revisá tu Gmail para confirmar el email.')
  console.log(`      Email:    ${TEST_EMAIL}`)
  console.log(`      Password: ${TEST_PASSWORD}`)
}

// ── 2. Login para poder insertar datos (RLS requiere auth) ──────────────────
console.log('\n🔑 Iniciando sesión para seed de datos...')
const { data: sessionData, error: loginError } = await supabase.auth.signInWithPassword({
  email:    TEST_EMAIL,
  password: TEST_PASSWORD,
})

if (loginError) {
  console.log('   ⚠️  No se pudo iniciar sesión todavía (puede ser que falte confirmar el email).')
  console.log('   → Confirmá el email en tu Gmail y volvé a correr: node scripts/seed.mjs')
  console.log('\n   Datos que se insertarán cuando confirmes:')
  printPendingData()
  process.exit(0)
}

console.log('   ✅ Sesión iniciada correctamente.')

// ── 3. Insertar unidades ────────────────────────────────────────────────────
console.log('\n🚛 Insertando unidades...')
const unidades = [
  { id: 104, nombre: 'Mixer 104', patente: 'ABC-104', tipo: 'mixer', wara_id: 106966 },
  { id: 106, nombre: 'Mixer 106', patente: 'ABC-106', tipo: 'mixer', wara_id: 80128  },
  { id: 107, nombre: 'Mixer 107', patente: 'ABC-107', tipo: 'mixer', wara_id: 105592 },
  { id: 110, nombre: 'Mixer 110', patente: 'ABC-110', tipo: 'mixer', wara_id: 139012 },
  { id: 112, nombre: 'Mixer 112', patente: 'ABC-112', tipo: 'mixer', wara_id: 80140  },
  { id: 115, nombre: 'Mixer 115', patente: 'ABC-115', tipo: 'mixer', wara_id: 147214 },
  { id: 128, nombre: 'Mixer 128', patente: 'ABC-128', tipo: 'mixer', wara_id: 134008 },
  { id: 130, nombre: 'Mixer 130', patente: 'ABC-130', tipo: 'mixer', wara_id: 80224  },
  { id: 201, nombre: 'Bomba B101', patente: 'BBB-101', tipo: 'bomba', wara_id: 152308 },
  { id: 202, nombre: 'Bomba B102', patente: 'BBB-102', tipo: 'bomba', wara_id: 105586 },
]

const { error: uErr } = await supabase.from('unidades').upsert(unidades, { onConflict: 'id' })
if (uErr) console.log('   ⚠️  Unidades:', uErr.message)
else      console.log(`   ✅ ${unidades.length} unidades insertadas.`)

// ── 4. Insertar clientes de prueba ──────────────────────────────────────────
console.log('\n👤 Insertando clientes...')
const clientes = [
  { nombre: 'Constructora Del Valle',  telefono: '261-4100001', email: 'delvalle@test.com'  },
  { nombre: 'Obras Civiles Andina',    telefono: '261-4100002', email: 'andina@test.com'    },
  { nombre: 'Edificios Mendoza SA',    telefono: '261-4100003', email: 'edmza@test.com'     },
]

const { data: clientesData, error: cErr } = await supabase
  .from('clientes').insert(clientes).select()
if (cErr) {
  console.log('   ⚠️  Clientes:', cErr.message)
} else {
  console.log(`   ✅ ${clientesData.length} clientes insertados.`)

  // ── 5. Insertar obras ─────────────────────────────────────────────────────
  console.log('\n🏗️  Insertando obras...')
  const obras = [
    {
      cliente_id:   clientesData[0].id,
      nombre:       'Edificio Las Heras',
      direccion:    'Av. Las Heras 850, Ciudad de Mendoza',
      lat:          -32.8833,
      lng:          -68.8480,
      t_ida_maps:   18,
      dist_km_maps: 9.2,
      frec_min:     30,
      desc_min:     30,
    },
    {
      cliente_id:   clientesData[0].id,
      nombre:       'Casa Luján de Cuyo',
      direccion:    'Ruta 7 km 15, Luján de Cuyo',
      lat:          -33.0350,
      lng:          -68.8800,
      t_ida_maps:   25,
      dist_km_maps: 13.5,
      frec_min:     45,
      desc_min:     40,
    },
    {
      cliente_id:   clientesData[1].id,
      nombre:       'Puente Acceso Este',
      direccion:    'Acceso Este km 8, Guaymallén',
      lat:          -32.8975,
      lng:          -68.7600,
      t_ida_maps:   12,
      dist_km_maps: 6.8,
      frec_min:     20,
      desc_min:     25,
    },
  ]

  const { data: obrasData, error: oErr } = await supabase
    .from('obras').insert(obras).select()
  if (oErr) console.log('   ⚠️  Obras:', oErr.message)
  else      console.log(`   ✅ ${obrasData.length} obras insertadas.`)
}

// ── 6. Insertar un pedido de hoy ────────────────────────────────────────────
console.log('\n📋 Insertando pedido de prueba para hoy...')
const hoy = new Date().toISOString().split('T')[0]
const { data: cList } = await supabase.from('clientes').select('id').limit(1)
const { data: oList } = await supabase.from('obras').select('id').limit(1)

if (cList?.length && oList?.length) {
  const { error: pErr } = await supabase.from('pedidos').insert({
    cliente_id:   cList[0].id,
    obra_id:      oList[0].id,
    fecha:        hoy,
    m3:           21,
    tipo_hormigon: 'H-25',
    hora_inicio:  '08:00',
    estado:       'pendiente',
  })
  if (pErr) console.log('   ⚠️  Pedido:', pErr.message)
  else      console.log('   ✅ Pedido de hoy insertado (21m³ H-25 a las 08:00).')
}

console.log('\n✨ Seed completado. Abrí http://localhost:5174 y entrá con:')
console.log(`   Email:    ${TEST_EMAIL}`)
console.log(`   Password: ${TEST_PASSWORD}`)
console.log('')

function printPendingData() {
  console.log('   - 10 unidades (8 mixers + 2 bombas)')
  console.log('   - 3 clientes ficticios')
  console.log('   - 3 obras en Mendoza con coordenadas reales')
  console.log('   - 1 pedido de hoy (21m³ H-25)')
}
