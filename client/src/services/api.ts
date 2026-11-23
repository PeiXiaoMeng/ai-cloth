import Taro from '@tarojs/taro'
import type { ClothingItem, TryOnQuota } from '../../types'

/** 服务端地址：真机调试请改成电脑的局域网 IP，如 http://192.168.1.100:3000 */
export const BASE_URL = 'http://localhost:3000'

const TOKEN_KEY = 'ai_cloth_token'

export function getToken(): string {
  return Taro.getStorageSync(TOKEN_KEY) || ''
}

export function clearToken() {
  Taro.removeStorageSync(TOKEN_KEY)
}

/** 统一请求封装，自动携带 token */
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
    throw new Error('请先登录')
  }
  if (res.statusCode >= 400) {
    throw new Error((res.data && res.data.message) || `请求失败 (${res.statusCode})`)
  }
  return res.data as T
}

/**
 * 确保已登录：无 token 时调用 Taro.login 获取 code，
 * 请求服务端 /auth/login 换取 JWT 并缓存
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
    throw new Error((res.data && res.data.message) || '登录失败')
  }

  const { token } = res.data as { token: string }
  Taro.setStorageSync(TOKEN_KEY, token)
  return token
}

/** 图片地址：服务端返回相对路径时补全为完整 URL */
export function resolveImg(url: string | null | undefined): string {
  if (!url) return ''
  return url.startsWith('http') ? url : `https://copilot-antivirus-scoreless.ngrok-free.dev${url}`
}

/** 获取商品列表 */
export function fetchItems(): Promise<ClothingItem[]> {
  return request<ClothingItem[]>('/items')
}

/** 获取商品详情 */
export function fetchItemDetail(id: string | number): Promise<ClothingItem> {
  return request<ClothingItem>(`/items/${id}`)
}

/** 查询我的试穿剩余次数 */
export function fetchQuota(): Promise<TryOnQuota> {
  return request<TryOnQuota>('/try-on/quota')
}

/** 上传照片并试穿（同步返回结果） */
export function uploadAndTryOn(
  itemId: string | number,
  filePath: string,
): Promise<TryOnQuota & { id: number; resultImg: string | null }> {
  return new Promise((resolve, reject) => {
    Taro.uploadFile({
      url: `${BASE_URL}/try-on/${itemId}`,
      filePath,
      name: 'file',
      timeout: 180000,
      header: {
        Authorization: `Bearer ${getToken()}`,
      },
      success: (res) => {
        if (res.statusCode === 403) {
          reject(new Error('您的试穿次数已用完，请联系管理员'))
          return
        }
        if (res.statusCode >= 400) {
          let msg = `试穿失败 (${res.statusCode})`
          try {
            const data = JSON.parse(res.data)
            msg = data.message || msg
          } catch {
            // 保留默认提示
          }
          reject(new Error(msg))
          return
        }
        try {
          resolve(JSON.parse(res.data))
        } catch {
          reject(new Error('返回数据解析失败'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '上传失败')),
    })
  })
}

/** 试穿历史记录 */
export interface HistoryRecord {
  id: number
  itemId: number
  status: string
  resultImg: string | null
  createdAt: string
  item: { title: string; image: string }
}

/** 获取我的试穿历史 */
export function fetchHistory(): Promise<HistoryRecord[]> {
  return request<HistoryRecord[]>('/try-on/history')
}
