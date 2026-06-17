import { useEffect, useState } from 'react'
import supabase from './Supabase/supabase.js'

const PAGE_SIZE = 10
const medals = ['🥇', '🥈', '🥉', '🎖️', '🏅']

const TIER_LABELS = {
    'TOP_50':   '👑 [ELITE 50]',
    'TOP_75':   '🎖️ [EXPERT 75]',
    'TOP_100':  '🥇 [CHAMP 100]',
    'TOP_200':  '🥈 [MASTER 200]',
    'TOP_500':  '🥉 [WARRIOR 500]',
    'TOP_1000': '⚔️ [PRO 1000]',
    'PARTICIPANT': '♟️ [PLAYER]'
};

export default function Leaderboard({ onBack, user }) {
    const [players, setPlayers] = useState([])
    const [topPlayers, setTopPlayers] = useState([]) // NEU: State für die Top 5
    const [loading, setLoading] = useState(true)
    const [loadingTop, setLoadingTop] = useState(true) // NEU: Loading für Top 5
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const [myRank, setMyRank] = useState(null)
    const [myBadges, setMyBadges] = useState([])
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

    async function runMonthlySeasonReset() {
        const confirmation = window.confirm("Möchtest du die aktuelle Saison wirklich beenden? Alle Elos werden auf 1200 zurückgesetzt!");
        if (!confirmation) return;

        // Generiert den Saison-Namen basierend auf dem aktuellen Datum (z.B. "Saison_2026_6")
        const now = new Date();
        const seasonName = `Saison_${now.getFullYear()}_${now.getMonth() + 1}`;

        try {
            // Ruft die eben erstellte SQL-Funktion in Supabase auf
            const { data, error } = await supabase.rpc('trigger_seasonal_reset', {
                v_season_name: seasonName
            });

            if (error) throw error;

            alert(data); // Zeigt die Erfolgs- oder Fehlermeldung aus der DB an
            window.location.reload(); // Seite neu laden, um die neuen 1200 Elos zu sehen
        } catch (err) {
            console.error("Fehler beim Saison-Reset:", err);
            alert("Fehler: " + err.message);
        }
    }

    // NEU: Funktion, um die Top 5 absolut besten Spieler zu laden
    async function fetchTopFive() {
        setLoadingTop(true)
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(`
                    id,
                    username,
                    elo,
                    badges (
                        season_name,
                        rank_tier
                    )
                `)
                .order('elo', { ascending: false })
                .range(0, 4)// Holt Index 0 bis 4 (die ersten 5)

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
                .select(`
                        id,
                        username,
                        elo,
                        badges (
                            season_name,
                            rank_tier
                        )
        `, { count: 'exact' })
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

                        {myBadges && myBadges.length > 0 && (
                            <div
                                style={{
                                    borderTop: '1px solid #39ff1422',
                                    paddingTop: '8px',
                                    marginTop: '8px',
                                    display: 'flex',
                                    gap: '6px',
                                    flexWrap: 'wrap',
                                    justifyContent: 'center',
                                    width: '100%'
                                }}
                            >
                                {myBadges.map((badge, idx) => (
                                    <span
                                        key={idx}
                                        style={{
                                            fontSize: '11px',
                                            background: '#39ff1411',
                                            border: '1px solid #39ff1444',
                                            padding: '2px 6px',
                                            color: '#39ff14',
                                            fontFamily: 'Courier New, monospace'
                                        }}
                                        title={badge.season_name}
                                    >
                    {TIER_LABELS[badge.rank_tier] || badge.rank_tier}
                </span>
                                ))}
                            </div>
                        )}

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
                                <span className="top-card-name">{player.username}   {player.badges?.slice(0, 3).map((badge, idx) => (
                                    <span key={idx}>
                                        {TIER_LABELS[badge.rank_tier]}
                                    </span>
                                ))}</span>

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
                            <span className="lb-name">
                                {player.username}
                                {player.badges && player.badges.length > 0 && (
                                    <span className="lb-badges-container"
                                          style={{marginLeft: '10px', display: 'inline-flex', gap: '4px'}}>
                                    {player.badges.slice(0, 3).map((badge, idx) => (
                                    <span
                                        key={idx}
                                        style={{fontSize: '10px', opacity: 0.8}}
                                        title={badge.season_name}
                                    >
                                        {TIER_LABELS[badge.rank_tier] || badge.rank_tier}
                                    </span>
                                    ))}
                                </span>
                                )}
                            </span>
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