import { useRef, useState } from 'react'
import { View, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ensureLogin, fetchHistory, resolveImg, type HistoryRecord } from '../../services/api'

import './history.scss'

// Record with a known width/height ratio
type RecordWithRatio = HistoryRecord & { ratio: number }

export default function History() {
  const [records, setRecords] = useState<RecordWithRatio[]>([])
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  // Image URL shown in the fullscreen preview
  const [previewUrl, setPreviewUrl] = useState<string>('')

  // Cache each result image's aspect ratio so refreshing needs no re-fetch
  const ratioCache = useRef<Map<string, number>>(new Map())

  useDidShow(() => {
    loadHistory()
  })

  const loadHistory = async () => {
    // Silent refresh when data already exists, to avoid list flicker when returning to this page
    if (records.length === 0) {
      setLoading(true)
    }
    try {
      await ensureLogin()
      setLoggedOut(false)
      const list = (await fetchHistory()).filter((r) => r.status === 'SUCCESS' && r.resultImg)

      // Read each result image's aspect ratio (with caching) to fix the image height and avoid layout jumps on load
      const withRatio: RecordWithRatio[] = []
      for (const record of list) {
        const url = resolveImg(record.resultImg)
        let ratio = ratioCache.current.get(url)
        if (!ratio) {
          try {
            const info = await Taro.getImageInfo({ src: url })
            ratio = info.height / info.width
          } catch {
            ratio = 1
          }
          ratioCache.current.set(url, ratio)
        }
        withRatio.push({ ...record, ratio })
      }
      setRecords(withRatio)
    } catch {
      setLoggedOut(true)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  // Tap an item: open the in-page fullscreen preview
  const preview = (record: RecordWithRatio) => {
    const url = resolveImg(record.resultImg)
    if (!url) return
    setPreviewUrl(url)
  }

  return (
    <View className='page'>
      {loading && <View className='loading'>Loading...</View>}

      {!loading && loggedOut && (
        <View className='empty'>
          Please log in to view your try-on history
          {'\n'}(tap Try On on the home page or Log in on the Me page)
        </View>
      )}

      {!loading && !loggedOut && records.length === 0 && (
        <View className='empty'>No try-on records yet — try one on the home page</View>
      )}

      {!loading && records.length > 0 && (
        <View className='grid'>
          {records.map((record) => (
            <View key={record.id} className='card' onClick={() => preview(record)}>
              {/* Height is fixed from the known aspect ratio to avoid widthFix jumping from small to large on load */}
              <Image
                className='result-img'
                src={resolveImg(record.resultImg)}
                style={{ height: `${Math.round(339 * record.ratio)}px` }}
                mode='aspectFill'
              />
              <View className='title'>{record.item?.title}</View>
              <View className='time'>{record.createdAt.slice(0, 10)}</View>
            </View>
          ))}
        </View>
      )}

      {/* Fullscreen preview overlay: tap anywhere to close */}
      {previewUrl && (
        <View className='preview-mask' catchMove onClick={() => setPreviewUrl('')}>
          <Image className='preview-img' src={previewUrl} mode='aspectFit' />
          <View className='preview-tip'>Tap anywhere to close</View>
        </View>
      )}
    </View>
  )
}
