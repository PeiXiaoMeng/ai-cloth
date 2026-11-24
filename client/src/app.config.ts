export default defineAppConfig({
  pages: [
    'pages/index/index',
    'pages/detail/detail',
    'pages/mine/mine',
    'pages/history/history',
  ],
  tabBar: {
    color: '#999999',
    selectedColor: '#ff4d6a',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/index/index',
        text: 'Home',
        iconPath: './assets/tabbar/home.png',
        selectedIconPath: './assets/tabbar/home-active.png',
      },
      {
        pagePath: 'pages/mine/mine',
        text: 'Me',
        iconPath: './assets/tabbar/mine.png',
        selectedIconPath: './assets/tabbar/mine-active.png',
      },
    ],
  },
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: 'Fashion Mall',
    navigationBarTextStyle: 'black',
  },
})
