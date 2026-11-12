import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qrxkrqfcltdoaqsggwal.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeGtycWZjbHRkb2Fxc2dnd2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjU3ODAsImV4cCI6MjA5NzY0MTc4MH0.Qv8BqTHctSCvJ-eZkfiE8znU_7GNeqffij0_8u5cgr8'

// Un único cliente para toda la app. La sesión se guarda en el dispositivo y
// se renueva sola (autoRefreshToken), así no hay que volver a iniciar sesión.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
