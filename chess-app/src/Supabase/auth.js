import supabase from './supabase.js'

// Register
export async function register(email, password, username) {
    // 1. Create the auth account
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    // 2. Save username + starting Elo to profiles table
    await supabase.from('profiles').insert({
        id: data.user.id,
        username: username,
        elo: 1200
    })
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