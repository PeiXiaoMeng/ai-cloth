/**
 * Global type definitions
 */

// Clothing item
export interface ClothingItem {
  id: number
  title: string
  image: string
  badge: string
  /** Category: 上衣 (tops) / 裤子 (bottoms) */
  category: string
  /** Whether it is a new arrival ("New" tab) */
  isNew: boolean
  sort: number
  createdAt: string
}

// User try-on quota
export interface TryOnQuota {
  tryOnLimit: number
  tryOnUsed: number
  tryOnLeft: number
}

// Try-on record
export interface TryOnRecord extends TryOnQuota {
  id: number
  userId: number
  itemId: number
  status: string
  inputImg: string | null
  resultImg: string | null
  createdAt: string
}
