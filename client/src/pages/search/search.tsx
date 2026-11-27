import { useState } from 'react'
import { View, Text, Input, Image, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { searchItems, resolveImg } from '../../services/api'
import type { SearchItem } from '../../services/api'

import './search.scss'

const HISTORY_KEY = 'search_history'
const HISTORY_MAX = 10

/**
 * Split a highlighted title ("Blue <em>Denim</em> Jeans") into styled parts:
 * fragments wrapped in <em> get the .hit class, the rest render as plain text
 */
function renderTitle(title: string, highlight?: string) {
  const src = highlight || title
  return src.split(/(<em>.*?<\/em>)/g).map((part, i) => {
    if (part.startsWith('<em>')) {
      return (
        <Text key={i} className='hit'>
          {part.slice(4, -5)}
        </Text>
      )
    }
    return <Text key={i}>{part}</Text>
  })
}

export default function Search() {
  const [keyword, setKeyword] = useState('')
  // Search history, persisted in local storage (dedup, newest first, capped)
  const [history, setHistory] = useState<string[]>(() => Taro.getStorageSync(HISTORY_KEY) || [])
  // null = not searched yet (show history); [] = searched but no results
  const [results, setResults] = useState<SearchItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  const doSearch = async (kw: string) => {
    const q = kw.trim()
    if (!q) return
    setKeyword(q)
    setLoading(true)
    try {
      const res = await searchItems(q)
      setResults(res.items)
      // Persist history: dedupe, newest first, capped
      const next = [q, ...history.filter((h) => h !== q)].slice(0, HISTORY_MAX)
      setHistory(next)
      Taro.setStorageSync(HISTORY_KEY, next)
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || 'Search failed', icon: 'none' })
    } finally {
      setLoading(false)
    }
  }

  const clearInput = () => {
    setKeyword('')
    setResults(null)
  }

  const clearHistory = () => {
    setHistory([])
    Taro.removeStorageSync(HISTORY_KEY)
  }

  const goDetail = (item: SearchItem) => {
    Taro.navigateTo({ url: `/pages/detail/detail?id=${item.id}` })
  }

  return (
    <View className='page'>
      {/* Search row: input + clear button + Search action */}
      <View className='search-row'>
        <View className='input-wrap'>
          <Input
            className='input'
            value={keyword}
            placeholder='Search items'
            confirmType='search'
            focus
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={() => doSearch(keyword)}
          />
          {keyword !== '' && (
            <Text className='clear' onClick={clearInput}>
              ×
            </Text>
          )}
        </View>
        <Text className='search-btn' onClick={() => doSearch(keyword)}>
          Search
        </Text>
      </View>

      {/* Wrapper constrains the ScrollView height: WeChat ScrollView ignores flex:1 */}
      <View className='body-wrap'>
        <ScrollView
          className='body'
          scrollY
          enhanced
          showScrollbar={false}
          bounces={false}
        >
        {/* Recent searches: shown before the first search */}
        {results === null && (
          <View className='section'>
            <View className='section-head'>
              <Text className='section-title'>Recent searches</Text>
              {history.length > 0 && (
                <Text className='section-clear' onClick={clearHistory}>
                  Clear
                </Text>
              )}
            </View>
            <View className='tags'>
              {history.length === 0 && <Text className='empty'>No search history yet</Text>}
              {history.map((h) => (
                <Text key={h} className='tag' onClick={() => doSearch(h)}>
                  {h}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* Results */}
        {results !== null && (
          <View className='section'>
            {loading && <Text className='empty'>Searching...</Text>}
            {!loading && results.length === 0 && (
              <Text className='empty'>No results for "{keyword}"</Text>
            )}
            {!loading &&
              results.map((item) => (
                <View key={item.id} className='result' onClick={() => goDetail(item)}>
                  <Image className='result-img' src={resolveImg(item.image)} mode='aspectFill' />
                  <View className='result-info'>
                    <Text className='result-title'>
                      {renderTitle(item.title, item.highlight)}
                    </Text>
                    <Text className='result-cat'>{item.category}</Text>
                  </View>
                </View>
              ))}
          </View>
        )}
        </ScrollView>
      </View>
    </View>
  )
}
