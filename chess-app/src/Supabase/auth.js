import supabase from './supabase.js'

// Register
export async function register(email, password, username) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    if (!data.user) throw new Error('Registrierung fehlgeschlagen, bitte nochmal versuchen')

    // Wait a moment for the user to be created
    await new Promise(resolve => setTimeout(resolve, 1000))

    const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        username: username,
        elo: 1200
    })

    if (profileError) throw profileError
}

// Login
export async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
}

// Logout
export async function logout() {
    await supabase.auth.signOut()
}

// Get current logged in user
export async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}