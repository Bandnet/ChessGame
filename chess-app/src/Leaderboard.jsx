import { useEffect, useState } from 'react'
import supabase from './Supabase/supabase.js'

const PAGE_SIZE = 10
const medals = ['🥇', '🥈', '🥉', '🎖️', '🏅']

// HILFSFUNKTION 1: Übersetzt das Tier in ein schickes Text-Label
function getBadgeLabel(rankTier) {
    if (!rankTier) return '';

    if (rankTier.startsWith('TOP_')) {
        const num = parseInt(rankTier.replace('TOP_', ''), 10);
        if (num >= 1 && num <= 25) {
            return `🏆 [RANK ${num}]`;
        }
    }

    const TIER_LABELS = {
        'TOP_50':   '👑 [ELITE 50]',
        'TOP_75':   '🎖️ [EXPERT 75]',
        'TOP_100':  '🥇 [CHAMP 100]',
        'TOP_200':  '🥈 [MASTER 200]',
        'TOP_500':  '🥉 [WARRIOR 500]',
        'TOP_1000': '⚔️ [PRO 1000]',
        'PARTICIPANT': '♟️ [PLAYER]'
    };

    return TIER_LABELS[rankTier] || rankTier;
}

// HILFSFUNKTION 2: Wirft 'TOP_50' raus, wenn für dieselbe Saison schon ein exakter RANK 1-25 existiert
function filterDuplicateBadges(badgesArray) {
    if (!badgesArray) return [];
    return badgesArray.filter((badge, idx, self) => {
        if (badge.rank_tier === 'TOP_50') {
            const hatExaktenRang = self.some(b =>
                b.season_name === badge.season_name &&
                b.rank_tier.startsWith('TOP_') &&
                parseInt(b.rank_tier.replace('TOP_', ''), 10) <= 25
            );
            return !hatExaktenRang; // Wenn exakter Rang existiert, fliegt TOP_50 raus
        }
        return true;
    });
}

export default function Leaderboard({ onBack, user }) {
    const [players, setPlayers] = useState([])
    const [topPlayers, setTopPlayers] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadingTop, setLoadingTop] = useState(true)
    const [page, setPage] = useState(0)
    const [total, setTotal] = useState(0)
    const [myRank, setMyRank] = useState(null)
    const [myBadges, setMyBadges] = useState([])
    const [myProfile, setMyProfile] = useState(null)
    const [loadingRank, setLoadingRank] = useState(true)
    const [rankErrorMsg, setRankErrorMsg] = useState(null)

    const targetId = user?.id || user?.user?.id || user?.data?.user?.id || user?.data?.id;

    useEffect(() => {
        fetchTopFive()
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

        const now = new Date();
        const seasonName = `Saison_${now.getFullYear()}_${now.getMonth() + 1}`;

        try {
            const { data, error } = await supabase.rpc('trigger_seasonal_reset', {
                v_season_name: seasonName
            });

            if (error) throw error;

            alert(data);
            window.location.reload();
        } catch (err) {
            console.error("Fehler beim Saison-Reset:", err);
            alert("Fehler: " + err.message);
        }
    }

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
                .range(0, 4)

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
                .select(`
                    username, 
                    elo,
                    badges (
                        season_name,
                        rank_tier
                    )
                `)
                .eq('id', uid)
                .maybeSingle()

            if (profileError) throw profileError;

            if (!me) {
                setRankErrorMsg("Profil nicht in DB");
                setLoadingRank(false);
                return;
            }

            setMyProfile(me)
            setMyBadges(me.badges || [])

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
                minHeight: '24px',
                flexWrap: 'wrap'
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
                                {/* FIX 1: Filter jetzt auch beim eigenen Profil angewendet */}
                                {filterDuplicateBadges(myBadges).map((badge, idx) => (
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
                                        {getBadgeLabel(badge.rank_tier)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <span>Keine Daten verfügbar</span>
                )}
            </div>

            {/* DIE TOP 5 BOX */}
            <h2 className="section-title">👑 Elite Top 5</h2>
            <div className="top-five-container">
                {loadingTop ? (
                    <p className="no-moves">Lade Champions...</p>
                ) : (
                    topPlayers.map((player, i) => (
                        <div key={i} className={`top-card rank-${i + 1}`}>
                            <div className="top-card-badge">{medals[i]}</div>
                            <div className="top-card-info">
                                <span className="top-card-name">
                                    {player.username}
                                    {player.badges && player.badges.length > 0 && (
                                        <span style={{ marginLeft: '8px', display: 'inline-flex', gap: '4px' }}>
                                            {/* FIX 2: Filter hier für die Top 5 Box eingebaut! */}
                                            {filterDuplicateBadges(player.badges).slice(0, 3).map((badge, idx) => (
                                                <span key={idx} style={{ fontSize: '10px', color: '#39ff14' }} title={badge.season_name}>
                                                    {getBadgeLabel(badge.rank_tier)}
                                                </span>
                                            ))}
                                        </span>
                                    )}
                                </span>
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

                            <span className="lb-name">
                                {player.username}
                                {player.badges && player.badges.length > 0 && (
                                    <span style={{ marginLeft: '6px', display: 'inline-flex', gap: '4px' }}>
                                        {/* FIX 3: Nutzt jetzt auch die saubere Hilfsfunktion */}
                                        {filterDuplicateBadges(player.badges).slice(0, 3).map((badge, idx) => (
                                            <span
                                                key={idx}
                                                style={{ fontSize: '10px', opacity: 0.8, color: '#39ff14' }}
                                                title={badge.season_name}
                                            >
                                                {getBadgeLabel(badge.rank_tier)}
                                            </span>
                                        ))}
                                    </span>
                                )}
                            </span>

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