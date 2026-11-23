import { useState } from 'react'
import { View, Text, Button, Image } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { ensureLogin, fetchQuota, getToken } from '../../services/api'
import historyIcon from '../../assets/content/history.png'
import customIcon from '../../assets/content/custom.png'
import type { TryOnQuota } from '../../../types'

import './mine.scss'

export default function Mine() {
  const [quota, setQuota] = useState<TryOnQuota | null>(null)

  useDidShow(() => {
    loadQuota()
  })

  const loadQuota = async () => {
    if (!getToken()) {
      setQuota(null)
      return
    }
    try {
      setQuota(await fetchQuota())
    } catch {
      setQuota(null)
    }
  }

  // 登录（获取剩余次数需要登录态）
  const handleLogin = async () => {
    try {
      await ensureLogin()
      await loadQuota()
      Taro.showToast({ title: '登录成功', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '登录失败', icon: 'none' })
    }
  }

  const goHistory = () => {
    Taro.navigateTo({ url: '/pages/history/history' })
  }

  return (
    <View className='page'>
      {/* 用户信息卡片 */}
      <View className='user-card'>
        <View className='avatar'>衣</View>
        <View className='user-info'>
          {quota ? (
            <>
              <View className='user-name'>已登录</View>
              <View className='user-sub'>
                剩余试穿次数：
                <Text className='quota-num'>{quota.tryOnLeft}</Text>
                / {quota.tryOnLimit}
              </View>
            </>
          ) : (
            <>
              <View className='user-name'>未登录</View>
              <Button className='login-btn' size='mini' onClick={handleLogin}>
                点击登录
              </Button>
            </>
          )}
        </View>
      </View>

      {/* 功能栏目 */}
      <View className='menu'>
        <View className='menu-item' onClick={goHistory}>
          <Image className='menu-icon' src={historyIcon} mode='aspectFit' />
          <Text className='menu-label'>试穿记录</Text>
          <Text className='arrow'>›</Text>
        </View>

        <Button className='menu-item menu-item-btn' openType='contact'>
          <Image className='menu-icon' src={customIcon} mode='aspectFit' />
          <Text className='menu-label'>联系客服</Text>
          <Text className='arrow'>›</Text>
        </Button>
      </View>
    </View>
  )
}
