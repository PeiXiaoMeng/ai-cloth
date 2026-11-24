import { useEffect, useRef, useState } from 'react'
import { View, Image, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { fetchItems, resolveImg } from '../../services/api'
import type { ClothingItem } from '../../../types'

import './index.scss'

// Item with a known width/height ratio
type ItemWithRatio = ClothingItem & { ratio: number }

// Top tabs
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'clothes', label: 'Tops' },
  { key: 'pants', label: 'Bottoms' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function Index() {
  const [items, setItems] = useState<ItemWithRatio[]>([])
  const [tab, setTab] = useState<TabKey>('all')
  // Independent two-column waterfall data per tab
  const [columnsByTab, setColumnsByTab] = useState<Record<TabKey, ItemWithRatio[][]>>({
    all: [[], []],
    new: [[], []],
    clothes: [[], []],
    pants: [[], []],
  })
  const [loading, setLoading] = useState(true)

  // Cache each image's aspect ratio so switching tabs needs no re-fetch
  const ratioCache = useRef<Map<number, number>>(new Map())

  // Load only on first mount; returning to the home page does not re-fetch, avoiding flicker entirely
  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadItems = async () => {
    try {
      // Silent refresh when data already exists, to avoid list flicker when returning home
      if (items.length === 0) {
        setLoading(true)
      }
      const list = (await fetchItems()) || []

      // Read each image's aspect ratio (with caching)
      const withRatio: ItemWithRatio[] = []
      for (const item of list) {
        let ratio = ratioCache.current.get(item.id) ?? 1
        if (!ratioCache.current.has(item.id)) {
          try {
            const info = await Taro.getImageInfo({ src: resolveImg(item.image) })
            ratio = info.height / info.width
          } catch {
            // Fall back to 1:1 when the size is unavailable
          }
          ratioCache.current.set(item.id, ratio)
        }
        withRatio.push({ ...item, ratio })
      }
      setItems(withRatio)
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || 'Failed to load', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // When the data changes, filter and distribute items into two waterfall columns per tab
  useEffect(() => {
    const build = (key: TabKey): ItemWithRatio[][] => {
      const filtered = items.filter((item) => {
        if (key === 'new') return item.isNew
        if (key === 'clothes') return item.category === '上衣'
        if (key === 'pants') return item.category === '裤子'
        return true
      })
      // Assign to the shorter column first to build the waterfall layout
      const cols: ItemWithRatio[][] = [[], []]
      const colHeights = [0, 0]
      for (const item of filtered) {
        const idx = colHeights[0] <= colHeights[1] ? 0 : 1
        cols[idx].push(item)
        colHeights[idx] += item.ratio
      }
      return cols
    }
    setColumnsByTab({
      all: build('all'),
      new: build('new'),
      clothes: build('clothes'),
      pants: build('pants'),
    })
  }, [items])

  const goDetail = (item: ItemWithRatio) => {
    Taro.navigateTo({ url: `/pages/detail/detail?id=${item.id}` })
  }

  const columns = columnsByTab[tab]
  const visibleCount = columns[0].length + columns[1].length

  return (
    <View className='page'>
      {/* Top tabs: fixed */}
      <View className='header'>
        <View className='tabs'>
          {TABS.map((t) => (
            <View
              key={t.key}
              className={`tab ${tab === t.key ? 'tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </View>
          ))}
        </View>
      </View>

      {/* Item area: one stacked ScrollView per tab, toggled via visibility to keep each scroll position */}
      <View className='content-wrap'>
        {TABS.map((t) => {
          const cols = columnsByTab[t.key]
          const count = cols[0].length + cols[1].length
          return (
          <ScrollView
            key={t.key}
            className='content'
            style={{ visibility: tab === t.key ? 'visible' : 'hidden' }}
            scrollY
            enhanced
            showScrollbar={false}
          >
            <View className='grid'>
              {cols.map((col, colIdx) => (
                <View className='column' key={colIdx}>
                  {col.map((item) => (
                    <View key={item.id} className='card' onClick={() => goDetail(item)}>
                      <View className='img-wrap'>
                        <Image className='img' src={resolveImg(item.image)} mode='widthFix' />
                        {item.badge && <Text className='badge'>{item.badge}</Text>}
                      </View>
                      <View className='title'>{item.title}</View>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            {!loading && count === 0 && <View className='empty'>No items in this category</View>}
          </ScrollView>
          )
        })}
      </View>
    </View>
  )
}
