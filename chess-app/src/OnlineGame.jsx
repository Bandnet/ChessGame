import { useState, useEffect, useRef } from "react"
import { Chess } from "chess.js"
import supabase from "./Supabase/supabase.js"

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

    // ── TIMER STATES (INAKTIVITÄT) ───────────────────────────────────
    const [moveTimeLeft, setMoveTimeLeft] = useState(300) // 5 Minuten pro Zug
    const [graceTimeLeft, setGraceTimeLeft] = useState(20) // 20s Schonfrist am Start
    const [isGracePeriod, setIsGracePeriod] = useState(true)

    const timerRef                  = useRef(null)
    const graceTimerRef              = useRef(null)

    const files = myColor === "b" ? ["h","g","f","e","d","c","b","a"] : ["a","b","c","d","e","f","g","h"]
    const ranks = myColor === "b" ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1]

    useEffect(() => {
        findOrCreateGame()
        return () => {
            supabase.removeAllChannels()
            clearInterval(timerRef.current)
            clearInterval(graceTimerRef.current)
        }
    }, [])

    // ── VERLASSEN = VERLIEREN ────────────────────────────────────────
    useEffect(() => {
        if (!gameId || status !== "playing") return

        function handleLeave() {
            navigator.sendBeacon(
                `https://dnnaesztxtafkqdithic.supabase.co/functions/v1/forfeit_game`,
                JSON.stringify({ game_id: gameId, user_id: user.id })
            )
        }

        window.addEventListener("beforeunload", handleLeave)
        return () => window.removeEventListener("beforeunload", handleLeave)
    }, [gameId, status])

    // ── 20 SEKUNDEN START-SCHONFRIST (NUR FÜR WEISS BEIM ERSTEN ZUG) ──
    useEffect(() => {
        if (status !== "playing" || game.history().length > 0) {
            setIsGracePeriod(false)
            clearInterval(graceTimerRef.current)
            return
        }

        graceTimerRef.current = setInterval(() => {
            setGraceTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(graceTimerRef.current)
                    setIsGracePeriod(false)
                    // Wenn ich Weiß bin und nichts mache -> Ich trigger das Remis wegen Inaktivität
                    if (myColor === "w") {
                        finishGame(gameId, null)
                    }
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(graceTimerRef.current)
    }, [status, game, myColor, gameId])

    // ── INAKTIVITÄTS-TIMER LOGIK (NUR AKTIV WENN ICH DRAN BIN) ────────
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
            setMoveTimeLeft(300) // Reset auf 5 Minuten, während der Gegner nachdenkt
        }

        return () => clearInterval(timerRef.current)
    }, [game, status, myColor, isGracePeriod])

    // Wenn die eigene Zeit abläuft, verliert man das Spiel online
    async function handleTimeout() {
        if (!gameId) return
        const opponentId = await fetchOpponentId()
        if (opponentId) {
            await finishGame(gameId, opponentId)
        }
    }

    async function fetchOpponentId() {
        const { data } = await supabase
            .from("games")
            .select("player_white, player_black")
            .eq("id", gameId)
            .single()
        if (!data) return null
        return myColor === "w" ? data.player_black : data.player_white
    }

    // ── AUFGEBEN & REMIS BUTTONS ────────────────────────────────────
    async function handleResign() {
        if (!gameId || status !== "playing") return
        const confirmResign = window.confirm("Möchtest du wirklich aufgeben?")
        if (!confirmResign) return

        const opponentId = await fetchOpponentId()
        if (opponentId) {
            await finishGame(gameId, opponentId)
        }
    }

    async function handleOfferDraw() {
        if (!gameId || status !== "playing") return
        const confirmDraw = window.confirm("Möchtest du ein Unentschieden anbieten? (Triggert sofortiges Remis für diese Demo)")
        if (confirmDraw) {
            await finishGame(gameId, null)
        }
    }

    async function findOrCreateGame() {
        setStatus("searching")
        setMoveTimeLeft(300)
        setGraceTimeLeft(20)
        setIsGracePeriod(true)
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
                    .select("username")
                    .eq("id", g.player_white)
                    .maybeSingle()
                setOpponentName(opp?.username || "Opponent")

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
                        .select("username")
                        .eq("id", payload.new.player_black)
                        .maybeSingle()
                    setOpponentName(opp?.username || "Opponent")
                }
            })
            .subscribe()
        return () => supabase.removeChannel(channel)
    }, [gameId, status])

    // ── LISTEN FOR MOVES ─────────────────────────────────────────────
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
                    applyMove(payload.new.move_notation)

                    // Sobald ein gegnerischer Zug ankommt, bricht die Startfrist ab und der eigene Timer resettet
                    setIsGracePeriod(false)
                    clearInterval(graceTimerRef.current)
                    setMoveTimeLeft(300)
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
            try { copy.move(notation) } catch(e) {}
            return copy
        })
        setFrom(null)
        setHints([])
    }

    async function handleClick(square) {
        if (status !== "playing") return
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
            try {
                const copy = new Chess(game.fen())
                const move = copy.move({ from, to: square, promotion: "q" })
                if (move) {
                    setGame(copy)

                    // Eigener Zug beendet die Start-Schonfrist sofort und setzt Timer zurück
                    setIsGracePeriod(false)
                    clearInterval(graceTimerRef.current)
                    setMoveTimeLeft(300)

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
            setFrom(null); setHints([])
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
            const { newWinnerElo, newLoserElo } = calculateElo(me.elo, opp.elo)
            setResult("win")
            setEloChange(newWinnerElo - me.elo)
            await supabase.from("profiles").update({ elo: newWinnerElo }).eq("id", user.id)
            await supabase.from("profiles").update({ elo: newLoserElo }).eq("id", opp.id)
        } else {
            const { newWinnerElo, newLoserElo } = calculateElo(opp.elo, me.elo)
            setResult("loss")
            setEloChange(newLoserElo - me.elo)
            await supabase.from("profiles").update({ elo: newWinnerElo }).eq("id", opp.id)
            await supabase.from("profiles").update({ elo: newLoserElo }).eq("id", user.id)
        }
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    if (status === "searching") return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">Suche nach Gegner...</p>
        </div>
    )

    if (status === "waiting") return (
        <div className="app">
            <button className="back-btn" onClick={async () => {
                await supabase.from("games").delete().eq("id", gameId)
                onBack()
            }}>← Menü</button>
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
                <span>vs {opponentName}</span>
                <span>{myColor === "w" ? "Du spielst ♔ Weiss" : "Du spielst ♚ Schwarz"}</span>
                <span className={game.turn() === myColor ? "your-turn" : "wait-turn"}>
                    {game.turn() === myColor ? "⚡ Dein Zug" : "⏳ Gegner ist dran"}
                </span>
            </div>

            {/* ── ALERTS: ZEIGT DIE SYSTEMWARNUNGEN NATIVE AN (WENN UNTER 1 MIN) ── */}
            <div className="game-alerts">
                {isGracePeriod && (
                    <div className="grace-countdown">
                        ⏳ Spiel startet in: {graceTimeLeft}s
                    </div>
                )}

                {!isGracePeriod && moveTimeLeft <= 60 && game.turn() === myColor && (
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

                                let squareClass = isLight ? "sq light" : "sq dark"
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

                    {/* ── DIE NEUEN MATRIX BUTTONS STEHEN JETZT UNTEN UNTER DEM BRETT ── */}
                    <div className="action-buttons-bottom">
                        <button className="matrix-btn resign" onClick={handleResign}>🏳️ Aufgeben</button>
                        <button className="matrix-btn draw" onClick={handleOfferDraw}>🤝 Remis</button>
                    </div>
                </div>
            </div>
        </div>
    )
}