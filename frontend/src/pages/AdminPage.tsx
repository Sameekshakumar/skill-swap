import { Fragment, useCallback, useEffect, useState } from 'react'
import axios from '../utils/axios'
import { useAuth } from '../contexts/AuthContext'
import { useFeedback } from '../contexts/FeedbackContext'
import { handleApiError } from '../utils/helpers'
import './AdminPage.css'

interface AdminUser {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
  status: 'active' | 'suspended'
  college?: string
  yearOfStudy?: string
  creditBalance: number
  rating: number
  reviewCount: number
  createdAt: string
}

interface UserPage {
  results: AdminUser[]
  total: number
  page: number
  hasMore: boolean
}

const PAGE_SIZE = 25

export default function AdminPage() {
  const { user: me, refreshUser } = useAuth()
  const { notify, confirm } = useFeedback()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Which row is mid-request, so only that row's buttons are disabled.
  const [busyId, setBusyId] = useState<string | null>(null)
  // The credit editor opens inline under one row at a time.
  const [creditFor, setCreditFor] = useState<string | null>(null)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditReason, setCreditReason] = useState('')

  const load = useCallback(async (nextPage: number, search: string) => {
    setLoading(true)
    setError('')
    try {
      // The shared axios instance is untyped (its interceptors use `any`), so
      // the shape is asserted here rather than passed as a type argument.
      const response = await axios.get('/admin/users', {
        params: { page: nextPage, limit: PAGE_SIZE, query: search || undefined }
      })
      const data = response.data as UserPage
      setUsers(data.results)
      setTotal(data.total)
      setPage(data.page)
      setHasMore(data.hasMore)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced so typing a search does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => load(1, query), 300)
    return () => clearTimeout(timer)
  }, [query, load])

  // Every action reloads the current page rather than patching the row by
  // hand, so what is on screen is always what the server actually has.
  const run = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusyId(id)
    try {
      await action()
      notify(success)
      await load(page, query)
      // An admin can change their own credits, and the navbar shows them.
      if (id === me?.id) await refreshUser()
    } catch (err) {
      notify(handleApiError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }

  const toggleStatus = (u: AdminUser) =>
    run(
      u.id,
      () => axios.patch(`/admin/users/${u.id}/status`, {
        status: u.status === 'active' ? 'suspended' : 'active'
      }),
      u.status === 'active' ? `${u.name} suspended` : `${u.name} reinstated`
    )

  const toggleRole = async (u: AdminUser) => {
    const promoting = u.role === 'user'
    const ok = await confirm(
      promoting
        ? `Make ${u.name} an administrator? They will be able to suspend accounts and move credits.`
        : `Remove ${u.name}'s administrator access?`,
      promoting ? 'Promote' : 'Demote'
    )
    if (!ok) return

    run(
      u.id,
      () => axios.patch(`/admin/users/${u.id}/role`, { role: promoting ? 'admin' : 'user' }),
      promoting ? `${u.name} is now an admin` : `${u.name} is now a regular user`
    )
  }

  const remove = async (u: AdminUser) => {
    const ok = await confirm(
      `Permanently delete ${u.name} (${u.email})? This cannot be undone. Accounts with bookings cannot be deleted — suspend those instead.`,
      'Delete'
    )
    if (!ok) return

    run(u.id, () => axios.delete(`/admin/users/${u.id}`), `${u.name} deleted`)
  }

  const submitCredits = async (u: AdminUser) => {
    const amount = Number(creditAmount.trim())
    if (!Number.isInteger(amount) || amount === 0) {
      notify('Enter a non-zero whole number', 'error')
      return
    }
    if (!creditReason.trim()) {
      notify('A reason is required', 'error')
      return
    }

    await run(
      u.id,
      () => axios.post(`/admin/users/${u.id}/credits`, { amount, reason: creditReason.trim() }),
      `${amount > 0 ? 'Granted' : 'Deducted'} ${Math.abs(amount)} credits`
    )
    closeCredits()
  }

  const openCredits = (u: AdminUser) => {
    setCreditFor(creditFor === u.id ? null : u.id)
    setCreditAmount('')
    setCreditReason('')
  }

  const closeCredits = () => {
    setCreditFor(null)
    setCreditAmount('')
    setCreditReason('')
  }

  return (
    <div className="page-shell admin-page">
      <h1 className="admin-title">Administration</h1>
      <p className="admin-subtitle">
        {total} {total === 1 ? 'account' : 'accounts'} registered
      </p>

      <div className="admin-panel">
        <input
          type="search"
          className="admin-search"
          placeholder="Search by name or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <p className="admin-empty">Loading...</p>
        ) : users.length === 0 ? (
          <p className="admin-empty">No accounts match that search.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th className="admin-numeric">Credits</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  // The server refuses these on your own account; hiding the
                  // buttons says so before the request rather than after.
                  const isSelf = u.id === me?.id
                  const busy = busyId === u.id

                  return (
                    <Fragment key={u.id}>
                    <tr className={u.status === 'suspended' ? 'is-suspended' : undefined}>
                      <td>
                        {u.name}
                        {isSelf && <span className="admin-you">you</span>}
                        {u.college && <span className="admin-sub">{u.college}</span>}
                      </td>
                      <td className="admin-email">{u.email}</td>
                      <td>
                        <span className={`admin-tag admin-tag-${u.role}`}>{u.role}</span>
                      </td>
                      <td>
                        <span className={`admin-tag admin-tag-${u.status}`}>{u.status}</span>
                      </td>
                      <td className="admin-numeric">{u.creditBalance}</td>
                      <td>
                        <div className="admin-actions">
                          <button
                            type="button"
                            disabled={busy}
                            aria-expanded={creditFor === u.id}
                            onClick={() => openCredits(u)}
                          >
                            Credits
                          </button>

                          {!isSelf && (
                            <>
                              <button type="button" disabled={busy} onClick={() => toggleStatus(u)}>
                                {u.status === 'active' ? 'Suspend' : 'Reinstate'}
                              </button>
                              <button type="button" disabled={busy} onClick={() => toggleRole(u)}>
                                {u.role === 'admin' ? 'Demote' : 'Promote'}
                              </button>
                              <button
                                type="button"
                                className="admin-danger"
                                disabled={busy}
                                onClick={() => remove(u)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {creditFor === u.id && (
                      <tr className="admin-credit-row">
                        <td colSpan={6}>
                          <form
                            className="admin-credit-form"
                            onSubmit={(e) => { e.preventDefault(); submitCredits(u) }}
                          >
                            <label>
                              <span>Amount</span>
                              <input
                                type="number"
                                step="1"
                                value={creditAmount}
                                onChange={(e) => setCreditAmount(e.target.value)}
                                placeholder="5, or -5 to deduct"
                                autoFocus
                                required
                              />
                            </label>
                            <label className="admin-credit-reason">
                              <span>Reason</span>
                              <input
                                type="text"
                                value={creditReason}
                                onChange={(e) => setCreditReason(e.target.value)}
                                placeholder="Recorded in the ledger"
                                required
                              />
                            </label>
                            <button type="submit" disabled={busy}>Apply</button>
                            <button type="button" onClick={closeCredits}>Cancel</button>
                          </form>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {(page > 1 || hasMore) && (
          <div className="admin-pager">
            <button type="button" disabled={page <= 1 || loading} onClick={() => load(page - 1, query)}>
              Previous
            </button>
            <span>Page {page}</span>
            <button type="button" disabled={!hasMore || loading} onClick={() => load(page + 1, query)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
