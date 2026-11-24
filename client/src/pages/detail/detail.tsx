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
  // Fullscreen preview of the result image
  const [previewVisible, setPreviewVisible] = useState(false)
  // Poster shown when the try-on quota is exhausted
  const [showQuotaPoster, setShowQuotaPoster] = useState(false)

  // The page itself does not scroll; content scrolls inside a ScrollView.
  // After a successful try-on, scroll the content to the bottom via scrollTop
  const [svScrollTop, setSvScrollTop] = useState(0)
  const svCounter = useRef(0)

  // Track the ScrollView's live scroll position and force-restore it after overlays close
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
      Taro.showToast({ title: (e as Error).message || 'Failed to load', icon: 'none' })
    }
  }

  const loadQuota = async () => {
    try {
      setQuota(await fetchQuota())
    } catch {
      // Do not show quota when not logged in
      setQuota(null)
    }
  }

  // Pick a photo
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

  // Try-on button: login first -> check quota -> check photo -> upload and call try-on
  const handleTryOn = async () => {
    if (submitting) return

    try {
      // 1. Login first: silent mini-program login when no token; re-login after clearing an expired token
      await Taro.showLoading({ title: 'Logging in...', mask: true })
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

      // 2. Check remaining quota
      if (q.tryOnLeft <= 0) {
        Taro.hideLoading()
        setShowQuotaPoster(true)
        return
      }
    } catch (e) {
      Taro.hideLoading()
      Taro.showToast({ title: (e as Error).message || 'Login failed', icon: 'none' })
      return
    }

    // 3. Check the photo
    if (!photo) {
      Taro.showToast({ title: 'Please upload a photo of yourself first', icon: 'none' })
      return
    }

    // 4. Upload the photo and try on (retry once after re-login if the session expired between requests)
    setSubmitting(true)
    Taro.showLoading({ title: 'Generating try-on, please wait...', mask: true })
    try {
      let record
      try {
        record = await uploadAndTryOn(itemId, photo)
      } catch (e) {
        const msg = ((e as Error).message || '').toLowerCase()
        if (msg.includes('log in')) {
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
      Taro.showToast({ title: 'Try-on successful', icon: 'success' })
      // Auto-scroll to the bottom so the user sees the result immediately (incrementing value ensures the scroll triggers)
      svCounter.current += 1
      setSvScrollTop(1000000 + svCounter.current * 100)
    } catch (e) {
      Taro.hideLoading()
      const msg = ((e as Error).message || '').toLowerCase()
      if (msg.includes('contact the administrator')) {
        setShowQuotaPoster(true)
      } else {
        Taro.showModal({ title: 'Try-on failed', content: (e as Error).message || 'Try-on failed', showCancel: false })
      }
      loadQuota()
      return
    }
    Taro.hideLoading()
    setSubmitting(false)
  }

  const previewResult = () => {
    if (!resultImg) return
    // Taro.previewImage is restricted under a guest appid, so use an in-page fullscreen preview instead
    setPreviewVisible(true)
  }

  // Navigate to try-on history: redirectTo replaces the current detail page, so "back" goes to the home page
  const goHistory = () => {
    Taro.redirectTo({ url: '/pages/history/history' })
  }

  return (
    <View className='page'>
      {/* Content area: independent scrolling; the page is fixed-height and does not scroll,
          so showing/hiding overlays never disturbs the scroll position */}
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
          <View className='section-title'>1. Upload your photo</View>
          <View className='photo-area'>
            {photo ? (
              <Image className='photo' src={photo} mode='aspectFill' onClick={choosePhoto} />
            ) : (
              <View className='photo-placeholder' onClick={choosePhoto}>
                <Text className='plus'>+</Text>
                <Text className='tip'>Upload a photo of yourself</Text>
              </View>
            )}
          </View>
        </View>

        <View className='section'>
          <View className='section-title'>2. AI try-on</View>
          {quota && (
            <View className='quota'>
              Remaining try-on quota:&nbsp;
              <Text className='quota-num'>{quota.tryOnLeft}</Text>
              &nbsp;/ {quota.tryOnLimit}
            </View>
          )}
          <Button className='tryon-btn' disabled={submitting} onClick={handleTryOn}>
            Try On
          </Button>
        </View>

        {resultImg && (
          <View className='section'>
            <View className='result-header'>
              <View className='section-title'>Result</View>
              <View className='history-link' onClick={goHistory}>
                History ›
              </View>
            </View>
            <Image
              className='result'
              src={resultImg}
              mode='aspectFit'
              onClick={previewResult}
            />
            <View className='result-tip'>Tap the image to zoom in</View>
          </View>
        )}
      </ScrollView>

      {/* Fullscreen preview overlay for the result image: tap anywhere to close */}
      {previewVisible && (
        <View className='preview-mask' catchMove onClick={() => {
          setPreviewVisible(false)
          restoreSv()
        }}>
          <Image className='preview-img' src={resultImg} mode='aspectFit' />
          <View className='preview-tip'>Tap anywhere to close</View>
        </View>
      )}

      {/* Poster shown when the try-on quota is exhausted */}
      <QuotaPoster visible={showQuotaPoster} onClose={() => {
        setShowQuotaPoster(false)
        restoreSv()
      }} />
    </View>
  )
}
