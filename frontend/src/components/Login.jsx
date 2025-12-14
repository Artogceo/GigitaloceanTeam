import React, { useState } from 'react'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const json = await res.json()
      if (json.token) {
        localStorage.setItem('token', json.token)
        if (json.user) localStorage.setItem('user', JSON.stringify(json.user))
        onLogin()
      } else {
        alert(json.error || 'Ошибка при входе')
      }
    } catch (err) {
      alert('Ошибка сети: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 520 }}>
      <form onSubmit={submit} className="card" style={{ width: 440, margin: '0 auto' }}>
        <h2 style={{ marginTop: 0, marginBottom: 16, textAlign: 'center', fontSize: 28, color: '#dfe8f5' }}>Вход</h2>
        <div style={{ marginBottom: 12 }}>
          <input placeholder="имя пользователя" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%', background: 'linear-gradient(180deg, rgba(23,32,46,0.95), rgba(14,18,28,0.98))', border: '1px solid rgba(255,255,255,0.12)' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <input placeholder="пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%', background: 'linear-gradient(180deg, rgba(23,32,46,0.95), rgba(14,18,28,0.98))', border: '1px solid rgba(255,255,255,0.12)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 4 }}>
          <button type="submit" disabled={loading} className="button-primary" style={{ width: 180, fontSize: 16 }}>{loading ? 'Вхожу...' : 'Войти'}</button>
        </div>
      </form>
    </div>
  )
}


