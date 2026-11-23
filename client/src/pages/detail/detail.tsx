import { useRef, useState } from 'react'
import { View, Image, Text, Button, ScrollView } from '@tarojs/components'
import Taro, { useRouter, useDidShow } from '@tarojs/taro'
import {
  clearToken,
  ensureLogin,
  fetchItemDetail,
  fetchQuota,
  resolveImg,
  uploadAndTryOn,
} from '../../services/api'
import QuotaPoster from '../../components/QuotaPoster'
import type { ClothingItem, TryOnQuota } from '../../../types'

import './detail.scss'

export default function Detail() {
  const router = useRouter()
  const itemId = router.params.id

  const [item, setItem] = useState<ClothingItem | null>(null)
  const [quota, setQuota] = useState<TryOnQuota | null>(null)
  const [photo, setPhoto] = useState<string>('')
  const [resultImg, setResultImg] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  // 结果图全屏预览
  const [previewVisible, setPreviewVisible] = useState(false)
  // 试穿次数用尽海报
  const [showQuotaPoster, setShowQuotaPoster] = useState(false)

  // 页面本身不滚动，内容在 ScrollView 里滚动；
  // 试穿成功后通过 scrollTop 把内容区滚到底部
  const [svScrollTop, setSvScrollTop] = useState(0)
  const svCounter = useRef(0)

  // 记录 ScrollView 实时滚动位置，弹层关闭后强制恢复
  const svPosRef = useRef(0)
  const restoreSv = () => {
    const target = svPosRef.current
    const apply = () =>
      setSvScrollTop((prev) => (prev === target ? target + 0.01 : target))
    apply()
    setTimeout(apply, 150)
    setTimeout(apply, 400)
  }

  useDidShow(() => {
    console.log('======show')
    loadDetail()
    loadQuota()
  })

  const loadDetail = async () => {
    if (!itemId) return
    try {
      setItem(await fetchItemDetail(itemId))
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
    }
  }

  const loadQuota = async () => {
    try {
      setQuota(await fetchQuota())
    } catch {
      // 未登录时不展示额度
      setQuota(null)
    }
  }

  // 选择照片
  const choosePhoto = () => {
    Taro.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        setPhoto(res.tempFilePaths[0])
        setResultImg('')
      },
    })
  }

  // 点击试穿按钮：先登录 -> 校验额度 -> 校验照片 -> 上传并调用试穿
  const handleTryOn = async () => {
    if (submitting) return

    try {
      // 1. 先登录：无 token 走小程序静默登录；token 失效则清除后重新登录
      await Taro.showLoading({ title: '登录中...', mask: true })
      let q: TryOnQuota
      try {
        await ensureLogin()
        q = await fetchQuota()
      } catch {
        clearToken()
        await ensureLogin()
        q = await fetchQuota()
      }
      Taro.hideLoading()
      setQuota(q)

      // 2. 校验剩余次数
      if (q.tryOnLeft <= 0) {
        Taro.hideLoading()
        setShowQuotaPoster(true)
        return
      }
    } catch (e) {
      Taro.hideLoading()
      Taro.showToast({ title: (e as Error).message || '登录失败', icon: 'none' })
      return
    }

    // 3. 校验照片
    if (!photo) {
      Taro.showToast({ title: '请先上传一张自己的照片', icon: 'none' })
      return
    }

    // 4. 上传照片并试穿（若登录态在请求间失效，重新登录后重试一次）
    setSubmitting(true)
    Taro.showLoading({ title: '试穿生成中，请稍候...', mask: true })
    try {
      let record
      try {
        record = await uploadAndTryOn(itemId, photo)
      } catch (e) {
        const msg = (e as Error).message || ''
        if (msg.includes('登录')) {
          clearToken()
          await ensureLogin()
          record = await uploadAndTryOn(itemId, photo)
        } else {
          throw e
        }
      }
      setResultImg(resolveImg(record.resultImg))
      setQuota({
        tryOnLimit: record.tryOnLimit,
        tryOnUsed: record.tryOnUsed,
        tryOnLeft: record.tryOnLeft,
      })
      Taro.showToast({ title: '试穿成功', icon: 'success' })
      // 自动滚动到底部，让用户直接看到试穿效果（每次用递增的值确保触发滚动）
      svCounter.current += 1
      setSvScrollTop(1000000 + svCounter.current * 100)
    } catch (e) {
      Taro.hideLoading()
      const msg = (e as Error).message || '试穿失败'
      if (msg.includes('请联系管理员')) {
        setShowQuotaPoster(true)
      } else {
        Taro.showModal({ title: '试穿失败', content: msg, showCancel: false })
      }
      loadQuota()
      return
    }
    Taro.hideLoading()
    setSubmitting(false)
  }

  const previewResult = () => {
    if (!resultImg) return
    // Taro.previewImage 在游客 appid 下受限，改用页面内全屏预览层
    setPreviewVisible(true)
  }

  // 跳转试穿记录：redirectTo 替换当前详情页，返回时直接回到首页
  const goHistory = () => {
    Taro.redirectTo({ url: '/pages/history/history' })
  }

  return (
    <View className='page'>
      {/* 内容区：独立滚动，页面本身 fixed 高度不滚动，弹层显隐不会影响滚动位置 */}
      <ScrollView
        className='page-scroll'
        scrollY
        enhanced
        showScrollbar={false}
        scrollTop={svScrollTop}
        scrollWithAnimation
        onScroll={(e) => {
          svPosRef.current = e.detail.scrollTop
        }}
      >
        {item && (
          <View className='header'>
            <Image className='item-img' src={resolveImg(item.image)} mode='widthFix' />
            <View className='item-title'>{item.title}</View>
          </View>
        )}

        <View className='section'>
          <View className='section-title'>1. 上传你的照片</View>
          <View className='photo-area'>
            {photo ? (
              <Image className='photo' src={photo} mode='aspectFill' onClick={choosePhoto} />
            ) : (
              <View className='photo-placeholder' onClick={choosePhoto}>
                <Text className='plus'>+</Text>
                <Text className='tip'>上传一张自己的照片</Text>
              </View>
            )}
          </View>
        </View>

        <View className='section'>
          <View className='section-title'>2. AI 试穿</View>
          {quota && (
            <View className='quota'>
              剩余试穿次数：
              <Text className='quota-num'>{quota.tryOnLeft}</Text>
              / {quota.tryOnLimit}
            </View>
          )}
          <Button className='tryon-btn' disabled={submitting} onClick={handleTryOn}>
            试 穿
          </Button>
        </View>

        {resultImg && (
          <View className='section'>
            <View className='result-header'>
              <View className='section-title'>试穿结果</View>
              <View className='history-link' onClick={goHistory}>
                试穿记录 ›
              </View>
            </View>
            <Image
              className='result'
              src={resultImg}
              mode='aspectFit'
              onClick={previewResult}
            />
            <View className='result-tip'>点击图片可放大查看</View>
          </View>
        )}
      </ScrollView>

      {/* 结果图全屏预览层：点击任意位置关闭 */}
      {previewVisible && (
        <View className='preview-mask' catchMove onClick={() => {
          setPreviewVisible(false)
          restoreSv()
        }}>
          <Image className='preview-img' src={resultImg} mode='aspectFit' />
          <View className='preview-tip'>点击任意位置关闭</View>
        </View>
      )}

      {/* 试穿次数用尽海报 */}
      <QuotaPoster visible={showQuotaPoster} onClose={() => {
        setShowQuotaPoster(false)
        restoreSv()
      }} />
    </View>
  )
}
