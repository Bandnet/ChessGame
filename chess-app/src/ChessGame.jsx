import { useState, useEffect, useRef } from "react"
import { Chess } from "chess.js"

const PIECES = {
    wK:"♔", wQ:"♕", wR:"♖", wB:"♗", wN:"♘", wP:"♙",
    bK:"♚", bQ:"♛", bR:"♜", bB:"♝", bN:"♞", bP:"♟"
}

function getSymbol(piece) {
    if (!piece) return ""
    return PIECES[piece.color + piece.type.toUpperCase()]
}

function getBestMove(game) {
    const moves = game.moves({ verbose: true })
    if (moves.length === 0) return null

    const scored = moves.map(move => {
        let score = Math.random() * 10
        if (move.captured) score += 30
        if (move.flags.includes("k") || move.flags.includes("q")) score += 20
        const copy = new Chess(game.fen())
        copy.move(move)
        if (copy.isCheck()) score += 25
        if (copy.isCheckmate()) score += 1000
        return { move, score }
    })

    scored.sort((a, b) => b.score - a.score)
    return scored[0].move
}

export default function ChessGame({ botMode = "none", onBack }) {
    const [game, setGame] = useState(new Chess())
    const [from, setFrom] = useState(null)
    const [history, setHistory] = useState([])
    const [hints, setHints] = useState([])
    const [thinking, setThinking] = useState(false)
    const [lastMove, setLastMove] = useState(null) // { from, to }

    // ── INAKTIVITÄTS-TIMER STATES ─────────────────────────────────────
    const [moveTimeLeft, setMoveTimeLeft] = useState(300)
    const [gameFinished, setGameFinished] = useState(false)
    const [timeWinner, setTimeWinner] = useState(null)
    const [graceTimeLeft, setGraceTimeLeft] = useState(20)
    const [isGracePeriod, setIsGracePeriod] = useState(true)
    const [showDrawConfirm, setShowDrawConfirm] = useState(false)

    const timerRef = useRef(null)
    const graceTimerRef = useRef(null)

    const files = ["a","b","c","d","e","f","g","h"]
    const ranks = [8,7,6,5,4,3,2,1]

    useEffect(() => {
        reset()
    }, [botMode])

    // ── BOT LOGIK ────────────────────────────────────────────────────
    useEffect(() => {
        if (game.isGameOver() || gameFinished) return
        const isBotTurn =
            (botMode === "black" && game.turn() === "b") ||
            (botMode === "both")

        if (isBotTurn) {
            setThinking(true)
            const timeout = setTimeout(() => {
                const copy = new Chess(game.fen())
                const move = getBestMove(copy)
                if (move) {
                    const result = copy.move(move)
                    if (result) setLastMove({ from: result.from, to: result.to })
                    setGame(copy)
                    setHistory(h => [...h, move.san])
                    setMoveTimeLeft(300)
                }
                setThinking(false)
            }, 500)
            return () => clearTimeout(timeout)
        }
    }, [game, botMode, gameFinished])

    // ── 20 SEKUNDEN START-SCHONFRIST ────────────────────────────────
    useEffect(() => {
        if (gameFinished || history.length > 0) {
            setIsGracePeriod(false)
            clearInterval(graceTimerRef.current)
            return
        }

        graceTimerRef.current = setInterval(() => {
            setGraceTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(graceTimerRef.current)
                    setGameFinished(true)
                    setIsGracePeriod(false)
                    setTimeWinner("Unentschieden! (Weisser Spieler inaktiv)")
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(graceTimerRef.current)
    }, [history, gameFinished])

    // ── MOVE-TIMER LOGIK ─────────────────────────────────────────────
    useEffect(() => {
        if (game.isGameOver() || gameFinished || thinking || isGracePeriod) {
            clearInterval(timerRef.current)
            return
        }

        timerRef.current = setInterval(() => {
            setMoveTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    setGameFinished(true)
                    const loser = game.turn() === "w" ? "Weiss" : "Schwarz"
                    const winner = game.turn() === "w" ? "Schwarz" : "Weiss"
                    setTimeWinner(`${winner} gewinnt (Inaktivität von ${loser})!`)
                    return 0
                }
                return prev - 1
            })
        }, 1000)

        return () => clearInterval(timerRef.current)
    }, [game, gameFinished, thinking, isGracePeriod])

    // ── AUFGEBEN & REMIS ─────────────────────────────────────────────
    function handleResign() {
        if (game.isGameOver() || gameFinished) return
        const activePlayer = game.turn() === "w" ? "Weiss" : "Schwarz"
        const winner = game.turn() === "w" ? "Schwarz" : "Weiss"

        if (window.confirm(`${activePlayer}, möchtest du wirklich aufgeben?`)) {
            clearInterval(timerRef.current)
            clearInterval(graceTimerRef.current)
            setGameFinished(true)
            setIsGracePeriod(false)
            setTimeWinner(`${winner} gewinnt durch Aufgabe!`)
        }
    }

    function handleDraw() {
        if (game.isGameOver() || gameFinished) return
        setShowDrawConfirm(true)
    }

    function confirmDraw(accepted) {
        setShowDrawConfirm(false)
        if (accepted) {
            clearInterval(timerRef.current)
            clearInterval(graceTimerRef.current)
            setGameFinished(true)
            setIsGracePeriod(false)
            setTimeWinner("Unentschieden durch Vereinbarung!")
        }
    }

    // ── KLICK LOGIK ──────────────────────────────────────────────────
    function handleClick(square) {
        if (thinking || gameFinished) return
        if (botMode === "both") return
        if (botMode === "black" && game.turn() === "b") return

        if (from === square) {
            setFrom(null)
            setHints([])
            return
        }

        if (!from) {
            const piece = game.get(square)
            if (piece && piece.color === game.turn()) {
                setFrom(square)
                const moves = game.moves({ square, verbose: true })
                setHints(moves.map(m => m.to))
            }
        } else {
            const piece = game.get(square)
            if (piece && piece.color === game.turn()) {
                setFrom(square)
                const moves = game.moves({ square, verbose: true })
                setHints(moves.map(m => m.to))
                return
            }

            try {
                const copy = new Chess(game.fen())
                const move = copy.move({ from, to: square, promotion: "q" })
                if (move) {
                    setLastMove({ from: move.from, to: move.to })
                    setGame(copy)
                    setHistory(h => [...h, move.san])
                    setMoveTimeLeft(300)
                    setIsGracePeriod(false)
                    clearInterval(graceTimerRef.current)
                }
            } catch(e) {}
            setFrom(null)
            setHints([])
        }
    }

    function reset() {
        clearInterval(timerRef.current)
        clearInterval(graceTimerRef.current)
        setGame(new Chess())
        setFrom(null)
        setHistory([])
        setHints([])
        setThinking(false)
        setMoveTimeLeft(300)
        setGraceTimeLeft(20)
        setIsGracePeriod(true)
        setGameFinished(false)
        setTimeWinner(null)
        setShowDrawConfirm(false)
        setLastMove(null)
    }

    function getStatus() {
        if (timeWinner) return timeWinner
        if (thinking) return "Bot denkt nach..."
        if (game.isCheckmate()) return "Schachmatt! " + (game.turn() === "w" ? "Schwarz" : "Weiss") + " gewinnt!"
        if (game.isDraw()) return "Unentschieden!"
        if (game.isCheck()) return "Schach!"
        return game.turn() === "w" ? "Weiss ist dran" : "Schwarz ist dran"
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className="app">
            <button className="back-btn" onClick={onBack}>← Menü</button>

            <h1 className="title">♟ CHESS.EXE</h1>

            <div className="game-alerts">
                {isGracePeriod && !gameFinished && (
                    <div className="grace-countdown">
                        ⏳ Spiel startet in: {graceTimeLeft}s
                    </div>
                )}

                {!isGracePeriod && moveTimeLeft <= 60 && !gameFinished && (
                    <div className="move-warning-clock">
                        ⚠️ ZEITLIMIT: {game.turn() === "w" ? "♔ Weiss" : "♚ Schwarz"} muss ziehen! ({formatTime(moveTimeLeft)})
                    </div>
                )}
            </div>

            <div className="main">
                <div className="board-wrap">
                    <p className="status">{getStatus()}</p>

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

                    <button className="reset-btn" onClick={reset}>⟳ Neue Partie</button>

                    <div className="action-buttons-bottom">
                        <button className="matrix-btn resign" onClick={handleResign} disabled={gameFinished || game.isGameOver()}>
                            🏳️ Aufgeben
                        </button>
                        <button className="matrix-btn draw" onClick={handleDraw} disabled={gameFinished || game.isGameOver()}>
                            🤝 Remis
                        </button>
                    </div>
                </div>

                <div className="sidebar">
                    <p className="sidebar-title">Zughistorie</p>
                    {history.length === 0 && <p className="no-moves">Noch keine Züge</p>}
                    <div className="history-grid">
                        {history.map((move, i) => (
                            <div key={i} className={`history-item ${i % 2 === 0 ? "white-move" : "black-move"}`}>
                                {i % 2 === 0 && <span className="move-num">{Math.floor(i/2)+1}.</span>}
                                {move}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── TERMINAL CONFIRM POPUP ── */}
            {showDrawConfirm && (
                <div className="terminal-overlay">
                    <div className="terminal-popup">
                        <p className="terminal-popup-text">
                            Möchtet ihr euch auf ein Unentschieden (Remis) einigen?
                        </p>
                        <div className="terminal-popup-buttons">
                            <button className="matrix-btn confirm-yes" onClick={() => confirmDraw(true)}>
                                [ JA ]
                            </button>
                            <button className="matrix-btn confirm-no" onClick={() => confirmDraw(false)}>
                                [ NEIN ]
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}