import { createClient } from '@supabase/supabase-js'

// Tu URL de Supabase ya configurada
const supabaseUrl = 'https://qrxkrqfcltdoaqsggwal.supabase.co'

// Encuentras esta clave en Supabase -> Project Settings -> API (anon public key)
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyeGtycWZjbHRkb2Fxc2dnd2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjU3ODAsImV4cCI6MjA5NzY0MTc4MH0.Qv8BqTHctSCvJ-eZkfiE8znU_7GNeqffij0_8u5cgr8' 

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
