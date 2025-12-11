import React, { useState, useEffect } from 'react'
import Editor from './components/Editor'
import Login from './components/Login'
import History from './components/History'
import AdminPanel from './components/AdminPanel'

export default function App() {
  const [page, setPage] = useState('login')
  const [user, setUser] = useState(null)

  useEffect(() => {
    const tk = localStorage.getItem('token')
    if (!tk) {
      setPage('login')
      setUser(null)
      return
    }
    fetch('/api/me', { headers: { Authorization: `Bearer ${tk}` } })
      .then(r => {
        if (!r.ok) throw new Error('Invalid token')
        return r.json()
      })
      .then(j => {
        setUser(j.user)
        setPage('editor')
        localStorage.setItem('user', JSON.stringify(j.user))
      })
      .catch(() => {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setUser(null)
        setPage('login')
      })
  }, [])

  const onLogin = () => {
    const stored = localStorage.getItem('user')
    setUser(stored ? JSON.parse(stored) : null)
    setPage('editor')
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial', padding: 20, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '900px', maxWidth: '95%' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Digital Ocean — добро пожаловать</div>
            {user ? <div style={{ fontSize: 14, color: '#334', fontWeight: 600 }}>{user.first_name || ''} {user.last_name || ''}</div> : null}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {user ? (
              <>
                <button onClick={() => setPage('editor')}>Nano banana Pro</button>
                <button onClick={() => setPage('history')}>История</button>
                {user && user.is_admin ? <button onClick={() => setPage('admin')}>Админ</button> : null}
                <button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setPage('login') }}>Выйти</button>
              </>
            ) : null}
          </div>
        </header>
        <main>
          <div style={{ display: page === 'login' ? 'block' : 'none' }}>
            <Login onLogin={onLogin} />
          </div>
          <div style={{ display: page === 'editor' ? 'block' : 'none' }}>
            <Editor />
          </div>
          <div style={{ display: page === 'history' ? 'block' : 'none' }}>
            <History openEditor={(payload) => {
              // payload: { url, prompt }
              if (payload && payload.url) localStorage.setItem('editor_load_image', payload.url)
              if (payload && typeof payload.prompt !== 'undefined') localStorage.setItem('editor_load_prompt', payload.prompt || '')
              // dispatch event so Editor (if mounted) can pick it up immediately
              window.dispatchEvent(new CustomEvent('editor:load', { detail: payload || {} }))
              setPage('editor')
            }} />
          </div>
          <div style={{ display: page === 'admin' ? 'block' : 'none' }}>
            {user && user.is_admin && <AdminPanel openEditor={(payload) => {
              if (payload && payload.url) localStorage.setItem('editor_load_image', payload.url)
              if (payload && typeof payload.prompt !== 'undefined') localStorage.setItem('editor_load_prompt', payload.prompt || '')
              window.dispatchEvent(new CustomEvent('editor:load', { detail: payload || {} }))
              setPage('editor')
            }} />}
          </div>
        </main>
      </div>
    </div>
  )
}


