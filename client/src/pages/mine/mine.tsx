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

  // Login (fetching the remaining quota requires an auth session)
  const handleLogin = async () => {
    try {
      await ensureLogin()
      await loadQuota()
      Taro.showToast({ title: 'Login successful', icon: 'success' })
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || 'Login failed', icon: 'none' })
    }
  }

  const goHistory = () => {
    Taro.navigateTo({ url: '/pages/history/history' })
  }

  return (
    <View className='page'>
      {/* User info card */}
      <View className='user-card'>
        <View className='avatar'>衣</View>
        <View className='user-info'>
          {quota ? (
            <>
              <View className='user-name'>Logged in</View>
              <View className='user-sub'>
                Remaining try-on quota:&nbsp;
                <Text className='quota-num'>{quota.tryOnLeft}</Text>
                &nbsp;/ {quota.tryOnLimit}
              </View>
            </>
          ) : (
            <>
              <View className='user-name'>Not logged in</View>
              <Button className='login-btn' size='mini' onClick={handleLogin}>
                Log in
              </Button>
            </>
          )}
        </View>
      </View>

      {/* Menu */}
      <View className='menu'>
        <View className='menu-item' onClick={goHistory}>
          <Image className='menu-icon' src={historyIcon} mode='aspectFit' />
          <Text className='menu-label'>Try-on History</Text>
          <Text className='arrow'>›</Text>
        </View>

        <Button className='menu-item menu-item-btn' openType='contact'>
          <Image className='menu-icon' src={customIcon} mode='aspectFit' />
          <Text className='menu-label'>Contact Support</Text>
          <Text className='arrow'>›</Text>
        </Button>
      </View>
    </View>
  )
}
