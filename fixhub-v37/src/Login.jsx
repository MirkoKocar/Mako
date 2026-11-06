import { supabase } from './supabaseClient'

export function BotonGoogle() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    })

    if (error) console.error('Error:', error.message)
  }

  return (
    <button onClick={handleGoogleLogin} className="tu-clase-de-estilos">
      Continuar con Google
    </button>
  )
}
