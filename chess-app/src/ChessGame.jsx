import { useState, useEffect } from "react"
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

// ✅ now accepts botMode and onBack as props
export default function ChessGame({ botMode = "none", onBack }) {
    const [game, setGame] = useState(new Chess())
    const [from, setFrom] = useState(null)
    const [history, setHistory] = useState([])
    const [hints, setHints] = useState([])
    const [thinking, setThinking] = useState(false)

    const files = ["a","b","c","d","e","f","g","h"]
    const ranks = [8,7,6,5,4,3,2,1]

    // ✅ reset when botMode changes (switching game modes)
    useEffect(() => {
        reset()
    }, [botMode])

    useEffect(() => {
        if (game.isGameOver()) return
        const isBotTurn =
            (botMode === "black" && game.turn() === "b") ||
            (botMode === "both")

        if (isBotTurn) {
            setThinking(true)
            const timeout = setTimeout(() => {
                const copy = new Chess(game.fen())
                const move = getBestMove(copy)
                if (move) {
                    copy.move(move)
                    setGame(copy)
                    setHistory(h => [...h, move.san])
                }
                setThinking(false)
            }, 500)
            return () => clearTimeout(timeout)
        }
    }, [game, botMode])

    function handleClick(square) {
        if (thinking) return
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
                    setGame(copy)
                    setHistory(h => [...h, move.san])
                }
            } catch(e) {}
            setFrom(null)
            setHints([])
        }
    }

    function reset() {
        setGame(new Chess())
        setFrom(null)
        setHistory([])
        setHints([])
        setThinking(false)
    }

    function getStatus() {
        if (thinking) return "Bot denkt nach..."
        if (game.isCheckmate()) return "Schachmatt! " + (game.turn() === "w" ? "Schwarz" : "Weiss") + " gewinnt!"
        if (game.isDraw()) return "Unentschieden!"
        if (game.isCheck()) return "Schach!"
        return game.turn() === "w" ? "Weiss ist dran" : "Schwarz ist dran"
    }

    return (
        <div className="app">
            {/* ✅ back button to return to menu */}
            <button className="back-btn" onClick={onBack}>← Menü</button>

            <h1 className="title">♟ CHESS.EXE</h1>

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

                    <button className="reset-btn" onClick={reset}>⟳ Neue Partie</button>
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
        </div>
    )
}