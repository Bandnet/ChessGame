import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    'https://dnnaesztxtafkqdithic.supabase.co',
    'sb_publishable_qzk2UwzU5sS1LafrcxEuEg_7FNA8FLu'
)

export default supabase