import { View, Text } from '@tarojs/components'

import './index.scss'

const PRICE_LIST = [
  { name: '体验包', desc: '2 次 / 1 元' },
  { name: '10 元包', desc: '24 次 / 10 元' },
  { name: '30 元包', desc: '90 次 / 30 元' },
]

interface Props {
  visible: boolean
  onClose: () => void
}

export default function QuotaPoster({ visible, onClose }: Props) {
  if (!visible) return null

  return (
    // catchMove 阻止触摸滚动穿透到下层页面
    <View className='qp-mask' catchMove onClick={onClose}>
      {/* 阻止点击海报本身触发关闭 */}
      <View className='qp-poster' onClick={(e) => e.stopPropagation()}>
        <View className='qp-title'>试穿次数已用完</View>
        <View className='qp-desc'>
          由于 AI 生成图片需要消耗 token，为了您的体验，我们提供以下购买方式：
        </View>

        <View className='qp-prices'>
          {PRICE_LIST.map((p, i) => (
            <View key={i} className='qp-price-row'>
              <Text className='qp-price-name'>
                {i + 1}、{p.name}
              </Text>
              <Text className='qp-price-desc'>{p.desc}</Text>
            </View>
          ))}
        </View>

        <View className='qp-qr-wrap'>
          {/* 二维码预留位置：拿到正式二维码后，替换回 Image 组件即可 */}
          <View className='qp-qr-placeholder'>
            <Text className='qp-qr-placeholder-text'>二维码预留位置</Text>
            <Text className='qp-qr-placeholder-sub'>此处展示管理员微信二维码</Text>
          </View>
          <View className='qp-qr-tip'>请扫码添加管理员咨询购买</View>
        </View>

        <View className='qp-close' onClick={onClose}>
          关闭
        </View>
      </View>
    </View>
  )
}
