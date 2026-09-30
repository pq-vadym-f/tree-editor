import { useState } from 'react'

type HealthResponse = {
  api: string
  database: string
}

export default function App() {
  const [status, setStatus] = useState('Not checked')
  const [checking, setChecking] = useState(false)

  async function checkConnection() {
    setChecking(true)
    setStatus('Checking...')

    try {
      const response = await fetch('/api/health')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const health: HealthResponse = await response.json()

      setStatus(`API: ${health.api}; Database: ${health.database}`)
    } catch {
      setStatus('Connection failed. Check the API and database.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <main>
      <h1>Tree Editor</h1>
      <p>{status}</p>

      <button onClick={checkConnection} disabled={checking}>
        Check connection
      </button>
    </main>
  )
}