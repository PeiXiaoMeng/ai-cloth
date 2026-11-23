import { useEffect, useRef, useState } from 'react'
import { View, Image, Text, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { fetchItems, resolveImg } from '../../services/api'
import type { ClothingItem } from '../../../types'

import './index.scss'

// 带宽高比的商品
type ItemWithRatio = ClothingItem & { ratio: number }

// 顶部 tab
const TABS = [
  { key: 'all', label: '全部' },
  { key: 'new', label: '新上' },
  { key: 'clothes', label: '衣服' },
  { key: 'pants', label: '裤子' },
] as const

type TabKey = (typeof TABS)[number]['key']

export default function Index() {
  const [items, setItems] = useState<ItemWithRatio[]>([])
  const [tab, setTab] = useState<TabKey>('all')
  // 每个 tab 独立的两列瀑布流数据
  const [columnsByTab, setColumnsByTab] = useState<Record<TabKey, ItemWithRatio[][]>>({
    all: [[], []],
    new: [[], []],
    clothes: [[], []],
    pants: [[], []],
  })
  const [loading, setLoading] = useState(true)

  // 缓存每张图的宽高比，切 tab 时无需重新请求
  const ratioCache = useRef<Map<number, number>>(new Map())

  // 仅首次进入时加载；返回首页不重新请求接口，彻底避免闪烁
  useEffect(() => {
    loadItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadItems = async () => {
    try {
      // 已有数据时静默刷新，避免返回首页时列表闪烁
      if (items.length === 0) {
        setLoading(true)
      }
      const list = (await fetchItems()) || []

      // 读取每张图片的宽高比（带缓存）
      const withRatio: ItemWithRatio[] = []
      for (const item of list) {
        let ratio = ratioCache.current.get(item.id) ?? 1
        if (!ratioCache.current.has(item.id)) {
          try {
            const info = await Taro.getImageInfo({ src: resolveImg(item.image) })
            ratio = info.height / info.width
          } catch {
            // 取不到尺寸时按 1:1 处理
          }
          ratioCache.current.set(item.id, ratio)
        }
        withRatio.push({ ...item, ratio })
      }
      setItems(withRatio)
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  // 数据变化时，为每个 tab 筛选并分配瀑布流两列
  useEffect(() => {
    const build = (key: TabKey): ItemWithRatio[][] => {
      const filtered = items.filter((item) => {
        if (key === 'new') return item.isNew
        if (key === 'clothes') return item.category === '上衣'
        if (key === 'pants') return item.category === '裤子'
        return true
      })
      // 按“较矮的列优先”分配，实现瀑布流
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
      {/* 顶部 tab：固定不动 */}
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

      {/* 商品区：每个 tab 一个独立 ScrollView 叠放，切换 visibility，保留各自滚动位置 */}
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
            {!loading && count === 0 && <View className='empty'>该分类下暂无商品</View>}
          </ScrollView>
          )
        })}
      </View>
    </View>
  )
}
