import React, { useState, useEffect } from 'react'
import Editor from './components/Editor'
import Seedance from './components/Seedance'
import Login from './components/Login'
import History from './components/History'
import AdminPanel from './components/AdminPanel'

export default function App() {
  const [page, setPage] = useState('login')
  const [user, setUser] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
    // notify other components (History) that user logged in
    try { window.dispatchEvent(new Event('user:login')) } catch (e) {}
  }

  return (
    <div className="app-root" style={{ fontFamily: 'Inter, system-ui, Arial', padding: 20 }}>
      {user && page !== 'login' ? (
        <div className="mobile-burger-btn">
          <button onClick={() => setMobileMenuOpen(true)} aria-label="menu">☰</button>
        </div>
      ) : null}
      <div className="page-shell">
        {user && page !== 'login' ? (
          <div className="top-bar-shell">
            <div className="top-bar">
              <nav className="nav-bar fullwidth">
                <ul style={{ display: 'flex', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
                {user && <li><button onClick={() => setPage('editor')} className="minibutton">Nano banana Pro</button></li>}
                {user && <li><button onClick={() => setPage('seedance')} className="minibutton">Seedance</button></li>}
                {user && <li><button onClick={() => setPage('history')} className="minibutton">История</button></li>}
                {user && user.is_admin && <li><button onClick={() => setPage('admin')} className="minibutton">Админ</button></li>}
                {user && <li><button onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setPage('login') }} className="minibutton">Выйти</button></li>}
                </ul>
              </nav>
            </div>
          </div>
        ) : null}
        <div className="content-shell">
          {page !== 'login' ? (
            <div className="hero-title">
              <div className="site-title">Digital Ocean — добро пожаловать</div>
              {user ? <div className="site-subtitle">{user.first_name || ''} {user.last_name || ''}</div> : null}
            </div>
          ) : null}
          <main>
            <div style={{ display: page === 'login' ? 'block' : 'none' }}>
              <Login onLogin={onLogin} />
            </div>
            <div style={{ display: page === 'editor' ? 'block' : 'none' }}>
              <Editor />
            </div>
            <div style={{ display: page === 'seedance' ? 'block' : 'none' }}>
              <Seedance />
            </div>
            <div style={{ display: page === 'history' ? 'block' : 'none' }}>
              <History openEditor={(payload) => {
                // payload: { url, prompt }
                if (payload && payload.url) localStorage.setItem('editor_load_image', payload.url)
                if (payload && typeof payload.prompt !== 'undefined') localStorage.setItem('editor_load_prompt', payload.prompt || '')
                // dispatch event so Editor (if mounted) can pick it up immediately
                window.dispatchEvent(new CustomEvent('editor:load', { detail: payload || {} }))
                setPage('editor')
              }} openSeedance={(payload) => {
                if (payload && payload.image_url) localStorage.setItem('seedance_image_url', payload.image_url)
                if (payload && typeof payload.prompt !== 'undefined') localStorage.setItem('seedance_prompt', payload.prompt || '')
                window.dispatchEvent(new CustomEvent('seedance:load', { detail: payload || {} }))
                setPage('seedance')
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
          {/* Mobile menu overlay */}
          {mobileMenuOpen && (
            <div className="mobile-menu-overlay" onClick={() => setMobileMenuOpen(false)}>
              <div className="mobile-menu" onClick={(e) => e.stopPropagation()}>
                {user ? (
                  <>
                    <button className="minibutton" onClick={() => { setPage('editor'); setMobileMenuOpen(false) }}>Nano banana Pro</button>
                  <button className="minibutton" onClick={() => { setPage('seedance'); setMobileMenuOpen(false) }}>Seedance</button>
                    <button className="minibutton" onClick={() => { setPage('history'); setMobileMenuOpen(false) }}>История</button>
                    {user && user.is_admin ? <button className="minibutton" onClick={() => { setPage('admin'); setMobileMenuOpen(false) }}>Админ</button> : null}
                    <button className="button-ghost" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); setUser(null); setPage('login'); setMobileMenuOpen(false) }}>Выйти</button>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


