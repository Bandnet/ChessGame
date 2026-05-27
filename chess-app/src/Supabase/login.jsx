import { useState } from 'react'
import { register, login } from './auth'

export default function Login({ onLoggedIn }) {
    const [isRegister, setIsRegister] = useState(false)
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [username, setUsername] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    async function handleSubmit() {
        setError('')
        setLoading(true)
        try {
            if (isRegister) {
                await register(email, password, username)
            } else {
                await login(email, password)
            }
            onLoggedIn()
        } catch (err) {
            setError(err.message)
        }
        setLoading(false)
    }

    return (
        <div className="login">
            <h1 className="title">♟ CHESS.EXE</h1>

            <div className="login-box">
                <h2 className="status">{isRegister ? 'REGISTER' : 'LOGIN'}</h2>

                {isRegister && (
                    <input
                        className="input-field"
                        placeholder="Username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                    />
                )}

                <input
                    className="input-field"
                    placeholder="Email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />

                <input
                    className="input-field"
                    placeholder="Password"
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />

                {error && <p className="error-msg">{error}</p>}

                <button
                    className="submit-btn"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? 'LOADING...' : isRegister ? 'REGISTER' : 'LOGIN'}
                </button>

                <p
                    className="toggle-link"
                    onClick={() => { setIsRegister(!isRegister); setError('') }}
                >
                    {isRegister ? 'Already have an account? Login' : 'No account? Register'}
                </p>
            </div>
        </div>
    )
}