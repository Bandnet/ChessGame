import { useEffect, useState } from 'react'
import supabase from './Supabase/supabase.js'

export default function Leaderboard({ onBack }) {
    const [players, setPlayers] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase
            .from('profiles')
            .select('username, elo')
            .order('elo', { ascending: false })
            .limit(20)
            .then(({ data }) => {
                setPlayers(data || [])
                setLoading(false)
            })
    }, [])

    const medals = ['🥇', '🥈', '🥉']

    return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">🏆 LEADERBOARD</p>

            <div className="leaderboard">
                {loading && <p className="no-moves">Laden...</p>}
                {players.map((player, i) => (
                    <div key={i} className={`leaderboard-row ${i < 3 ? 'top' : ''}`}>
                        <span className="lb-rank">
                            {i < 3 ? medals[i] : `#${i + 1}`}
                        </span>
                        <span className="lb-name">{player.username}</span>
                        <span className="lb-elo">⚡ {player.elo}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}