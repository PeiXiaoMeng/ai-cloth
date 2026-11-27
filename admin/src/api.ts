/** Admin API wrapper: auth session (token valid for 7 days) + unified request */

const TOKEN_KEY = 'admin_token'
const TOKEN_EXP_KEY = 'admin_token_exp'
const TOKEN_TTL = 7 * 24 * 3600 * 1000 // 7 days

export interface AdminItem {
  id: number
  title: string
  image: string
  category: string // 上衣 (tops) / 裤子 (bottoms)
  isNew: boolean
  sort: number
  createdAt: string
}

export interface QuotaInfo {
  tryOnLimit: number
  tryOnUsed: number
  quotaBonus: number
  tryOnLeft: number
}

export interface AdminUser {
  id: number
  openid: string
  createdAt: string
  tryOnLimit: number
  tryOnUsed: number
  quotaBonus: number
  tryOnLeft: number
}

export function getToken(): string {
  const exp = Number(localStorage.getItem(TOKEN_EXP_KEY) || 0)
  if (exp && Date.now() > exp) {
    clearToken()
    return ''
  }
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + TOKEN_TTL))
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXP_KEY)
}

/** Unified request: attaches the token automatically, clears it and returns to login on 401 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(path, { ...options, headers })
  if (res.status === 401) {
    clearToken()
    window.location.hash = ''
    throw new Error('Session expired, please log in again')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `Request failed (${res.status})`)
  }
  return data as T
}

/** Login */
export async function login(username: string, password: string) {
  const data = await request<{ token: string }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  saveToken(data.token)
}

/** Item list */
export function fetchItems(): Promise<AdminItem[]> {
  return request<AdminItem[]>('/admin/items')
}

/** Create an item */
export function createItem(form: { title: string; category: string; file: File }) {
  const fd = new FormData()
  fd.append('title', form.title)
  fd.append('category', form.category)
  fd.append('file', form.file)
  return request<AdminItem>('/admin/items', { method: 'POST', body: fd })
}

/** Update an item (image optional) */
export function updateItem(
  id: number,
  form: { title?: string; category?: string; file?: File | null },
) {
  const fd = new FormData()
  if (form.title !== undefined) fd.append('title', form.title)
  if (form.category !== undefined) fd.append('category', form.category)
  if (form.file) fd.append('file', form.file)
  return request<AdminItem>(`/admin/items/${id}`, { method: 'PUT', body: fd })
}

/** Delete an item */
export function deleteItem(id: number): Promise<{ ok: boolean }> {
  return request(`/admin/items/${id}`, { method: 'DELETE' })
}

/** Rebuild the Elasticsearch search index from the database (fallback for sync drift) */
export function reindexItems(): Promise<{ indexed: number; took: number; index: string }> {
  return request('/admin/items/reindex', { method: 'POST' })
}

/** User list */
export function fetchUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>('/admin/users')
}

/** Adjust a user's try-on quota (delta: positive to add, negative to subtract) */
export function adjustQuota(id: number, delta: number): Promise<QuotaInfo> {
  return request<QuotaInfo>(`/admin/users/${id}/quota`, {
    method: 'POST',
    body: JSON.stringify({ delta }),
  })
}
