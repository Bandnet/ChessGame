import { useState, useEffect, } from "react"
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
    const expectedLoser  = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400))
    return {
        newWinnerElo: Math.round(winnerElo + k * (1 - expectedWinner)),
        newLoserElo:  Math.round(loserElo  + k * (0 - expectedLoser))
    }
}

export default function OnlineGame({ user, onBack }) {
    const [game, setGame]         = useState(new Chess())
    const [gameId, setGameId]     = useState(null)
    const [myColor, setMyColor]   = useState(null)  // "w" or "b"
    const [status, setStatus]     = useState("searching") // searching | waiting | playing | finished
    const [from, setFrom]         = useState(null)
    const [hints, setHints]       = useState([])
    const [result, setResult]     = useState(null)  // "win" | "loss" | "draw"
    const [eloChange, setEloChange] = useState(null)
    const [opponentName, setOpponentName] = useState("")

    const files = ["a","b","c","d","e","f","g","h"]
    const ranks = [8,7,6,5,4,3,2,1]

    // ── 1. MATCHMAKING ──────────────────────────────────────────────
    useEffect(() => {
        findOrCreateGame()
        return () => {
            // cleanup presence on unmount
            supabase.removeAllChannels()
        }
    }, [])

    async function findOrCreateGame() {
        setStatus("searching")

        // look for a waiting game that isn't ours
        const { data: existing } = await supabase
            .from("games")
            .select("*")
            .eq("status", "waiting")
            .neq("player_white", user.id)
            .limit(1)
            .single()

        if (existing) {
            // join as black
            await supabase.from("games").update({
                player_black: user.id,
                status: "active"
            }).eq("id", existing.id)

            setGameId(existing.id)
            setMyColor("b")
            setStatus("playing")

            // get opponent name
            const { data: opp } = await supabase
                .from("profiles")
                .select("username")
                .eq("id", existing.player_white)
                .single()
            setOpponentName(opp?.username || "Opponent")

        } else {
            // create a new waiting game
            const { data: newGame } = await supabase
                .from("games")
                .insert({ player_white: user.id, status: "waiting", board_state: {} })
                .select()
                .single()

            setGameId(newGame.id)
            setMyColor("w")
            setStatus("waiting")
        }
    }

    // ── 2. LISTEN FOR OPPONENT JOINING (if we created the game) ─────
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
                    // get opponent name
                    const { data: opp } = await supabase
                        .from("profiles")
                        .select("username")
                        .eq("id", payload.new.player_black)
                        .single()
                    setOpponentName(opp?.username || "Opponent")
                }
            })
            .subscribe()

        return () => supabase.removeChannel(channel)
    }, [gameId, status])

    // ── 3. LISTEN FOR MOVES ──────────────────────────────────────────
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
                // only apply opponent's moves
                if (payload.new.player_id !== user.id) {
                    applyMove(payload.new.move_notation)
                }
            })
            .subscribe()

        // ── 4. LISTEN FOR DISCONNECTION/FORFEIT ─────────────────────
        const gameChannel = supabase
            .channel("game-status-" + gameId)
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "games",
                filter: `id=eq.${gameId}`
            }, (payload) => {
                if (payload.new.status === "finished" && payload.new.winner) {
                    handleGameOver(payload.new.winner)
                }
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
            supabase.removeChannel(gameChannel)
        }
    }, [gameId, status])

    // ── 5. DETECT DISCONNECTION ──────────────────────────────────────
    useEffect(() => {
        if (!gameId || status !== "playing") return

        const channel = supabase.channel("presence-" + gameId, {
            config: { presence: { key: user.id } }
        })

        channel
            .on("presence", { event: "leave" }, async ({ leftPresences }) => {
                // opponent left → they forfeit
                const opponentLeft = leftPresences.some(p => p !== user.id)
                if (opponentLeft) {
                    await finishGame(gameId, user.id) // we win
                }
            })
            .subscribe(async (state) => {
                if (state === "SUBSCRIBED") {
                    await channel.track({ user_id: user.id })
                }
            })

        return () => supabase.removeChannel(channel)
    }, [gameId, status])

    // ── APPLY A MOVE TO THE BOARD ────────────────────────────────────
    function applyMove(notation) {
        setGame(prev => {
            const copy = new Chess(prev.fen())
            try { copy.move(notation) } catch(e) {}
            return copy
        })
        setFrom(null)
        setHints([])
    }

    // ── HANDLE CLICK ─────────────────────────────────────────────────
    async function handleClick(square) {
        if (status !== "playing") return
        if (game.turn() !== myColor) return  // not your turn

        if (from === square) {
            setFrom(null); setHints([]); return
        }

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
                    // save move to supabase → opponent will receive it
                    await supabase.from("moves").insert({
                        game_id: gameId,
                        player_id: user.id,
                        move_notation: move.san
                    })
                    // check if game over after our move
                    if (copy.isGameOver()) {
                        const winnerId = copy.isDraw() ? null : user.id
                        await finishGame(gameId, winnerId)
                    }
                }
            } catch(e) {}
            setFrom(null); setHints([])
        }
    }

    // ── FINISH GAME + UPDATE ELO ─────────────────────────────────────
    async function finishGame(gid, winnerId) {
        await supabase.from("games").update({
            status: "finished",
            winner: winnerId
        }).eq("id", gid)
    }

    async function handleGameOver(winnerId) {
        if (status === "finished") return
        setStatus("finished")

        // get both players' Elo
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
            // draw
            setResult("draw")
            setEloChange(0)
        } else if (winnerId === user.id) {
            // we won
            const { newWinnerElo, newLoserElo } = calculateElo(me.elo, opp.elo)
            setResult("win")
            setEloChange(newWinnerElo - me.elo)
            await supabase.from("profiles").update({ elo: newWinnerElo }).eq("id", user.id)
            await supabase.from("profiles").update({ elo: newLoserElo }).eq("id", opp.id)
        } else {
            // we lost
            const { newWinnerElo, newLoserElo } = calculateElo(opp.elo, me.elo)
            setResult("loss")
            setEloChange(newLoserElo - me.elo)
            await supabase.from("profiles").update({ elo: newWinnerElo }).eq("id", opp.id)
            await supabase.from("profiles").update({ elo: newLoserElo }).eq("id", user.id)
        }
    }

    // ── RENDER ───────────────────────────────────────────────────────
    if (status === "searching") return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>
            <h1 className="title">♟ CHESS.EXE</h1>
            <p className="status">🔍 Suche nach Gegner...</p>
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
                    {result === "win"  && "🏆 Du hast gewonnen!"}
                    {result === "loss" && "💀 Du hast verloren!"}
                    {result === "draw" && "🤝 Unentschieden!"}
                </p>
                <p className={`elo-change ${eloChange >= 0 ? 'positive' : 'negative'}`}>
                    {eloChange > 0 ? '+' : ''}{eloChange}
                </p>
                <button className="menu-btn" onClick={findOrCreateGame}>🔄 Nochmal spielen</button>
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
                <span>{game.turn() === myColor ? "⚡ Dein Zug" : "⏳ Gegner ist dran"}</span>
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
                </div>
            </div>
        </div>
    )
}