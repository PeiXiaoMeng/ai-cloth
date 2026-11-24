import { useEffect, useState } from 'react'
import { adjustQuota, fetchUsers, AdminUser } from '../api'

const MAX_PER_OP = 30

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState('')
  const [tip, setTip] = useState('')
  // Per-user adjustment input, default 2 tries
  const [deltas, setDeltas] = useState<Record<number, number>>({})

  const load = async () => {
    try {
      setUsers(await fetchUsers())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const flash = (msg: string) => {
    setTip(msg)
    setTimeout(() => setTip(''), 2000)
  }

  const getDelta = (id: number) => deltas[id] ?? 2

  const setDelta = (id: number, value: number) => {
    // Input clamp: at most 30, at least -30 per operation
    const v = Math.max(-MAX_PER_OP, Math.min(MAX_PER_OP, Math.round(value) || 0))
    setDeltas({ ...deltas, [id]: v })
  }

  const doAdjust = async (user: AdminUser, sign: 1 | -1) => {
    const delta = sign * Math.abs(getDelta(user.id) || 2)
    if (delta === 0) return setError('The adjustment cannot be 0')
    setError('')
    try {
      await adjustQuota(user.id, delta)
      await load()
      flash(
        delta > 0
          ? `Added ${delta} tries for user #${user.id}`
          : `Removed ${Math.abs(delta)} tries for user #${user.id}`,
      )
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div>
      {error && <div className='error banner'>{error}</div>}
      {tip && <div className='tip banner'>{tip}</div>}

      <section className='card'>
        <h3>User Try-on Quota ({users.length})</h3>
        <table className='table'>
          <thead>
            <tr>
              <th>ID</th>
              <th>OpenID</th>
              <th>Used</th>
              <th>Bonus</th>
              <th>Left</th>
              <th>Registered</th>
              <th>Adjust</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className='td-user' data-label=''>
                  User #{u.id}
                </td>
                <td className='mono td-openid' data-label='OpenID' title={u.openid}>
                  {u.openid.length > 18 ? `${u.openid.slice(0, 18)}...` : u.openid}
                </td>
                <td data-label='Used'>{u.tryOnUsed}</td>
                <td
                  data-label='Bonus'
                  className={u.quotaBonus > 0 ? 'green' : u.quotaBonus < 0 ? 'red' : ''}
                >
                  {u.quotaBonus > 0 ? `+${u.quotaBonus}` : u.quotaBonus}
                </td>
                <td data-label='Left'>
                  <b>{u.tryOnLeft}</b>
                </td>
                <td data-label='Registered'>{u.createdAt.slice(0, 10)}</td>
                <td className='td-adjust' data-label=''>
                  <input
                    className='input num'
                    type='number'
                    min={-MAX_PER_OP}
                    max={MAX_PER_OP}
                    value={getDelta(u.id)}
                    onChange={(e) => setDelta(u.id, Number(e.target.value))}
                  />
                  <button className='btn btn-primary' onClick={() => doAdjust(u, 1)}>
                    Add
                  </button>
                  <button className='btn btn-danger' onClick={() => doAdjust(u, -1)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={7} className='empty-cell'>
                  No users yet — they will appear here once someone logs in from the mini-program
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className='hint'>
          Note: the input defaults to 2 tries; each operation adjusts at most 30. "Left" is clamped between 0 and 30 to guard against mis-operations. Use "Remove" to correct mistakes.
        </p>
      </section>
    </div>
  )
}
