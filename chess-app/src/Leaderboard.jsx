import { useEffect, useState } from 'react'
import supabase from './Supabase/supabase.js'

const PAGE_SIZE = 10
const medals = ['🥇', '🥈', '🥉']

export default function Leaderboard({ onBack, user }) {
    const [players, setPlayers] = useState([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const [myRank, setMyRank] = useState(null)
    const [myProfile, setMyProfile] = useState(null)
    const [loadingRank, setLoadingRank] = useState(true)
    const [rankErrorMsg, setRankErrorMsg] = useState(null)

    // 1. Debugging: Schau dir das user-Objekt direkt an
    console.log("Leaderboard erhaltenes USER-Prop:", user);

    // Versuche alle gängigen Supabase-User-Strukturen aufzudröseln
    const targetId = user?.id || user?.user?.id || user?.data?.user?.id || user?.data?.id;
    console.log("Extrahierte targetId:", targetId);

    useEffect(() => {
        fetchPage(0)
    }, [])

    useEffect(() => {
        if (targetId) {
            fetchMyRank(targetId)
        } else if (user) {
            // Wenn user da ist, aber keine ID gefunden wurde
            setLoadingRank(false)
            setRankErrorMsg("User-ID-Struktur falsch")
        }
    }, [targetId, user])

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
        console.log("fetchMyRank gestartet für UID:", uid);

        try {
            // 1. Eigenes Profil holen
            const { data: me, error: profileError } = await supabase
                .from('profiles')
                .select('username, elo')
                .eq('id', uid)
                .maybeSingle()

            if (profileError) throw profileError;

            if (!me) {
                console.warn("Kein Profil in DB für ID gefunden:", uid);
                setRankErrorMsg("Profil nicht in DB");
                setLoadingRank(false);
                return;
            }

            console.log("Mein Profil geladen:", me);
            setMyProfile(me)

            // 2. Anzahl der Spieler mit höherem Elo zählen
            const { count, error: rankError } = await supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .gt('elo', me.elo)

            if (rankError) throw rankError;

            // 3. Rang setzen (Spieler darüber + 1)
            const computedRank = (count ?? 0) + 1;
            console.log("Rang berechnet:", computedRank);
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

            {/* Deine Rang-Anzeige am Top */}
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

            {/* Rangliste */}
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