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

    const [game, setGame] = useState(new Chess())
    const [gameId, setGameId] = useState(null)
    const [myColor, setMyColor] = useState(null)
    const [status, setStatus] = useState("searching")

    const [from, setFrom] = useState(null)
    const [hints, setHints] = useState([])

    const [result, setResult] = useState(null)
    const [eloChange, setEloChange] = useState(null)

    const [opponentName, setOpponentName] = useState("")

    // DRAW STATE
    const [drawOfferedBy, setDrawOfferedBy] = useState(null)

    // TIMER
    const [moveTimeLeft, setMoveTimeLeft] = useState(300)
    const [graceTimeLeft, setGraceTimeLeft] = useState(20)
    const [isGracePeriod, setIsGracePeriod] = useState(true)

    const timerRef = useRef(null)
    const graceTimerRef = useRef(null)

    const files = myColor === "b"
        ? ["h","g","f","e","d","c","b","a"]
        : ["a","b","c","d","e","f","g","h"]

    const ranks = myColor === "b"
        ? [1,2,3,4,5,6,7,8]
        : [8,7,6,5,4,3,2,1]

    useEffect(() => {

        findOrCreateGame()

        return () => {
            supabase.removeAllChannels()
            clearInterval(timerRef.current)
            clearInterval(graceTimerRef.current)
        }

    }, [])

    // LEAVE = LOSE
    useEffect(() => {

        if (!gameId || status !== "playing") return

        function handleLeave() {

            navigator.sendBeacon(
                `https://dnnaesztxtafkqdithic.supabase.co/functions/v1/forfeit_game`,
                JSON.stringify({
                    game_id: gameId,
                    user_id: user.id
                })
            )
        }

        window.addEventListener("beforeunload", handleLeave)

        return () => {
            window.removeEventListener("beforeunload", handleLeave)
        }

    }, [gameId, status])

    // START COUNTDOWN
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

    // MOVE TIMER
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

        return myColor === "w"
            ? data.player_black
            : data.player_white
    }

    async function handleResign() {

        if (!gameId || status !== "playing") return

        const confirmResign = window.confirm("Wirklich aufgeben?")

        if (!confirmResign) return

        const opponentId = await fetchOpponentId()

        if (opponentId) {
            await finishGame(gameId, opponentId)
        }
    }

    // DRAW BUTTON
    async function handleDrawButton() {

        if (!gameId || status !== "playing") return

        // ACCEPT DRAW
        if (drawOfferedBy && drawOfferedBy !== user.id) {

            await finishGame(gameId, null)

            return
        }

        // OFFER DRAW
        await supabase
            .from("games")
            .update({
                draw_offered_by: user.id
            })
            .eq("id", gameId)
    }

    async function findOrCreateGame() {

        setStatus("searching")

        setMoveTimeLeft(300)
        setGraceTimeLeft(20)

        setIsGracePeriod(true)

        setDrawOfferedBy(null)

        try {

            const { data, error } = await supabase.rpc(
                "find_or_create_game",
                {
                    p_user_id: user.id
                }
            )

            if (error) {
                console.error(error)
                return
            }

            const g = data.game

            // IMPORTANT FIX
            setDrawOfferedBy(g.draw_offered_by)

            if (data.action === "joined") {

                setGameId(g.id)

                setMyColor("b")

                setStatus("playing")

                const { data: opp } = await supabase
                    .from("profiles")
                    .select("username")
                    .eq("id", g.player_white)
                    .maybeSingle()

                setOpponentName(
                    opp?.username || "Opponent"
                )

            } else {

                setGameId(g.id)

                setMyColor("w")

                setStatus("waiting")
            }

        } catch(err) {

            console.error("matchmaking error:", err)
        }
    }

    // WAIT FOR OPPONENT
    useEffect(() => {

        if (!gameId || status !== "waiting") return

        const channel = supabase
            .channel("game-join-" + gameId)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "games",
                    filter: `id=eq.${gameId}`
                },
                async (payload) => {

                    if (payload.new.status === "active") {

                        setStatus("playing")

                        const { data: opp } = await supabase
                            .from("profiles")
                            .select("username")
                            .eq("id", payload.new.player_black)
                            .maybeSingle()

                        setOpponentName(
                            opp?.username || "Opponent"
                        )
                    }
                }
            )
            .subscribe()

        return () => supabase.removeChannel(channel)

    }, [gameId, status])

    // MOVES + GAME STATUS
    useEffect(() => {

        if (!gameId || status !== "playing") return

        const movesChannel = supabase
            .channel("moves-" + gameId)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "moves",
                    filter: `game_id=eq.${gameId}`
                },
                (payload) => {

                    if (payload.new.player_id !== user.id) {

                        applyMove(payload.new.move_notation)

                        setIsGracePeriod(false)

                        clearInterval(graceTimerRef.current)

                        setMoveTimeLeft(300)
                    }
                }
            )
            .subscribe()

        const gameChannel = supabase
            .channel("game-status-" + gameId)
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "games",
                    filter: `id=eq.${gameId}`
                },
                (payload) => {

                    if (payload.new.status === "finished") {
                        handleGameOver(payload.new.winner)
                    }

                    // IMPORTANT FIX
                    setDrawOfferedBy(
                        payload.new.draw_offered_by
                    )
                }
            )
            .subscribe()

        return () => {

            supabase.removeChannel(movesChannel)
            supabase.removeChannel(gameChannel)
        }

    }, [gameId, status])

    // DISCONNECT DETECTION
    useEffect(() => {

        if (!gameId || status !== "playing") return

        const channel = supabase.channel(
            "presence-" + gameId,
            {
                config: {
                    presence: {
                        key: user.id
                    }
                }
            }
        )

        channel
            .on(
                "presence",
                { event: "leave" },
                async ({ leftPresences }) => {

                    const opponentLeft = leftPresences.some(
                        p => p !== user.id
                    )

                    if (opponentLeft) {
                        await finishGame(gameId, user.id)
                    }
                }
            )
            .subscribe(async (state) => {

                if (state === "SUBSCRIBED") {

                    await channel.track({
                        user_id: user.id
                    })
                }
            })

        return () => supabase.removeChannel(channel)

    }, [gameId, status])

    function applyMove(notation) {

        setGame(prev => {

            const copy = new Chess(prev.fen())

            try {
                copy.move(notation)
            } catch(e) {}

            return copy
        })

        setFrom(null)
        setHints([])
    }

    async function handleClick(square) {

        if (status !== "playing") return

        if (game.turn() !== myColor) return

        if (from === square) {

            setFrom(null)
            setHints([])

            return
        }

        if (!from) {

            const piece = game.get(square)

            if (piece && piece.color === myColor) {

                setFrom(square)

                setHints(
                    game
                        .moves({
                            square,
                            verbose: true
                        })
                        .map(m => m.to)
                )
            }

        } else {

            const piece = game.get(square)

            if (piece && piece.color === myColor) {

                setFrom(square)

                setHints(
                    game
                        .moves({
                            square,
                            verbose: true
                        })
                        .map(m => m.to)
                )

                return
            }

            try {

                const copy = new Chess(game.fen())

                const move = copy.move({
                    from,
                    to: square,
                    promotion: "q"
                })

                if (move) {

                    setGame(copy)

                    setIsGracePeriod(false)

                    clearInterval(graceTimerRef.current)

                    setMoveTimeLeft(300)

                    // RESET DRAW OFFER AFTER MOVE
                    if (drawOfferedBy) {

                        await supabase
                            .from("games")
                            .update({
                                draw_offered_by: null
                            })
                            .eq("id", gameId)
                    }

                    await supabase
                        .from("moves")
                        .insert({
                            game_id: gameId,
                            player_id: user.id,
                            move_notation: move.san
                        })

                    if (copy.isGameOver()) {

                        const winnerId = copy.isDraw()
                            ? null
                            : user.id

                        await finishGame(
                            gameId,
                            winnerId
                        )
                    }
                }

            } catch(e) {}

            setFrom(null)
            setHints([])
        }
    }

    async function finishGame(gid, winnerId) {

        await supabase
            .from("games")
            .update({
                status: "finished",
                winner: winnerId,
                draw_offered_by: null
            })
            .eq("id", gid)
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
            .in("id", [
                gameData.player_white,
                gameData.player_black
            ])

        const me = profiles.find(
            p => p.id === user.id
        )

        const opp = profiles.find(
            p => p.id !== user.id
        )

        if (winnerId === null) {

            setResult("draw")
            setEloChange(0)

        } else if (winnerId === user.id) {

            const {
                newWinnerElo,
                newLoserElo
            } = calculateElo(me.elo, opp.elo)

            setResult("win")

            setEloChange(
                newWinnerElo - me.elo
            )

            await supabase
                .from("profiles")
                .update({
                    elo: newWinnerElo
                })
                .eq("id", user.id)

            await supabase
                .from("profiles")
                .update({
                    elo: newLoserElo
                })
                .eq("id", opp.id)

        } else {

            const {
                newWinnerElo,
                newLoserElo
            } = calculateElo(opp.elo, me.elo)

            setResult("loss")

            setEloChange(
                newLoserElo - me.elo
            )

            await supabase
                .from("profiles")
                .update({
                    elo: newWinnerElo
                })
                .eq("id", opp.id)

            await supabase
                .from("profiles")
                .update({
                    elo: newLoserElo
                })
                .eq("id", user.id)
        }
    }

    function formatTime(seconds) {

        const mins = Math.floor(seconds / 60)

        const secs = seconds % 60

        return `${mins
            .toString()
            .padStart(2, "0")}:${secs
            .toString()
            .padStart(2, "0")}`
    }

    function getDrawButtonProps() {

        if (!drawOfferedBy) {

            return {
                text: "🤝 Remis anbieten",
                disabled: false,
                className: "matrix-btn draw"
            }
        }

        if (drawOfferedBy === user.id) {

            return {
                text: "⏳ Remis angeboten...",
                disabled: true,
                className: "matrix-btn draw-pending"
            }
        }

        return {
            text: "🤝 Remis annehmen!",
            disabled: false,
            className: "matrix-btn draw-accept"
        }
    }

    const drawBtn = getDrawButtonProps()

    if (status === "searching") {

        return (
            <div className="app">

                <button
                    className="back-btn"
                    onClick={onBack}
                >
                    ← Menü
                </button>

                <h1 className="title">
                    ♟ CHESS.EXE
                </h1>

                <p className="status">
                    Suche nach Gegner...
                </p>

            </div>
        )
    }

    return (
        <div className="app">

            <button
                className="back-btn"
                onClick={onBack}
            >
                ← Menü
            </button>

            <h1 className="title">
                ♟ CHESS.EXE
            </h1>

            <div className="online-info">

                <span>
                    vs {opponentName}
                </span>

                <span>
                    {myColor === "w"
                        ? "Du spielst ♔ Weiss"
                        : "Du spielst ♚ Schwarz"}
                </span>

                <span className={
                    game.turn() === myColor
                        ? "your-turn"
                        : "wait-turn"
                }>
                    {game.turn() === myColor
                        ? "⚡ Dein Zug"
                        : "⏳ Gegner ist dran"}
                </span>

            </div>

            <div className="action-buttons-bottom">

                <button
                    className="matrix-btn resign"
                    onClick={handleResign}
                >
                    🏳️ Aufgeben
                </button>

                <button
                    className={drawBtn.className}
                    onClick={handleDrawButton}
                    disabled={drawBtn.disabled}
                >
                    {drawBtn.text}
                </button>

            </div>

        </div>
    )
}