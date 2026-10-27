import { useEffect, useState } from 'react'
import supabase from './Supabase/supabase.js'

const PAGE_SIZE = 10
const medals = ['🥇', '🥈', '🥉', '🎖️', '🏅']

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

function filterDuplicateBadges(badgesArray) {
    if (!badgesArray) return [];
    return badgesArray.filter((badge, idx, self) => {
        if (badge.rank_tier === 'TOP_50') {
            const hatExaktenRang = self.some(b =>
                b.season_name === badge.season_name &&
                b.rank_tier.startsWith('TOP_') &&
                parseInt(b.rank_tier.replace('TOP_', ''), 10) <= 25
            );
            return !hatExaktenRang;
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
    const [selectedPlayer, setSelectedPlayer] = useState(null)

    const ADMIN_ID = "4260345b-edac-4666-992f-d6a9e1d139c4";
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

    useEffect(() => {
        function closeOnEscape(event) {
            if (event.key === 'Escape') setSelectedPlayer(null)
        }

        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    }, [])

    async function runMonthlySeasonReset() {
        const confirmation = window.confirm("Möchtest du die aktuelle Saison wirklich beenden? Alle Elos werden auf 1200 zurückgesetzt!");
        if (!confirmation) return;

        const password = window.prompt("Bitte Admin-Passwort eingeben, um den Reset zu bestätigen:");
        if (password !== "6769") {
            alert("Falsches Passwort! Reset abgebrochen.");
            return;
        }

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
    const isAdmin = user?.id === ADMIN_ID;
    const selectedBadges = selectedPlayer
        ? filterDuplicateBadges(selectedPlayer.badges)
        : [];

    return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">🏆 LEADERBOARD</p>

            {/* Eigener Rang (Steuerung komplett via .my-rank-badge) */}
            <div className="my-rank-badge">
                {loadingRank ? (
                    <span>Lade deinen Rang...</span>
                ) : rankErrorMsg ? (
                    <span className="rank-error">❌ Fehler: {rankErrorMsg}</span>
                ) : myProfile && myRank !== null ? (
                    <>
                        <span className="my-rank-user">👤 {myProfile.username}</span>
                        <span className="my-rank-pos"><strong>Position:</strong> #{myRank}</span>
                        <span className="my-rank-elo">⚡ {myProfile.elo} Elo</span>

                        {myBadges && myBadges.length > 0 && (
                            <div className="my-badges-wrapper">
                                {filterDuplicateBadges(myBadges).map((badge, idx) => (
                                    <span
                                        key={idx}
                                        className="profile-badge-item"
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
                        <button
                            key={i}
                            type="button"
                            className={`top-card rank-${i + 1}`}
                            onClick={() => setSelectedPlayer({
                                ...player,
                                rank: i + 1
                            })}
                            aria-label={`Details für ${player.username}`}
                        >
                            <div className="top-card-badge">{medals[i]}</div>
                            <div className="top-card-info">
                                <span className="top-card-name">
                                    <span className="player-name">{player.username}</span>
                                </span>
                                <span className="top-card-elo">⚡ {player.elo} Elo</span>
                            </div>
                            <div className="top-card-rank-text">#{i + 1}</div>
                        </button>
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
                        <button
                            key={i}
                            type="button"
                            className={`leaderboard-row ${globalIndex < 3 ? 'top' : ''}`}
                            onClick={() => setSelectedPlayer({
                                ...player,
                                rank: globalIndex + 1
                            })}
                            aria-label={`Details für ${player.username}`}
                        >
                            <span className="lb-rank">
                                {globalIndex < 3 ? medals[globalIndex] : `#${globalIndex + 1}`}
                            </span>

                            <span className="lb-name">
                                <span className="player-name">{player.username}</span>
                            </span>

                            <span className="lb-elo">⚡ {player.elo}</span>
                        </button>
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

            {/* Admin-Bereich (Steuerung komplett via .admin-panel) */}
            {isAdmin && (
                <div className="admin-panel">
                    <h3 className="admin-title">🚨 SYSTEM CONTROL (ADMIN ONLY)</h3>
                    <button className="matrix-btn resign admin-btn" onClick={runMonthlySeasonReset}>
                        TRIGGER SEASONAL RESET
                    </button>
                </div>
            )}

            {selectedPlayer && (
                <div
                    className="player-modal-backdrop"
                    role="presentation"
                    onClick={() => setSelectedPlayer(null)}
                >
                    <section
                        className="player-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="player-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className="player-modal-close"
                            onClick={() => setSelectedPlayer(null)}
                            aria-label="Details schließen"
                        >
                            ×
                        </button>
                        <p className="player-modal-rank">#{selectedPlayer.rank}</p>
                        <h2 id="player-modal-title">{selectedPlayer.username}</h2>
                        <p className="player-modal-elo">⚡ {selectedPlayer.elo} Elo</p>
                        <div className="player-modal-badges">
                            <h3>Saison-Badges</h3>
                            {selectedBadges.length > 0 ? (
                                selectedBadges.map((badge, idx) => (
                                    <div className="player-modal-badge" key={`${badge.season_name}-${idx}`}>
                                        <span>{getBadgeLabel(badge.rank_tier)}</span>
                                        <small>{badge.season_name}</small>
                                    </div>
                                ))
                            ) : (
                                <p>Noch keine Badges</p>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </div>
    )
}