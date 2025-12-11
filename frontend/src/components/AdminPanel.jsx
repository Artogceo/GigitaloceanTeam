import React, { useEffect, useState } from 'react'

export default function AdminPanel({ openEditor }) {
  const [users, setUsers] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [historyUserId, setHistoryUserId] = useState(null)
  const [historyRequests, setHistoryRequests] = useState([])
  const [showServerLogs, setShowServerLogs] = useState(false)
  const [serverLogsText, setServerLogsText] = useState('')

  const token = localStorage.getItem('token')

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      const res = await fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
      const json = await res.json()
      setUsers(json.users || [])
    } catch (err) {
      alert('Ошибка при загрузке пользователей')
    }
  }

  async function createUser() {
    if (!username || !password) return alert('Введите имя пользователя и пароль')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, password, is_admin: isAdmin, first_name: firstName, last_name: lastName })
      })
      const json = await res.json()
      if (json.error) return alert(json.error)
      setUsername(''); setPassword(''); setIsAdmin(false); setFirstName(''); setLastName('')
      fetchUsers()
    } catch (err) {
      alert('Ошибка при создании пользователя')
    }
  }

  async function deleteUser(id) {
    if (!confirm('Удалить пользователя?')) return
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
      let j = {}
      try { j = await res.json() } catch(e) {}
      if (res.ok && j && j.ok) {
        fetchUsers()
        return
      }
      // show helpful message
      const msg = (j && (j.error || j.message)) || `Ошибка удаления (status ${res.status})`
      alert(msg)
    } catch (err) {
      alert('Ошибка при удалении: ' + String(err))
    }
  }

  async function startEditName(user) {
    setEditingUserId(user.id)
    setEditFirstName(user.first_name || '')
    setEditLastName(user.last_name || '')
  }

  async function saveEditName(id) {
    try {
      const res = await fetch(`/api/admin/users/${id}/name`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ first_name: editFirstName, last_name: editLastName }) })
      const j = await res.json()
      if (j.ok) {
        setEditingUserId(null)
        fetchUsers()
      } else {
        alert(j.error || 'Ошибка при сохранении')
      }
    } catch (err) {
      alert('Ошибка при сохранении')
    }
  }

  async function toggleAdmin(userId, value) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ is_admin: value })
      })
      const json = await res.json()
      if (json.error) return alert(json.error)
      fetchUsers()
    } catch (err) {
      alert('Ошибка при обновлении прав')
    }
  }

  async function openHistory(userId) {
    try {
      const res = await fetch(`/api/admin/requests?user_id=${userId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      const j = await res.json()
      setHistoryRequests(j.requests || [])
      setHistoryUserId(userId)
    } catch (err) {
      alert('Ошибка при получении истории')
    }
  }

  async function fetchServerLogs() {
    try {
      const res = await fetch('/api/admin/logs', { headers: { 'Authorization': `Bearer ${token}` } })
      const j = await res.json()
      if (j.logs) setServerLogsText(j.logs)
      setShowServerLogs(true)
    } catch (err) {
      alert('Ошибка при получении логов')
    }
  }

  return (
    <div>
      <h2>Админ</h2>
      <div style={{ maxWidth: 800 }}>
        <h3>Создать пользователя</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="имя пользователя" value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: 8, minWidth: 160 }} />
          <input placeholder="пароль" value={password} onChange={(e) => setPassword(e.target.value)} style={{ padding: 8, minWidth: 160 }} />
          <input placeholder="Имя" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: 8, minWidth: 120 }} />
          <input placeholder="Фамилия" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: 8, minWidth: 120 }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} /> админ
          </label>
          <button onClick={createUser} style={{ padding: '8px 12px', marginLeft: 6 }}>Создать</button>
        </div>

        <h3 style={{ marginTop: 16 }}>Существующие пользователи</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 8, border: '1px solid #e6e9ef', background: '#fff' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f3f5f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  {u.username ? u.username[0].toUpperCase() : 'U'}
                </div>
                <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 700 }}>{u.username}</div>
                  <div style={{ fontSize: 12, color: '#556170' }}>· Генераций: <strong style={{ color: '#111', marginLeft: 6 }}>{u.gen_count || 0}</strong></div>
                </div>
                <div style={{ fontSize: 13, color: '#556170' }}>{u.first_name || ''} {u.last_name || ''}</div>
                <div style={{ fontSize: 12, color: u.is_admin ? '#0b8457' : '#8a8f98' }}>{u.is_admin ? 'Админ' : 'Пользователь'}</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {editingUserId === u.id ? (
                  <>
                    <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="Имя" style={{ padding: 6 }} />
                    <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Фамилия" style={{ padding: 6 }} />
                    <button onClick={() => saveEditName(u.id)} style={{ padding: '6px 8px' }}>Сохранить</button>
                    <button onClick={() => setEditingUserId(null)} style={{ padding: '6px 8px' }}>Отмена</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => toggleAdmin(u.id, u.is_admin ? 0 : 1)} style={{ padding: '6px 8px' }}>{u.is_admin ? 'Отнять' : 'Дать'}</button>
                    <button onClick={() => startEditName(u)} style={{ padding: '6px 8px' }}>ФИО</button>
                    <button onClick={() => openHistory(u.id)} style={{ padding: '6px 8px' }}>История</button>
                    <button onClick={() => deleteUser(u.id)} className="button-ghost btn-small" style={{ color: '#b00020' }}>Удалить</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {historyUserId && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>История пользователя ID {historyUserId}</strong>
              <button onClick={() => { setHistoryUserId(null); setHistoryRequests([]) }} style={{ padding: '6px 8px' }}>Закрыть</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {historyRequests.length === 0 ? (
                <div style={{ padding: 10, border: '1px solid #e6e9ef', borderRadius: 8, background: '#fff' }}>Нет записей</div>
              ) : historyRequests.map(r => (
                <div key={r.id} style={{ padding: 12, borderRadius: 8, border: '1px solid #e6e9ef', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {r.result_url ? <img src={r.result_url} alt="thumb" style={{ width: 90, height: 64, objectFit: 'cover', borderRadius: 8, boxShadow: '0 6px 18px rgba(11,18,32,0.04)' }} /> : <div style={{ width: 90, height: 64, borderRadius: 8, background: '#f3f5f8' }} />}
                  <div style={{ fontWeight: 700 }}>{r.prompt}</div>
                </div>
                    <div style={{ fontSize: 13, color: '#444', marginTop: 6 }}>
                      <strong>Дата:</strong> {r.created_at} &nbsp; • &nbsp; <strong>Статус:</strong> {r.status}
                    </div>
                    <div style={{ marginTop: 8, fontSize: 13, color: '#333' }}>
                      <strong>Параметры:</strong> {r.aspect_ratio || '—'} / {r.resolution || '—'} / {r.num_images || 1} изображ.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {r.result_url ? (
                      <>
                        <button onClick={() => openEditor ? openEditor({ url: r.result_url, prompt: r.prompt }) : (function(){ localStorage.setItem('editor_load_image', r.result_url); localStorage.setItem('editor_load_prompt', r.prompt||''); location.href='/' })()} className="button-primary btn-small">Редактировать</button>
                        <a className="minibutton" href={r.result_url} target="_blank" rel="noreferrer">Открыть</a>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: '#999' }}>Результат отсутствует</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ marginTop: 12 }}>
          <button onClick={fetchServerLogs} style={{ padding: '6px 10px', marginTop: 8 }}>Показать server.log</button>
          {showServerLogs && (
            <div style={{ marginTop: 8 }}>
              <button onClick={() => setShowServerLogs(false)} style={{ padding: '6px 8px', marginBottom: 6 }}>Закрыть логи</button>
              <pre style={{ maxHeight: 300, overflow: 'auto', background: '#081226', color: '#cfe6ff', padding: 12, borderRadius: 8 }}>{serverLogsText}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


