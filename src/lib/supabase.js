import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kptqhtaemrikmeubnerz.supabase.co'
const SUPABASE_KEY = 'sb_publishable_avU2YeeyZ-VtWSXm3hHKDg_1LvUos5d'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)