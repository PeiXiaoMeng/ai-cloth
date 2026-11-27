import Taro from '@tarojs/taro'
import type { ClothingItem, TryOnQuota } from '../../types'

/** Server base URL: for real-device debugging, use your computer's LAN IP, e.g. http://192.168.1.100:3000 */
export const BASE_URL = 'http://localhost:3000'

const TOKEN_KEY = 'ai_cloth_token'

export function getToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY)
}

/** Unified request wrapper that attaches the token automatically */
export async function request<T = any>(url: string, options: Partial<Taro.request.Option> = {}): Promise<T> {
  const res = await Taro.request({
    url: `${BASE_URL}${url}`,
    method: 'GET',
    ...options,
    header: {
      Authorization: `Bearer ${getToken()}`,
      ...(options.header || {}),
    },
  })

  if (res.statusCode === 401) {
    clearToken()
    throw new Error('Please log in first')
  }
  if (res.statusCode >= 400) {
    throw new Error((res.data && res.data.message) || `Request failed (${res.statusCode})`)
  }
  return res.data as T
}

/**
 * Ensure the user is logged in: when no token exists, call Taro.login to get a code,
 * exchange it for a JWT via the server /auth/login endpoint, and cache it
 */
export async function ensureLogin(): Promise<string> {
  if (getToken()) return getToken()

  const { code } = await Taro.login()
  const res = await Taro.request({
    url: `${BASE_URL}/auth/login`,
    method: 'POST',
    data: { code },
  })

  if (res.statusCode >= 400) {
    throw new Error((res.data && res.data.message) || 'Login failed')
  }

  const { token } = res.data as { token: string }
  Taro.setStorageSync(TOKEN_KEY, token)
  return token
}

/** Image URL: build the full URL when the server returns a relative path */
export function resolveImg(url: string | null | undefined): string {
  if (!url) return ''
  if (url.startsWith('http')) {
    // Only our own static assets are available locally; keep other remote URLs as-is
    const m = url.match(/^https?:\/\/[^/]+(\/static\/.*)$/)
    return m ? `${BASE_URL}${m[1]}` : url
  }
  return `${BASE_URL}${url}`
}

/** Fetch the item list */
export function fetchItems(): Promise<ClothingItem[]> {
  return request<ClothingItem[]>('/items')
}

/** Fetch item detail */
export function fetchItemDetail(id: string | number): Promise<ClothingItem> {
  return request<ClothingItem>(`/items/${id}`)
}

/** Fetch my remaining try-on quota */
export function fetchQuota(): Promise<TryOnQuota> {
  return request<TryOnQuota>('/try-on/quota')
}

/** Try-on task status payload returned by GET /try-on/task/:id */
export interface TryonTask {
  id: number
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED'
  resultImg: string | null
  errorMsg: string | null
  createdAt: string
}

/** Submit a photo for try-on: the server returns a taskId immediately; poll fetchTask for the result */
export function submitTryOn(
  itemId: string | number,
  filePath: string,
): Promise<TryOnQuota & { taskId: number; status: string }> {
  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: `${BASE_URL}/try-on/${itemId}`,
      filePath,
      name: 'file',
      // Only the upload is synchronous now; AI generation happens in the server's task queue
      timeout: 30000,
      header: {
        Authorization: `Bearer ${getToken()}`,
      },
      success: (res) => {
        if (res.statusCode === 403) {
          reject(new Error('Your try-on quota is exhausted, please contact the administrator'))
          return
        }
        if (res.statusCode >= 400) {
          let msg = `Try-on failed (${res.statusCode})`
          try {
            const data = JSON.parse(res.data)
            msg = data.message || msg
          } catch {
            // keep the default message
          }
          reject(new Error(msg))
          return
        }
        try {
          resolve(JSON.parse(res.data))
        } catch {
          reject(new Error('Failed to parse the response data'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg || 'Upload failed')),
    })
  })
}

/** Poll a try-on task's status by id */
export function fetchTask(taskId: number | string): Promise<TryonTask> {
  return request<TryonTask>(`/try-on/task/${taskId}`)
}

/** Try-on history record */
export interface HistoryRecord {
  id: number
  itemId: number
  status: string
  resultImg: string | null
  createdAt: string
  item: { title: string; image: string }
}

/** Fetch my try-on history */
export function fetchHistory(): Promise<HistoryRecord[]> {
  return request<HistoryRecord[]>('/try-on/history')
}

/** Search result item returned by GET /items/search (Elasticsearch) */
export interface SearchItem {
  id: number
  title: string
  category: string // Tops | Bottoms (already mapped by the sync layer)
  isNew: boolean
  image: string
  highlight?: string // title with <em>...</em> around the matched words
}

/** Search response payload */
export interface SearchResult {
  items: SearchItem[]
  total: number
  took: number
  available: boolean // false = Elasticsearch is down on the server
}

/** Full-text search across item titles */
export function searchItems(q: string): Promise<SearchResult> {
  return request<SearchResult>(`/items/search?q=${encodeURIComponent(q)}`)
}
