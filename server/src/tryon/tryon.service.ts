import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashscopeService } from './dashscope.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class TryonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashscopeService: DashscopeService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * 试穿主流程：
   * 1. 校验商品与用户剩余次数（超出则提示请联系管理员）
   * 2. 创建 PENDING 记录
   * 3. 调用阿里百炼生成试穿结果
   * 4. 只有成功才消耗次数（记录状态为 SUCCESS）
   */
  async tryOn(opts: {
    userId: number;
    itemId: number;
    personImageUrl: string; // 用户上传图片的公网可访问 URL
    baseUrl: string; // 例如 http://localhost:3000，用于拼接商品图 URL
  }) {
    const { userId, itemId, personImageUrl, baseUrl } = opts;

    const item = await this.prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('商品不存在');
    }

    // 次数校验：基础次数 + 管理员调整的 bonus
    const limit = await this.settingsService.getTryOnLimit();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const used = await this.prisma.tryOnRecord.count({
      where: { userId, itemId, status: 'SUCCESS' },
    });
    if (used >= limit + (user?.quotaBonus ?? 0)) {
      throw new ForbiddenException('您的试穿次数已用完，请联系管理员');
    }

    const record = await this.prisma.tryOnRecord.create({
      data: {
        userId,
        itemId,
        status: 'PENDING',
        inputImg: personImageUrl,
      },
    });

    try {
      const garmentImageUrl = item.image.startsWith('http')
        ? item.image
        : `${baseUrl}${item.image}`;

      // 分类：衣服=上装，裤子=下装
        const garmentType = item.category === '裤子' ? 'bottoms' : 'tops';
        const resultUrl = await this.dashscopeService.tryOn(personImageUrl, garmentImageUrl, garmentType);


      // 结果图下载到本地，避免小程序端引用外域图片
      let resultImg = resultUrl;
      if (resultUrl.startsWith('http')) {
        try {
          resultImg = await this.downloadToPublic(resultUrl);
        } catch {
          // 下载失败则直接使用原始 URL
        }
      }

      return await this.prisma.tryOnRecord.update({
        where: { id: record.id },
        data: { status: 'SUCCESS', resultImg },
      });
    } catch (e) {
      await this.prisma.tryOnRecord.update({
        where: { id: record.id },
        data: { status: 'FAILED' },
      });
      throw new BadRequestException(e.message || '试穿失败，请稍后重试');
    }
  }

  async getRecord(id: number, userId: number) {
    return this.prisma.tryOnRecord.findFirst({
      where: { id, userId },
      include: { item: true },
    });
  }

  // 用户剩余次数（基础 + 管理员调整的 bonus）
  async leftCount(userId: number) {
    const limit = await this.settingsService.getTryOnLimit();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const used = await this.prisma.tryOnRecord.count({
      where: { userId, status: 'SUCCESS' },
    });
    return {
      tryOnLimit: limit,
      tryOnUsed: used,
      quotaBonus: user?.quotaBonus ?? 0,
      tryOnLeft: Math.max(0, limit + (user?.quotaBonus ?? 0) - used),
    };
  }

  // 把 DashScope 返回的结果图下载到 public/uploads，返回本地静态路径
  private async downloadToPublic(url: string): Promise<string> {
    const axios = await import('axios').then((m) => m.default);
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.join(process.cwd(), 'public', 'uploads', 'tryon');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `result_${Date.now()}_${Math.floor(Math.random() * 10000)}.png`;
    const filepath = path.join(dir, filename);
    const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
    fs.writeFileSync(filepath, Buffer.from(res.data));
    return `/static/uploads/tryon/${filename}`;
  }
}
