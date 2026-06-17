import { useState, useEffect, useRef } from "react"
import { Chess } from "chess.js"
import supabase from "./Supabase/supabase.js"

// ── PASTE YOUR VALUES FROM src/Supabase/supabase.js ──────────────────────────
const SUPABASE_URL  = "https://dnnaesztxtafkqdithic.supabase.co"
const SUPABASE_ANON = "YOUR_ANON_KEY_HERE"   // ← replace this
// ─────────────────────────────────────────────────────────────────────────────

const PIECES = {
    wK:"♔", wQ:"♕", wR:"♖", wB:"♗", wN:"♘", wP:"♙",
    bK:"♚", bQ:"♛", bR:"♜", bB:"♝", bN:"♞", bP:"♟"
}

function getSymbol(piece) {
    if (!piece) return ""
    return PIECES[piece.color + piece.type.toUpperCase()]
}

function calculateElo(winnerElo, loserElo) {
    const k = 32
    const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
    const change = Math.round(k * (1 - expectedWinner))
    return {
        newWinnerElo: winnerElo + change,
        newLoserElo: Math.max(100, loserElo - change)
    }
}

// NEU: HILFSFUNKTION 1: Übersetzt das Tier in ein schickes Text-Label (inkl. Top 25)
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

// NEU: HILFSFUNKTION 2: Filtert das 'TOP_50' raus, wenn für dieselbe Saison schon ein exakter RANK 1-25 existiert
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

const PROMOTION_PIECES = [
    { key: "q", white: "♕", black: "♛", name: "Dame" },
    { key: "r", white: "♖", black: "♜", name: "Turm" },
    { key: "b", white: "♗", black: "♝", name: "Läufer" },
    { key: "n", white: "♘", black: "♞", name: "Springer" },
]

