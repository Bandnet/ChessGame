import { useState, useEffect } from 'react'
import supabase from './Supabase/supabase.js'
import Login from './Supabase/login.jsx'
import Menu from './menu.jsx'
import ChessGame from './ChessGame.jsx'
import OnlineGame from './OnlineGame.jsx'
import Leaderboard from "./Leaderboard.jsx";
import "./Classical.css"
import "./Green.css"
import "./Violet.css"
// Neue Themes hier importieren, z.B.:
// import "./Wood.css"
// import "./Neon.css"

const THEMES = ['traditional', 'green', 'violet']
// Reihenfolge beliebig erweiterbar — einfach neuen String hinzufügen
// und eine passende CSS-Datei mit body.THEMENAME { ... } erstellen

export default function App() {
    const [user, setUser] = useState(null)
    const [screen, setScreen] = useState('menu')
    const [theme, setTheme] = useState(
        localStorage.getItem('chess-theme') || 'matrix'
    )

    // Body-Klasse setzen & in localStorage speichern
    useEffect(() => {
        document.body.className = theme
        localStorage.setItem('chess-theme', theme)
    }, [theme])

    function handleToggleTheme() {
        setTheme(prev => {
            const currentIndex = THEMES.indexOf(prev)
            const nextIndex = (currentIndex + 1) % THEMES.length
            return THEMES[nextIndex]
        })
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (!user) return <Login onLoggedIn={() => {}} />

    if (screen === 'local')       return <ChessGame botMode="none"  onBack={() => setScreen('menu')} />
    if (screen === 'bot')         return <ChessGame botMode="black" onBack={() => setScreen('menu')} />
    if (screen === 'botvsbot')    return <ChessGame botMode="both"  onBack={() => setScreen('menu')} />
    if (screen === 'online')      return <OnlineGame user={user} onBack={() => setScreen('menu')} />
    if (screen === 'leaderboard') return <Leaderboard onBack={() => setScreen('menu')} user={user} />

    return (
        <Menu
            theme={theme}
            onToggleTheme={handleToggleTheme}
            user={user}
            onSelect={setScreen}
        />
    )
}