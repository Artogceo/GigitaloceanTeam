import React, { useState } from 'react'

export default function Editor() {
  const [prompt, setPrompt] = useState('')
  const [imageUrlsText, setImageUrlsText] = useState('')
  const [aspectRatio, setAspectRatio] = useState('3:4')
  const [resolution, setResolution] = useState('1K')
  const [numImages, setNumImages] = useState(1)
  const [outputUrl, setOutputUrl] = useState(null)
  const [requestId, setRequestId] = useState(null)
  const [imagesFiles, setImagesFiles] = useState([])
  const [logs, setLogs] = useState([])
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState(null)
  const [manualRequestId, setManualRequestId] = useState('')
  const [outputFormat, setOutputFormat] = useState('png')
  const [syncMode, setSyncMode] = useState(false)
  const [limitGenerations, setLimitGenerations] = useState(false)
  const [enableWebSearch, setEnableWebSearch] = useState(false)
  const [showPro, setShowPro] = useState(false)
  const [modeOption, setModeOption] = useState('auto') // 'auto' | 'text' | 'image'

  const token = localStorage.getItem('token')
  // handle external load events (e.g., from History/Admin openEditor)
  React.useEffect(() => {
    function handler(e) {
      const d = (e && e.detail) || {}
      const url = d.url || localStorage.getItem('editor_load_image')
      const prm = (typeof d.prompt !== 'undefined') ? d.prompt : localStorage.getItem('editor_load_prompt')
      if (url) {
        // fetch image and convert to File, then set into imagesFiles
        (async () => {
          try {
            appendLog(`Загружаю изображение для редактирования из ${url}`)
            const res = await fetch(url)
            const blob = await res.blob()
            const file = new File([blob], 'generated.png', { type: blob.type || 'image/png' })
            setImagesFiles([file])
            setOutputUrl(url)
            setModeOption('image')
            if (prm) setPrompt(prm)
            appendLog('Изображение загружено в редактор')
          } catch (err) {
            appendLog('Ошибка при загрузке изображения для редактирования: ' + String(err))
            setErrorText('Не удалось загрузить изображение')
          } finally {
            try { localStorage.removeItem('editor_load_image'); localStorage.removeItem('editor_load_prompt') } catch(e){}
          }
        })()
      }
    }
    window.addEventListener('editor:load', handler)
    // also check localStorage once on mount
    handler({})
    return () => window.removeEventListener('editor:load', handler)
  }, [])

  function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    const appended = [...imagesFiles]
    for (let i = 0; i < files.length; i++) {
      if (appended.length >= 4) break
      const f = files[i]
      appended.push(f)
    }
    setImagesFiles(appended.slice(0, 4))
  }

  function removeImageAt(index) {
    const arr = [...imagesFiles]
    arr.splice(index, 1)
    setImagesFiles(arr)
  }

  function appendLog(msg) {
    setLogs(l => [...l, `${new Date().toLocaleString()}: ${msg}`])
    // update lightweight status for UI
    if (msg && typeof msg === 'string') {
      if (msg.toLowerCase().includes('ошибка') || msg.toLowerCase().includes('error')) {
        setErrorText(msg)
        setStatusText('error')
      } else {
        setStatusText(msg)
      }
    }
  }
 
  // wrapper to attach token and handle invalid token centrally
  async function apiFetch(input, init = {}) {
    const tk = localStorage.getItem('token')
    if (!tk) {
      appendLog('Нет токена: пожалуйста, войдите в систему')
      alert('Требуется вход. Пожалуйста, войдите снова.')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      location.reload()
      throw new Error('No token')
    }
    init.headers = Object.assign({}, init.headers || {}, { Authorization: `Bearer ${tk}` })
    const res = await fetch(input, init)
    let json = {}
    try {
      json = await res.json()
    } catch (e) {
      // ignore parse errors
    }
    if (res.status === 401 || (json && json.error && json.error.toString().toLowerCase().includes('invalid token'))) {
      appendLog('Токен недействителен — требуется повторный вход')
      alert('Токен недействителен. Пожалуйста, войдите снова.')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      location.reload()
      throw new Error('Invalid token')
    }
    return { res, json }
  }

  async function uploadFiles() {
    if (!imagesFiles || imagesFiles.length === 0) return []
    appendLog(`Uploading ${imagesFiles.length} file(s)`)

    // If some entries are already URLs/src (e.g. generated preview), return those directly
    const urlEntries = imagesFiles.filter(f => !(f instanceof File)).map(f => (f && (f.src || f)) )
    const fileEntries = imagesFiles.filter(f => f instanceof File)

    // If there are no actual File objects to upload, just return the URL entries
    if (fileEntries.length === 0) {
      appendLog(`No local File objects to upload, using existing URLs: ${urlEntries.length}`)
      return urlEntries.slice(0, 4)
    }

    // Otherwise upload only the File objects and combine returned urls with existing url entries
    const fd = new FormData()
    fileEntries.slice(0, 4).forEach(f => fd.append('images', f))
    const { res: upRes, json } = await apiFetch('/api/upload', { method: 'POST', body: fd })
    appendLog(`Upload response received`)
    const uploaded = []
    if (json.data_uris && json.data_uris.length) {
      appendLog(`Using ${json.data_uris.length} data URIs from upload`)
      uploaded.push(...json.data_uris)
    } else if (json.urls && json.urls.length) {
      appendLog(`Using ${json.urls.length} server URLs from upload`)
      uploaded.push(...json.urls)
    }
    const combined = [...uploaded, ...urlEntries].slice(0, 4)
    appendLog(`Total image URLs after upload/merge: ${combined.length}`)
    return combined
  }

  async function runGeneration() {
    if (!token) return alert('Not logged in')
    setErrorText(null)
    setStatusText('starting')
    appendLog('Starting generation flow')
    // Decide mode client-side
    const textUrls = imageUrlsText.split('\n').map(s => s.trim()).filter(Boolean)
    const hasLocalFiles = imagesFiles && imagesFiles.length > 0
    const hasUrls = textUrls.length > 0
    let effectiveMode = modeOption
    if (modeOption === 'auto') {
      effectiveMode = (hasLocalFiles || hasUrls) ? 'image' : 'text'
    }
    appendLog(`Client mode decision: modeOption=${modeOption} => effectiveMode=${effectiveMode}`)

    // Upload files first (if any)
    const uploadedUrls = await uploadFiles()
    const image_urls_from_text = textUrls
    const image_urls = [...uploadedUrls, ...image_urls_from_text].slice(0, 4)
    appendLog(`Итого image_urls: ${image_urls.length}`)

    appendLog('Отправка запроса на сервер')
    const body = {
      prompt,
      image_urls,
      num_images: numImages,
      aspect_ratio: aspectRatio,
      resolution,
      output_format: outputFormat,
      sync_mode: syncMode,
      limit_generations: limitGenerations,
      enable_web_search: enableWebSearch,
      client_mode: effectiveMode
    }
    appendLog(`Тело запроса: ${JSON.stringify(Object.assign({}, body, { prompt: prompt.slice(0,120) }))}`)
    const { res: genRes, json } = await apiFetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    appendLog(`Ответ сервера: ${JSON.stringify(json).slice(0,300)}`)
    if (json.request_id) {
      setRequestId(json.request_id)
      setStatusText('submitted')
      appendLog(`Запрос отправлен: ${json.request_id}`)
      if (json.used_endpoint) appendLog(`Сервер использовал endpoint: ${json.used_endpoint} (fallback=${json.fallback ? 'да' : 'нет'})`)
      pollStatus(json.request_id)
    } else {
      appendLog(`Ошибка генерации: ${json.error || 'Неизвестная ошибка'}`)
      setErrorText(json.error || 'Ошибка при отправке')
      alert(json.error || 'Ошибка при отправке')
    }
  }

  // Poll status repeatedly every 10s until completed or error.
  // If a fallback is created, switch to polling that fallback id.
  async function pollStatus(id) {
    appendLog(`Начинаю периодический опрос статуса для ${id} (каждые 10s)`)
    setErrorText(null)
    setStatusText('Генерация изображения...')
    let currentId = id
    let stopped = false
    const intervalMs = 10000
    const doCheck = async (checkId) => {
      try {
        const { json } = await apiFetch(`/api/requests/${checkId}/status`, { method: 'GET' })
        appendLog(`Status update: ${JSON.stringify(json).slice(0,200)}`)
        if (!json) return
        const status = (json.status || '').toString().toLowerCase()
        if (status === 'billing_error') {
          appendLog('Billing error from provider: ' + JSON.stringify(json))
          setErrorText('Ошибка биллинга на стороне провайдера')
          setStatusText('Ошибка')
          stopped = true
          return
        }
        if (status === 'fallback_created') {
          const fid = json.fallback_request_id
          appendLog(`Fallback создан: ${fid}. Переключаю опрос на fallback.`)
          currentId = fid
          setRequestId(fid)
          setStatusText('В очереди (fallback)')
          // immediately perform one check on the fallback (and continue periodic polling)
          const { json: fj } = await apiFetch(`/api/requests/${fid}/status`, { method: 'GET' })
          appendLog(`Fallback status: ${JSON.stringify(fj).slice(0,200)}`)
          const fstatus = (fj.status || '').toString().toLowerCase()
          if (fstatus === 'completed' || fstatus === 'succeeded') {
            const url = fj.output?.images?.[0]?.url || fj.images?.[0]?.url
            if (url) {
              appendLog(`Получен URL результата от fallback: ${url}`)
              setOutputUrl(url)
              setStatusText('Готово')
              setErrorText(null)
              stopped = true
            } else {
              appendLog('Fallback завершился, но URL не найден')
              setStatusText('Готово')
              stopped = true
            }
          }
          return
        }
        if (status === 'completed' || status === 'succeeded') {
          const url = json.output?.images?.[0]?.url || json.output?.images?.[0]?.image || json.output?.images?.[0]?.file_url || json.images?.[0]?.url
          if (url) {
            appendLog(`Получен URL результата: ${url}`)
            setOutputUrl(url)
            setStatusText('Готово')
            setErrorText(null)
          } else {
            appendLog('Completed but no image URL found in output')
            setStatusText('Готово')
          }
          stopped = true
        }
      } catch (err) {
        appendLog('Ошибка при получении статуса: ' + String(err))
        setErrorText(String(err))
        setStatusText('Ошибка')
        stopped = true
      }
    }

    // initial immediate check
    await doCheck(currentId)
    if (stopped) return
    const interval = setInterval(async () => {
      if (stopped) { clearInterval(interval); return }
      await doCheck(currentId)
      if (stopped) { clearInterval(interval); return }
    }, intervalMs)
  }

  async function fetchResultById(id) {
    if (!id) return
    appendLog(`Manual fetch for ${id}`)
    try {
      const { json } = await apiFetch(`/api/requests/${id}`, { method: 'GET' })
      appendLog(`Manual fetch response: ${JSON.stringify(json).slice(0,300)}`)
      const url = json.images?.[0]?.url || json.output?.images?.[0]?.url || json.result_url
      if (url) {
        setOutputUrl(url)
        setRequestId(id)
        appendLog(`Set output URL from manual fetch: ${url}`)
      } else {
        appendLog('No image URL in manual fetch')
        alert('No image URL available for this request (yet)')
      }
    } catch (err) {
      // apiFetch handles token errors
    }
  }

  return (
      <div style={{ maxWidth: 900 }}>
      <h2>Редактор изображений</h2>
      <div>
        <label>Промпт</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4} style={{ width: '100%' }} />
      </div>
      <div>
        <label>URL изображений (по одному в строке)</label>
        <textarea value={imageUrlsText} onChange={(e) => setImageUrlsText(e.target.value)} rows={3} style={{ width: '100%' }} />
      </div>

      <div style={{ marginTop: 8 }}>
        <label>Загрузить изображения (макс 4)</label>
        <input type="file" accept="image/*" multiple onChange={handleFiles} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {imagesFiles.map((f, i) => {
            const src = f instanceof File ? URL.createObjectURL(f) : (f.src || f)
            const name = f.name || f.file_name || `image-${i}`
            return (
              <div key={i} style={{ width: 120, height: 120, overflow: 'hidden', borderRadius: 8, background: '#fff', position: 'relative' }}>
                <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button onClick={() => removeImageAt(i)} style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>x</button>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <div>
          <label>Соотношение сторон</label>
          <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
            <option value="21:9">21:9</option>
            <option value="16:9">16:9</option>
            <option value="3:2">3:2</option>
            <option value="4:3">4:3</option>
            <option value="5:4">5:4</option>
            <option value="1:1">1:1</option>
            <option value="4:5">4:5</option>
            <option value="3:4">3:4</option>
            <option value="2:3">2:3</option>
            <option value="9:16">9:16</option>
          </select>
        </div>
        <div>
          <label>Разрешение</label>
          <select value={resolution} onChange={(e) => setResolution(e.target.value)}>
            <option value="1K">1K</option>
            <option value="2K">2K</option>
            <option value="4K">4K</option>
          </select>
        </div>
        <div>
          <label>Кол-во изображений</label>
          <input type="number" value={numImages} min={1} max={4} onChange={(e) => setNumImages(Number(e.target.value))} />
        </div>
        <div>
          <label>Режим</label>
          <select value={modeOption} onChange={(e) => setModeOption(e.target.value)}>
            <option value="auto">Авто (определить)</option>
            <option value="text">Только текст (принудительно)</option>
            <option value="image">Редактирование (принудительно)</option>
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontWeight: 600 }}>Pro — дополнительные параметры</label>
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowPro(s => !s)} style={{ padding: 6 }}>{showPro ? 'Скрыть' : 'Показать'} Pro настройки</button>
        </div>
        {showPro && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <label>Формат вывода</label>
                <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)}>
                  <option value="png">png</option>
                  <option value="jpeg">jpeg</option>
                  <option value="webp">webp</option>
                </select>
              </div>
              <div>
                <label><input type="checkbox" checked={syncMode} onChange={(e) => setSyncMode(e.target.checked)} /> Синхронный режим (data URI)</label>
              </div>
              <div>
                <label><input type="checkbox" checked={limitGenerations} onChange={(e) => setLimitGenerations(e.target.checked)} /> Ограничить генерации (1)</label>
              </div>
              <div>
                <label><input type="checkbox" checked={enableWebSearch} onChange={(e) => setEnableWebSearch(e.target.checked)} /> Включить веб-поиск</label>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button onClick={runGeneration}>Генерировать</button>
        <button onClick={() => { setPrompt(''); setImagesFiles([]); setOutputUrl(null); setRequestId(null); setStatusText(''); setErrorText(null) }} style={{ marginLeft: 8 }}>Очистить</button>
      </div>

      <div style={{ marginTop: 12 }}>
        {/* Compact interactive status / errors instead of full logs */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>Статус:</div>
          <div style={{ padding: '6px 10px', borderRadius: 6, background: statusText === 'error' ? '#ffecec' : '#f3f5f8', color: statusText === 'error' ? '#b00020' : '#111' }}>
            {errorText ? errorText : (statusText || '—')}
          </div>
          {requestId ? <div style={{ marginLeft: 8, fontSize: 13 }}>ID: {requestId}</div> : null}
        </div>
      </div>

      
      {outputUrl && (
        <div style={{ marginTop: 12 }}>
          <h3>Результат</h3>
          <div>
            <a href={outputUrl} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>Скачать</a>
            <button onClick={() => { navigator.clipboard && navigator.clipboard.writeText(outputUrl); appendLog('Ссылка результата скопирована в буфер'); alert('Ссылка скопирована') }}>Копировать ссылку</button>
            <button onClick={() => {
              // prepare edit: load generated image into imagesFiles and clear prompt for new prompt
              setImagesFiles([{ src: outputUrl, file_name: 'generated.png' }])
              setPrompt('')
              // force edit mode so client will use image-edit flow
              setModeOption('image')
              appendLog('Переключение в режим редактирования с загруженным сгенерированным изображением')
            }} style={{ marginLeft: 8 }}>Редактировать</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <img src={outputUrl} alt="результат" style={{ maxWidth: '100%', borderRadius: 8 }} />
          </div>
        </div>
      )}
    </div>
  )
}


