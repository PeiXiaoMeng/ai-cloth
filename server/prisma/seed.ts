import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Initialize system settings: try-on quota per user (adjust via the Setting table's value)
  await prisma.setting.upsert({
    where: { key: 'TRY_ON_LIMIT' },
    update: {},
    create: { key: 'TRY_ON_LIMIT', value: '3' },
  });

  // Seed clothing items (images live under server/public/clothes/)
  // Categories: 上衣 (tops) / 裤子 (bottoms); "new arrivals" is not stored — computed
  // dynamically by the server based on creation time (within 30 days)
  const items = [
    { title: 'Light Blue Graphic T-Shirt', image: '/static/clothes/1.jpg', category: '上衣', sort: 1 },
    { title: 'Dark Brown Leather Jacket', image: '/static/clothes/2.jpg', category: '上衣', sort: 2 },
    { title: 'Blue Denim Jeans', image: '/static/clothes/3.jpg', category: '裤子', sort: 3 },
    { title: 'Gray High-Waist Leggings', image: '/static/clothes/4.jpg', category: '裤子', sort: 4 },
    { title: 'Cream Cherry-Collar Blouse', image: '/static/clothes/5.jpg', category: '上衣', sort: 5 },
    { title: 'White Belted Trench Coat', image: '/static/clothes/6.jpg', category: '上衣', sort: 6 },
  ];

  // Wipe and rebuild items (dev only; clear try-on records first to avoid FK constraints)
  await prisma.tryOnRecord.deleteMany({});
  await prisma.clothingItem.deleteMany({});
  for (const item of items) {
    await prisma.clothingItem.create({ data: item });
  }

  console.log('seed done:', await prisma.clothingItem.count(), 'items');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
