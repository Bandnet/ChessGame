import { useState, useEffect } from 'react'
import supabase from './Supabase/supabase.js'
import Login from './Supabase/login.jsx'
import Menu from './menu.jsx'
import ChessGame from './ChessGame.jsx'
import OnlineGame from './OnlineGame.jsx'
import Leaderboard from "./Leaderboard.jsx";
import "./Classical.css"
import "./Green.css"

export default function App() {
    const [user, setUser] = useState(null)
    const [screen, setScreen] = useState('menu')
    const [isTraditional, setIsTraditional] = useState(
        localStorage.getItem('chess-theme') === 'traditional'
    );
    useEffect(() => {
        if (isTraditional) {
            document.body.classList.add('traditional');
            localStorage.setItem('chess-theme', 'traditional');
        } else {
            document.body.classList.remove('traditional');
            localStorage.setItem('chess-theme', 'matrix');
        }
    }, [isTraditional]);

    useEffect(() => {
        // Check current session on load
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
        })

        // Listen for login/logout events
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    // ... (Dein bisheriger Code bleibt genau so)

    if (!user) return <Login onLoggedIn={() => {}} />

    if (screen === 'local')    return <ChessGame botMode="none"  onBack={() => setScreen('menu')} />
    if (screen === 'bot')      return <ChessGame botMode="black" onBack={() => setScreen('menu')} />
    if (screen === 'botvsbot') return <ChessGame botMode="both"  onBack={() => setScreen('menu')} />
    if (screen === 'online')   return <OnlineGame user={user} onBack={() => setScreen('menu')} />
    if (screen === 'leaderboard') return <Leaderboard onBack={() => setScreen('menu')} user={user} />

    // HIER GEÄNDERT: Props an Menu übergeben, damit der Switcher funktioniert!
    return (
        <Menu
            isTraditional={isTraditional}
            onToggleTheme={() => setIsTraditional(!isTraditional)}
            user={user}
            onSelect={setScreen}
            isTraditional={isTraditional}
            onToggleTheme={() => setIsTraditional(!isTraditional)}
        />
    )
}