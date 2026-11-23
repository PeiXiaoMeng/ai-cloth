/**
 * 全局类型定义
 */

// 衣服商品
export interface ClothingItem {
  id: number
  title: string
  image: string
  badge: string
  /** 分类：衣服 / 裤子 */
  category: string
  /** 是否新品（“新上”tab） */
  isNew: boolean
  sort: number
  createdAt: string
}

// 用户试穿额度
export interface TryOnQuota {
  tryOnLimit: number
  tryOnUsed: number
  tryOnLeft: number
}

// 试穿记录
export interface TryOnRecord extends TryOnQuota {
  id: number
  userId: number
  itemId: number
  status: string
  inputImg: string | null
  resultImg: string | null
  createdAt: string
}
