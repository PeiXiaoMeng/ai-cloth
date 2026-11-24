import { View, Text } from '@tarojs/components'

import './index.scss'

const PRICE_LIST = [
  { name: 'Trial Pack', desc: '2 tries / ¥1' },
  { name: '10-Yuan Pack', desc: '24 tries / ¥10' },
  { name: '30-Yuan Pack', desc: '90 tries / ¥30' },
]

interface Props {
  visible: boolean
  onClose: () => void
}

export default function QuotaPoster({ visible, onClose }: Props) {
  if (!visible) return null

  return (
    // catchMove prevents touch scroll from penetrating to the page below
    <View className='qp-mask' catchMove onClick={onClose}>
      {/* Prevent taps on the poster itself from triggering close */}
      <View className='qp-poster' onClick={(e) => e.stopPropagation()}>
        <View className='qp-title'>Try-on quota exhausted</View>
        <View className='qp-desc'>
          AI image generation consumes tokens. To keep your experience smooth, we offer the following purchase options:
        </View>

        <View className='qp-prices'>
          {PRICE_LIST.map((p, i) => (
            <View key={i} className='qp-price-row'>
              <Text className='qp-price-name'>
                {i + 1}. {p.name}
              </Text>
              <Text className='qp-price-desc'>{p.desc}</Text>
            </View>
          ))}
        </View>

        <View className='qp-qr-wrap'>
          {/* QR code placeholder: swap back to an Image component once the real QR code is ready */}
          <View className='qp-qr-placeholder'>
            <Text className='qp-qr-placeholder-text'>QR Code Placeholder</Text>
            <Text className='qp-qr-placeholder-sub'>The admin's WeChat QR code goes here</Text>
          </View>
          <View className='qp-qr-tip'>Scan to add the admin and purchase</View>
        </View>

        <View className='qp-close' onClick={onClose}>
          Close
        </View>
      </View>
    </View>
  )
}
