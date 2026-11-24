import { useState } from 'react'
import { getToken, login } from './api'
import ItemsPage from './pages/ItemsPage'
import UsersPage from './pages/UsersPage'

type Tab = 'items' | 'users'

export default function App() {
  const [logged, setLogged] = useState(!!getToken())
  const [tab, setTab] = useState<Tab>('items')

  if (!logged) {
    return <Login onOk={() => setLogged(true)} />
  }

  return (
    <div className='layout'>
      <header className='topbar'>
        <div className='brand'>ai-cloth · Admin</div>
        <nav className='nav'>
          <button
            className={`nav-btn ${tab === 'items' ? 'nav-btn-active' : ''}`}
            onClick={() => setTab('items')}
          >
            Items
          </button>
          <button
            className={`nav-btn ${tab === 'users' ? 'nav-btn-active' : ''}`}
            onClick={() => setTab('users')}
          >
            Quota
          </button>
        </nav>
        <button
          className='logout'
          onClick={() => {
            localStorage.clear()
            setLogged(false)
          }}
        >
          Log out
        </button>
      </header>

      <main className='main'>
        {tab === 'items' ? <ItemsPage /> : <UsersPage />}
      </main>
    </div>
  )
}

function Login({ onOk }: { onOk: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      onOk()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className='login-wrap'>
      <form className='login-card' onSubmit={submit}>
        <div className='login-title'>ai-cloth · Admin</div>
        <input
          className='input'
          placeholder='Username'
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className='input'
          type='password'
          placeholder='Password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className='error'>{error}</div>}
        <button className='btn btn-primary' disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
