import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 初始化系统配置：每个用户可试穿次数（可修改数据库 Setting 表的 value 来调整）
  await prisma.setting.upsert({
    where: { key: 'TRY_ON_LIMIT' },
    update: {},
    create: { key: 'TRY_ON_LIMIT', value: '3' },
  });

  // 初始化衣服数据（图片放在 server/public/clothes/ 下）
  // 分类：上衣 / 裤子；"新上"不再入库，由服务端按创建时间（30天内）动态计算
  const items = [
    { title: 'Light Blue Graphic T-Shirt', image: '/static/clothes/1.jpg', category: '上衣', sort: 1 },
    { title: 'Dark Brown Leather Jacket', image: '/static/clothes/2.jpg', category: '上衣', sort: 2 },
    { title: 'Blue Denim Jeans', image: '/static/clothes/3.jpg', category: '裤子', sort: 3 },
    { title: 'Gray High-Waist Leggings', image: '/static/clothes/4.jpg', category: '裤子', sort: 4 },
    { title: 'Cream Cherry-Collar Blouse', image: '/static/clothes/5.jpg', category: '上衣', sort: 5 },
    { title: 'White Belted Trench Coat', image: '/static/clothes/6.jpg', category: '上衣', sort: 6 },
  ];

  // 以图片文件为准，清空后重建（开发阶段使用；先清试穿记录避免外键约束）
  await prisma.tryOnRecord.deleteMany({});
  await prisma.clothingItem.deleteMany({});
  for (const item of items) {
    await prisma.clothingItem.create({ data: item });
  }

  console.log('seed 完成：', await prisma.clothingItem.count(), '件衣服');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
