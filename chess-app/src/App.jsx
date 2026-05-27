import { useState, useEffect } from 'react'
import supabase from './Supabase/supabase.js'
import Login from './Supabase/login.jsx'
import Menu from './menu.jsx'
import ChessGame from './ChessGame.jsx'
import OnlineGame from './OnlineGame.jsx'

export default function App() {
    const [user, setUser] = useState(null)
    const [screen, setScreen] = useState('menu')

    useEffect(() => {
        supabase.auth.getUser().then(({ data: { user } }) => setUser(user))
    }, [])

    if (!user) return <Login onLoggedIn={setUser} />

    if (screen === 'local')    return <ChessGame botMode="none"  onBack={() => setScreen('menu')} />
    if (screen === 'bot')      return <ChessGame botMode="black" onBack={() => setScreen('menu')} />
    if (screen === 'botvsbot') return <ChessGame botMode="both"  onBack={() => setScreen('menu')} />
    if (screen === 'online')   return <OnlineGame user={user} onBack={() => setScreen('menu')} />  // ← and this
    if (screen === 'leaderboard') return (
        <div className="app">
            <button className="back-btn" onClick={() => setScreen('menu')}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">Leaderboard coming soon!</p>
        </div>
    )

    return <Menu user={user} onSelect={setScreen} />
}