export default function OnlineGame({ user, onBack }) {
    const [game, setGame]           = useState(new Chess())
    const [gameId, setGameId]       = useState(null)
    const [myColor, setMyColor]     = useState(null)
    const [status, setStatus]       = useState("searching")
    const [from, setFrom]           = useState(null)
    const [hints, setHints]         = useState([])
    const [result, setResult]       = useState(null)
    const [eloChange, setEloChange] = useState(null)
    const [opponentName, setOpponentName] = useState("")
    const [opponentElo, setOpponentElo] = useState(null)
    const [opponentBadges, setOpponentBadges] = useState([])
    const [lastMove, setLastMove]   = useState(null)
    const [pendingPromotion, setPendingPromotion] = useState(null)

    // ── REMIS STATUS ─────────────────────────────────────────────────
    const [drawOfferedBy, setDrawOfferedBy] = useState(null)

    // ── TIMER STATES ─────────────────────────────────────────────────
    const [moveTimeLeft, setMoveTimeLeft] = useState(300)
    const [graceTimeLeft, setGraceTimeLeft] = useState(20)
    const [isGracePeriod, setIsGracePeriod] = useState(true)

    const timerRef        = useRef(null)
    const graceTimerRef   = useRef(null)
    const graceStartedRef = useRef(false)
    const gameIdRef       = useRef(null)
    const statusRef       = useRef(null)
    const myColorRef      = useRef(null)

    useEffect(() => { gameIdRef.current = gameId }, [gameId])
    useEffect(() => { statusRef.current = status }, [status])
    useEffect(() => { myColorRef.current = myColor }, [myColor])

    const files = myColor === "b" ? ["h","g","f","e","d","c","b","a"] : ["a","b","c","d","e","f","g","h"]
    const ranks = myColor === "b" ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1]

    // GELÖSCHT: Das alte, lokale TIER_LABELS-Objekt wurde entfernt

    useEffect(() => {
        findOrCreateGame()
        return () => {
            supabase.removeAllChannels()
            clearInterval(timerRef.current)
            clearInterval(graceTimerRef.current)
        }
    }, [])

    // ── VERLASSEN: direkt per Supabase REST löschen ──
    useEffect(() => {
        function handleLeave() {
            const gid = gameIdRef.current
            const st  = statusRef.current

            const headers = {
                "Content-Type":  "application/json",
                "apikey":        SUPABASE_ANON,
                "Authorization": `Bearer ${SUPABASE_ANON}`,
                "Prefer":        "return=minimal"
            }

            navigator.sendBeacon(
                `${SUPABASE_URL}/rest/v1/games?player_white=eq.${user.id}&status=eq.waiting`,
                new Blob([JSON.stringify({})], { type: "application/json" })
            )

            fetch(
                `${SUPABASE_URL}/rest/v1/games?player_white=eq.${user.id}&status=eq.waiting`,
                {
                    method:    "DELETE",
                    keepalive: true,
                    headers
                }
            ).catch(() => {})

            if (gid && st === "playing") {
                navigator.sendBeacon(
                    `https://dnnaesztxtafkqdithic.supabase.co/functions/v1/forfeit_game`,
                    JSON.stringify({ game_id: gid, user_id: user.id, is_waiting: false })
                )
            }
        }

        window.addEventListener("beforeunload", handleLeave)
        return () => window.removeEventListener("beforeunload", handleLeave)
    }, [])

    // ── 20 SEKUNDEN START-SCHONFRIST ─────────────────────────────────
    useEffect(() => {
        if (status !== "playing" || graceStartedRef.current) return
        if (!gameId || !myColor) return

        graceStartedRef.current = true

        graceTimerRef.current = setInterval(() => {
            setGraceTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(graceTimerRef.current)
                    setIsGracePeriod(false)
                    if (myColorRef.current === "w") {
                        finishGame(gameIdRef.current, null)
                    }
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(graceTimerRef.current)
    }, [status, gameId, myColor])

    // ── GRACE PERIOD STOPPEN wenn erster Zug gemacht wird ────────────
    useEffect(() => {
        if (game.history().length > 0 && isGracePeriod) {
            clearInterval(graceTimerRef.current)
            setIsGracePeriod(false)
            setGraceTimeLeft(20)
        }
    }, [game])

    // ── INAKTIVITÄTS-TIMER ───────────────────────────────────────────
    useEffect(() => {
        if (status !== "playing" || isGracePeriod) {
            clearInterval(timerRef.current)
            return
        }

        const isMyTurn = game.turn() === myColor

        if (isMyTurn) {
            timerRef.current = setInterval(() => {
                setMoveTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current)
                        handleTimeout()
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)
        } else {
            clearInterval(timerRef.current)
            setMoveTimeLeft(300)
        }

        return () => clearInterval(timerRef.current)
    }, [game, status, myColor, isGracePeriod])

    async function handleTimeout() {
        if (!gameIdRef.current) return
        const opponentId = await fetchOpponentId()
        if (opponentId) {
            await finishGame(gameIdRef.current, opponentId)
        }
    }

    async function fetchOpponentId() {
        const { data } = await supabase
            .from("games")
            .select("player_white, player_black")
            .eq("id", gameIdRef.current)
            .single()
        if (!data) return null
        return myColorRef.current === "w" ? data.player_black : data.player_white
    }

    async function handleResign() {
        if (!gameId || status !== "playing") return
        const confirmResign = window.confirm("Möchtest du wirklich aufgeben?")
        if (!confirmResign) return

        const opponentId = await fetchOpponentId()
        if (opponentId) {
            await finishGame(gameId, opponentId)
        }
    }

    // ── REMIS ────────────────────────────────────────────────────────
    async function handleDrawButton() {
        if (!gameId || status !== "playing") return

        if (drawOfferedBy && drawOfferedBy !== user.id) {
            await finishGame(gameId, null)
            return
        }

        setDrawOfferedBy(user.id)
        await supabase.from("moves").insert({
            game_id: gameId,
            player_id: user.id,
            move_notation: "[OFFER_DRAW]"
        })
    }

    // ── GAME ABBRECHEN (searching & waiting) ─────────────────────────
    async function cancelAndGoBack() {
        clearInterval(timerRef.current)
        clearInterval(graceTimerRef.current)
        supabase.removeAllChannels()

        await supabase
            .from("games")
            .delete()
            .eq("player_white", user.id)
            .eq("status", "waiting")

        onBack()
    }

    async function findOrCreateGame() {
        await supabase
            .from("games")
            .delete()
            .eq("player_white", user.id)
            .eq("status", "waiting")

        setStatus("searching")
        setGame(new Chess())
        setMoveTimeLeft(300)
        setGraceTimeLeft(20)
        setIsGracePeriod(true)
        setDrawOfferedBy(null)
        setLastMove(null)
        setPendingPromotion(null)
        setFrom(null)
        setHints([])
        graceStartedRef.current = false

        try {
            const { data, error } = await supabase.rpc('find_or_create_game', {
                p_user_id: user.id
            })

            if (error) { console.error(error); return }
            const g = data.game

            if (data.action === 'joined') {
                setGameId(g.id)
                setMyColor("b")
                setStatus("playing")

                const { data: opp } = await supabase
                    .from("profiles")
                    .select(`
                        username, 
                        elo,
                        badges (
                            season_name,
                            rank_tier
                        )
                    `)
                    .eq("id", g.player_white)
                    .maybeSingle()
                setOpponentName(opp?.username || "Opponent")
                setOpponentElo(opp?.elo || 1200)
                setOpponentBadges(opp?.badges || [])
            } else {
                setGameId(g.id)
                setMyColor("w")
                setStatus("waiting")
            }
        } catch (err) {
            console.error("matchmaking error:", err)
        }
    }

    // ── LISTEN FOR OPPONENT JOINING ──────────────────────────────────
    useEffect(() => {
        if (!gameId || status !== "waiting") return
        const channel = supabase
            .channel("game-join-" + gameId)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "games",
                filter: `id=eq.${gameId}`
            }, async (payload) => {
                if (payload.new.status === "active") {
                    setStatus("playing")
                    const { data: opp } = await supabase
                        .from("profiles")
                        .select(`
                            username, 
                            elo,
                            badges (
                                season_name,
                                rank_tier
                            )
                        `)
                        .eq("id", payload.new.player_black)
                        .maybeSingle()
                    setOpponentName(opp?.username || "Opponent")
                    setOpponentElo(opp?.elo || 1200)
                    setOpponentBadges(opp?.badges || [])
                }
            })
            .subscribe()
        return () => supabase.removeChannel(channel)
    }, [gameId, status])

    // ── LISTEN FOR MOVES & REMIS-SIGNALE ─────────────────────────────
    useEffect(() => {
        if (!gameId || status !== "playing") return

        const channel = supabase
            .channel("moves-" + gameId)
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "moves",
                filter: `game_id=eq.${gameId}`
            }, (payload) => {
                if (payload.new.player_id !== user.id) {
                    if (payload.new.move_notation === "[OFFER_DRAW]") {
                        setDrawOfferedBy(payload.new.player_id)
                    } else {
                        applyMove(payload.new.move_notation)
                        setMoveTimeLeft(300)
                        setDrawOfferedBy(null)
                    }
                }
            })
            .subscribe()

        const gameChannel = supabase
            .channel("game-status-" + gameId)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "games",
                filter: `id=eq.${gameId}`
            }, (payload) => {
                if (payload.new.status === "finished") {
                    handleGameOver(payload.new.winner)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
            supabase.removeChannel(gameChannel)
        }
    }, [gameId, status])

    // ── DETECT DISCONNECTION ─────────────────────────────────────────
    useEffect(() => {
        if (!gameId || status !== "playing") return
        const channel = supabase.channel("presence-" + gameId, {
            config: { presence: { key: user.id } }
        })
        channel
            .on("presence", { event: "leave" }, async ({ leftPresences }) => {
                const opponentLeft = leftPresences.some(p => p !== user.id)
                if (opponentLeft) await finishGame(gameId, user.id)
            })
            .subscribe(async (state) => {
                if (state === "SUBSCRIBED") await channel.track({ user_id: user.id })
            })
        return () => supabase.removeChannel(channel)
    }, [gameId, status])

    function applyMove(notation) {
        setGame(prev => {
            const copy = new Chess(prev.fen())
            try {
                const move = copy.move(notation)
                if (move) setLastMove({ from: move.from, to: move.to })
            } catch(e) {}
            return copy
        })
        setFrom(null)
        setHints([])
    }

    function isPromotionMove(fromSq, toSq) {
        const piece = game.get(fromSq)
        if (!piece || piece.type !== "p") return false
        const toRank = toSq[1]
        return (piece.color === "w" && toRank === "8") || (piece.color === "b" && toRank === "1")
    }

    async function commitMove(fromSq, toSq, promotion) {
        try {
            const copy = new Chess(game.fen())
            const move = copy.move({ from: fromSq, to: toSq, promotion })
            if (move) {
                setLastMove({ from: move.from, to: move.to })
                setGame(copy)
                setMoveTimeLeft(300)
                setDrawOfferedBy(null)

                await supabase.from("moves").insert({
                    game_id: gameId,
                    player_id: user.id,
                    move_notation: move.san
                })
                if (copy.isGameOver()) {
                    const winnerId = copy.isDraw() ? null : user.id
                    await finishGame(gameId, winnerId)
                }
            }
        } catch(e) {}
        setFrom(null)
        setHints([])
        setPendingPromotion(null)
    }

    async function handlePromotionChoice(pieceKey) {
        if (!pendingPromotion) return
        await commitMove(pendingPromotion.from, pendingPromotion.to, pieceKey)
    }

    async function handleClick(square) {
        if (status !== "playing" || pendingPromotion) return
        if (game.turn() !== myColor) return

        if (from === square) { setFrom(null); setHints([]); return }

        if (!from) {
            const piece = game.get(square)
            if (piece && piece.color === myColor) {
                setFrom(square)
                setHints(game.moves({ square, verbose: true }).map(m => m.to))
            }
        } else {
            const piece = game.get(square)
            if (piece && piece.color === myColor) {
                setFrom(square)
                setHints(game.moves({ square, verbose: true }).map(m => m.to))
                return
            }

            if (hints.includes(square)) {
                if (isPromotionMove(from, square)) {
                    setPendingPromotion({ from, to: square })
                    setFrom(null)
                    setHints([])
                } else {
                    await commitMove(from, square, "q")
                }
            } else {
                setFrom(null)
                setHints([])
            }
        }
    }

    async function finishGame(gid, winnerId) {
        await supabase.from("games").update({
            status: "finished",
            winner: winnerId
        }).eq("id", gid)
    }

    async function handleGameOver(winnerId) {
        if (status === "finished") return
        clearInterval(timerRef.current)
        clearInterval(graceTimerRef.current)
        setStatus("finished")

        const { data: gameData } = await supabase
            .from("games")
            .select("player_white, player_black")
            .eq("id", gameId)
            .single()

        const { data: profiles } = await supabase
            .from("profiles")
            .select("id, elo")
            .in("id", [gameData.player_white, gameData.player_black])

        const me  = profiles.find(p => p.id === user.id)
        const opp = profiles.find(p => p.id !== user.id)

        if (winnerId === null) {
            setResult("draw")
            setEloChange(0)
        } else if (winnerId === user.id) {
            const { newWinnerElo } = calculateElo(me.elo, opp.elo)
            setResult("win")
            setEloChange(newWinnerElo - me.elo)
        } else {
            const { newLoserElo } = calculateElo(opp.elo, me.elo)
            setResult("loss")
            setEloChange(newLoserElo - me.elo)
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    function getDrawButtonProps() {
        if (!drawOfferedBy) {
            return { text: "🤝 Remis anbieten", disabled: false, className: "matrix-btn draw" }
        }
        if (drawOfferedBy === user.id) {
            return { text: "⏳ Remis angeboten...", disabled: true, className: "matrix-btn draw-pending" }
        }
        return { text: "🤝 Remis annehmen!", disabled: false, className: "matrix-btn draw-accept" }
    }

    const drawBtn = getDrawButtonProps()

    if (status === "searching") return (
        <div className="app">
            <button className="back-btn" onClick={cancelAndGoBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">Suche nach Gegner...</p>
        </div>
    )

    if (status === "waiting") return (
        <div className="app">
            <button className="back-btn" onClick={cancelAndGoBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">⏳ Warte auf Gegner...</p>
            <p className="status">Du spielst Weiss</p>
        </div>
    )

    if (status === "finished") return (
        <div className="app">
            <h1 className="title">♟ CHESS.EXE</h1>
            <div className="result-screen">
                <p className="result-title">
                    {result === "win"  && "Du hast gewonnen!"}
                    {result === "loss" && "Du hast verloren!"}
                    {result === "draw" && "Unentschieden!"}
                </p>
                <p className={`elo-change ${eloChange >= 0 ? 'positive' : 'negative'}`}>
                    {eloChange > 0 ? '+' : ''}{eloChange}
                </p>
                <button className="menu-btn" onClick={findOrCreateGame}>Nochmal spielen</button>
                <button className="back-btn" onClick={onBack}>← Menü</button>
            </div>
        </div>
    )

    return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>

            <div className="online-info">
                <div>
                    <span>vs {opponentName} {opponentElo ? `(⚡ ${opponentElo} Elo)` : ""}</span>

                    {/* OPTIMIERT: Nutzt jetzt filterDuplicateBadges und getBadgeLabel */}
                    {opponentBadges && opponentBadges.length > 0 && (
                        <span className="opp-badges" style={{marginLeft: '10px', display: 'inline-flex', gap: '4px'}}>
                            {filterDuplicateBadges(opponentBadges).slice(0, 3).map((badge, idx) => (
                                <span
                                    key={idx}
                                    style={{fontSize: '11px', color: '#39ff14'}}
                                    title={badge.season_name}
                                >
                                    {getBadgeLabel(badge.rank_tier)}
                                </span>
                            ))}
                        </span>
                    )}
                </div>
                <span>{myColor === "w" ? "Du spielst ♔ Weiss" : "Du spielst ♚ Schwarz"}</span>
                <span className={game.turn() === myColor ? "your-turn" : "wait-turn"}>
                    {game.turn() === myColor ? "⚡ Dein Zug" : "⏳ Gegner ist dran"}
                </span>
            </div>

            <div className="game-alerts">
                {isGracePeriod && (
                    <div className="grace-countdown">
                        ⏳ Spiel startet in: {graceTimeLeft}s
                    </div>
                )}

                {!isGracePeriod && drawOfferedBy && drawOfferedBy !== user.id && (
                    <div className="draw-notification-banner">
                        🤝 SYSTEM: {opponentName} bietet ein Unentschieden an!
                    </div>
                )}

                {!isGracePeriod && (!drawOfferedBy || drawOfferedBy === user.id) && moveTimeLeft <= 60 && game.turn() === myColor && (
                    <div className="move-warning-clock">
                        ⚠️ INAKTIVITÄTS-WARNUNG! Du musst ziehen! ({formatTime(moveTimeLeft)})
                    </div>
                )}
            </div>

            <div className="main">
                <div className="board-wrap">
                    <div className="board">
                        {ranks.map(rank =>
                            files.map(file => {
                                const square = file + rank
                                const piece = game.get(square)
                                const isLight = (files.indexOf(file) + rank) % 2 === 0
                                const isSelected = from === square
                                const isHint = hints.includes(square)
                                const isLastMoveSquare = lastMove && (square === lastMove.from || square === lastMove.to)

                                let squareClass = isLight ? "sq light" : "sq dark"
                                if (isLastMoveSquare) squareClass += " last-move"
                                if (isSelected) squareClass += " selected"
                                if (isHint) squareClass += " hint"

                                return (
                                    <div key={square} className={squareClass} onClick={() => handleClick(square)}>
                                        {getSymbol(piece) && (
                                            <span className={piece.color === "w" ? "piece white" : "piece black"}>
                                                {getSymbol(piece)}
                                            </span>
                                        )}
                                        {isHint && !piece && <div className="dot" />}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    <div className="action-buttons-bottom">
                        <button className="matrix-btn resign" onClick={handleResign}>🏳️ Aufgeben</button>
                        <button className={drawBtn.className} onClick={handleDrawButton} disabled={drawBtn.disabled}>
                            {drawBtn.text}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── PROMOTION PICKER POPUP ── */}
            {pendingPromotion && (
                <div className="terminal-overlay">
                    <div className="terminal-popup">
                        <p className="terminal-popup-text">Umwandlung — wähle eine Figur:</p>
                        <div className="promotion-choices">
                            {PROMOTION_PIECES.map(p => (
                                <button
                                    key={p.key}
                                    className="promotion-btn"
                                    onClick={() => handlePromotionChoice(p.key)}
                                    title={p.name}
                                >
                                    <span className={myColor === "w" ? "piece white" : "piece black"}>
                                        {myColor === "w" ? p.white : p.black}
                                    </span>
                                    <span className="promotion-label">{p.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}