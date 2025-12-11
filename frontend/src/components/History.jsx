import React, { useEffect, useState } from 'react'

export default function History({ openEditor }) {
  const [requests, setRequests] = useState([])
  const [loadingIds, setLoadingIds] = useState([])

  async function loadRequests() {
    const token = localStorage.getItem('token')
    if (!token) return setRequests([])
    try {
      const res = await fetch('/api/my/requests', { headers: { 'Authorization': `Bearer ${token}` } })
      const j = await res.json()
      setRequests(j.requests || [])
    } catch (err) {
      console.error('Failed loading requests', err)
      setRequests([])
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])
 
  // If user is admin and has no personal requests, optionally show admin's requests so History is not empty
  async function tryAdminFallback() {
    try {
      const stored = localStorage.getItem('user')
      const currentUser = stored ? JSON.parse(stored) : null
      if (currentUser && currentUser.is_admin && requests.length === 0) {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/admin/requests', { headers: { 'Authorization': `Bearer ${token}` } })
        const j = await res.json()
        if (j.requests && j.requests.length) setRequests(j.requests)
      }
    } catch (err) {
      // ignore
    }
  }

  useEffect(() => {
    tryAdminFallback()
  }, [requests.length])

  async function refreshRequestStatus(falRequestId) {
    const token = localStorage.getItem('token')
    if (!token) return
    setLoadingIds(ids => [...ids, falRequestId])
    try {
      await fetch(`/api/requests/${falRequestId}/status`, { headers: { 'Authorization': `Bearer ${token}` } })
      // re-fetch history
      await loadRequests()
    } catch (err) {
      console.error('Failed refresh', err)
    } finally {
      setLoadingIds(ids => ids.filter(id => id !== falRequestId))
    }
  }

  return (
    <div>
      <h2>История</h2>
      {/* Личная история: только свои записи. Админ смотрит всех через AdminPanel. */}
      <div style={{ display: 'grid', gap: 12 }}>
        {requests.map(r => (
          <div key={r.id} style={{ padding: 12, borderRadius: 8, border: '1px solid #e6e9ef', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {r.result_url ? <img src={r.result_url} alt="thumb" style={{ width: 90, height: 64, objectFit: 'cover', borderRadius: 8, boxShadow: '0 6px 18px rgba(11,18,32,0.04)' }} /> : <div style={{ width: 90, height: 64, borderRadius: 8, background: '#f3f5f8' }} />}
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{r.prompt}</div>
              </div>
                <div style={{ fontSize: 13, color: '#444' }}>
                  {r.username ? <em style={{ marginRight: 8 }}>{r.username}</em> : null}
                  <strong>Дата:</strong> {r.created_at} &nbsp; • &nbsp; <strong>Статус:</strong> {r.status}
                </div>
                <div style={{ marginTop: 8, fontSize: 13, color: '#333' }}>
                  <strong>Параметры:</strong> {r.aspect_ratio || '—'} / {r.resolution || '—'} / {r.num_images || 1} изображ.
                </div>
                {r.output_format ? <div style={{ marginTop: 6, fontSize: 13 }}><strong>Формат:</strong> {r.output_format}</div> : null}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {r.result_url ? (
                  <>
                    <button onClick={() => openEditor ? openEditor({ url: r.result_url, prompt: r.prompt }) : (function(){ localStorage.setItem('editor_load_image', r.result_url); localStorage.setItem('editor_load_prompt', r.prompt||''); location.href='/' })()} className="button-primary btn-small">Редактировать</button>
                    <a className="minibutton" href={r.result_url} target="_blank" rel="noreferrer">Открыть</a>
                  </>
                ) : <div style={{ fontSize: 12, color: '#999' }}>Результат отсутствует</div>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


