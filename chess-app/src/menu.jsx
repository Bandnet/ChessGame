import supabase from './Supabase/supabase.js'
import { useEffect, useState } from 'react'

export default function Menu({ user, onSelect }) {
    const [profile, setProfile] = useState(null)

    useEffect(() => {
        supabase
            .from('profiles')
            .select('username, elo')
            .eq('id', user.id)
            .maybeSingle()
            .then(({ data }) => setProfile(data))
    }, [user])

    async function handleLogout() {
        await supabase.auth.signOut()
        window.location.reload()
    }

    return (
        <div className="menu">
            <h1 className="title">♟ CHESS.EXE</h1>

            {profile && (
                <div className="profile-badge">
                    <span>👤 {profile.username}</span>
                    <span>⚡ Elo: {profile.elo}</span>
                </div>
            )}

            <div className="menu-buttons">
                <button className="menu-btn online" onClick={() => onSelect('online')}>
                    🌐 Play Online
                    <span className="menu-btn-sub">Ranked • Gain/Lose Elo</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('local')}>
                    👥 2 Players
                    <span className="menu-btn-sub">Same device</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('bot')}>
                    🤖 vs Bot
                    <span className="menu-btn-sub">Play against the AI</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('botvsbot')}>
                    🤖 Bot vs Bot
                    <span className="menu-btn-sub">Watch the AI play itself</span>
                </button>

                <button className="menu-btn" onClick={() => onSelect('leaderboard')}>
                    🏆 Leaderboard
                    <span className="menu-btn-sub">Top players by Elo</span>
                </button>
            </div>

            <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
    )
}