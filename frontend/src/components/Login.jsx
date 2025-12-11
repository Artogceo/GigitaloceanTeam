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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 480 }}>
      <form onSubmit={submit} style={{ width: 420, background: 'white', padding: 28, borderRadius: 12, boxShadow: '0 10px 30px rgba(11,18,32,0.06)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Вход</h2>
        <div style={{ marginBottom: 8 }}>
          <input placeholder="имя пользователя" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <input placeholder="пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="submit" disabled={loading} className="button-primary btn-small">{loading ? 'Вхожу...' : 'Войти'}</button>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Регистрация отключена. Пользователей создаёт админ.</div>
        </div>
      </form>
    </div>
  )
}


