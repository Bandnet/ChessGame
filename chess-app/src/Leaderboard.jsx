import { useEffect, useState } from 'react'
import supabase from './Supabase/supabase.js'

const PAGE_SIZE = 10
const medals = ['🥇', '🥈', '🥉', '🎖️', '🏅']

export default function Leaderboard({ onBack, user }) {
    const [players, setPlayers] = useState([])
    const [topPlayers, setTopPlayers] = useState([]) // NEU: State für die Top 5
    const [loading, setLoading] = useState(true)
    const [loadingTop, setLoadingTop] = useState(true) // NEU: Loading für Top 5
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const [myRank, setMyRank] = useState(null)
    const [myProfile, setMyProfile] = useState(null)
    const [loadingRank, setLoadingRank] = useState(true)
    const [rankErrorMsg, setRankErrorMsg] = useState(null)

    const targetId = user?.id || user?.user?.id || user?.data?.user?.id || user?.data?.id;

    useEffect(() => {
        fetchTopFive() // NEU: Top 5 beim Laden abrufen
        fetchPage(0)
    }, [])

    useEffect(() => {
        if (targetId) {
            fetchMyRank(targetId)
        } else if (user) {
            setLoadingRank(false)
            setRankErrorMsg("User-ID-Struktur falsch")
        }
    }, [targetId, user])

    // NEU: Funktion, um die Top 5 absolut besten Spieler zu laden
    async function fetchTopFive() {
        setLoadingTop(true)
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('username, elo')
                .order('elo', { ascending: false })
                .range(0, 4) // Holt Index 0 bis 4 (die ersten 5)

            if (error) throw error;
            setTopPlayers(data || [])
        } catch (err) {
            console.error("Fehler beim Laden der Top 5:", err)
        } finally {
            setLoadingTop(false)
        }
    }

    async function fetchPage(p) {
        setLoading(true)
        try {
            const from = p * PAGE_SIZE
            const to = from + PAGE_SIZE - 1

            const { data, count, error } = await supabase
                .from('profiles')
                .select('username, elo', { count: 'exact' })
                .order('elo', { ascending: false })
                .range(from, to)

            if (error) throw error;

            setPlayers(data || [])
            setTotal(count || 0)
            setPage(p)
        } catch (err) {
            console.error("Fehler beim Laden der Leaderboard-Liste:", err)
        } finally {
            setLoading(false)
        }
    }

    async function fetchMyRank(uid) {
        setLoadingRank(true)
        setRankErrorMsg(null)

        try {
            const { data: me, error: profileError } = await supabase
                .from('profiles')
                .select('username, elo')
                .eq('id', uid)
                .maybeSingle()

            if (profileError) throw profileError;

            if (!me) {
                setRankErrorMsg("Profil nicht in DB");
                setLoadingRank(false);
                return;
            }

            setMyProfile(me)

            const { count, error: rankError } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .gt('elo', me.elo)

            if (rankError) throw rankError;

            const computedRank = (count ?? 0) + 1;
            setMyRank(computedRank)

        } catch (err) {
            console.error("Kritischer Fehler in fetchMyRank:", err);
            setRankErrorMsg(err.message || "Fehler beim Laden");
        } finally {
            setLoadingRank(false)
        }
    }

    const totalPages = Math.ceil(total / PAGE_SIZE)
    const globalOffset = page * PAGE_SIZE

    return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">🏆 LEADERBOARD</p>

            {/* Eigener Rang */}
            <div className="my-rank-badge" style={{
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-around',
                background: 'rgba(255,255,255,0.1)',
                padding: '10px',
                borderRadius: '5px',
                minHeight: '24px'
            }}>
                {loadingRank ? (
                    <span>Lade deinen Rang...</span>
                ) : rankErrorMsg ? (
                    <span style={{ color: '#ff6b6b' }}>❌ Fehler: {rankErrorMsg}</span>
                ) : myProfile && myRank !== null ? (
                    <>
                        <span>👤 {myProfile.username}</span>
                        <span><strong>Position:</strong> #{myRank}</span>
                        <span>⚡ {myProfile.elo} Elo</span>
                    </>
                ) : (
                    <span>Keine Daten verfügbar</span>
                )}
            </div>

            {/* NEU: DIE TOP 5 CLASH ROYALE STYLE BOX */}
            <h2 className="section-title">👑 Elite Top 5</h2>
            <div className="top-five-container">
                {loadingTop ? (
                    <p className="no-moves">Lade Champions...</p>
                ) : (
                    topPlayers.map((player, i) => (
                        <div key={i} className={`top-card rank-${i + 1}`}>
                            <div className="top-card-badge">{medals[i]}</div>
                            <div className="top-card-info">
                                <span className="top-card-name">{player.username}</span>
                                <span className="top-card-elo">⚡ {player.elo} Elo</span>
                            </div>
                            <div className="top-card-rank-text">#{i + 1}</div>
                        </div>
                    ))
                )}
            </div>

            <hr className="divider" />

            {/* Alle Ränge (Normale Pagination) */}
            <h2 className="section-title">📊 Alle Platzierungen</h2>
            <div className="leaderboard">
                {loading && <p className="no-moves">Laden...</p>}
                {!loading && players.map((player, i) => {
                    const globalIndex = globalOffset + i
                    return (
                        <div key={i} className={`leaderboard-row ${globalIndex < 3 ? 'top' : ''}`}>
                            <span className="lb-rank">
                                {globalIndex < 3 ? medals[globalIndex] : `#${globalIndex + 1}`}
                            </span>
                            <span className="lb-name">{player.username}</span>
                            <span className="lb-elo">⚡ {player.elo}</span>
                        </div>
                    )
                })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="pagination">
                    <button
                        className="page-btn"
                        onClick={() => fetchPage(page - 1)}
                        disabled={page === 0}
                    >
                        ← Zurück
                    </button>
                    <span className="page-info">
                        Seite {page + 1} / {totalPages}
                    </span>
                    <button
                        className="page-btn"
                        onClick={() => fetchPage(page + 1)}
                        disabled={page >= totalPages - 1}
                    >
                        Weiter →
                    </button>
                </div>
            )}
        </div>
    )
}