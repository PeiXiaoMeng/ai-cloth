import { useRef, useState } from 'react'
import { View, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ensureLogin, fetchHistory, resolveImg, type HistoryRecord } from '../../services/api'

import './history.scss'

// 带宽高比的记录
type RecordWithRatio = HistoryRecord & { ratio: number }

export default function History() {
  const [records, setRecords] = useState<RecordWithRatio[]>([])
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  // 全屏预览的图片地址
  const [previewUrl, setPreviewUrl] = useState<string>('')

  // 缓存每张结果图的宽高比，刷新时无需重新请求
  const ratioCache = useRef<Map<string, number>>(new Map())

  useDidShow(() => {
    loadHistory()
  })

  const loadHistory = async () => {
    // 已有数据时静默刷新，避免返回本页时列表闪烁
    if (records.length === 0) {
      setLoading(true)
    }
    try {
      await ensureLogin()
      setLoggedOut(false)
      const list = (await fetchHistory()).filter((r) => r.status === 'SUCCESS' && r.resultImg)

      // 读取每张结果图的宽高比（带缓存），用于固定图片高度、避免加载跳动
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

  // 点击 item：打开页面内全屏预览
  const preview = (record: RecordWithRatio) => {
    const url = resolveImg(record.resultImg)
    if (!url) return
    setPreviewUrl(url)
  }

  return (
    <View className='page'>
      {loading && <View className='loading'>加载中...</View>}

      {!loading && loggedOut && (
        <View className='empty'>
          请先登录后查看试穿记录
          {'\n'}（在首页或“我的”页面点击试穿/登录即可）
        </View>
      )}

      {!loading && !loggedOut && records.length === 0 && (
        <View className='empty'>暂无试穿记录，去首页试试试穿吧</View>
      )}

      {!loading && records.length > 0 && (
        <View className='grid'>
          {records.map((record) => (
            <View key={record.id} className='card' onClick={() => preview(record)}>
              {/* 高度按已知宽高比写死，避免 widthFix 加载后从小到大跳动 */}
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

      {/* 全屏预览层：点击任意位置关闭 */}
      {previewUrl && (
        <View className='preview-mask' catchMove onClick={() => setPreviewUrl('')}>
          <Image className='preview-img' src={previewUrl} mode='aspectFit' />
          <View className='preview-tip'>点击任意位置关闭</View>
        </View>
      )}
    </View>
  )
}
