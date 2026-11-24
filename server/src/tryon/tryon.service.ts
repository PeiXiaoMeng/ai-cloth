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
   * Main try-on flow:
   * 1. Validate the item and the user's remaining quota (prompt to contact admin when exhausted)
   * 2. Create a PENDING record
   * 3. Call DashScope to generate the try-on result
   * 4. Only consume quota on success (record status = SUCCESS)
   */
  async tryOn(opts: {
    userId: number;
    itemId: number;
    personImageUrl: string; // publicly accessible URL of the user-uploaded photo
    baseUrl: string; // e.g. http://localhost:3000, used to build the garment image URL
  }) {
    const { userId, itemId, personImageUrl, baseUrl } = opts;

    const item = await this.prisma.clothingItem.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException('Item not found');
    }

    // Quota check: base limit + admin-adjusted bonus
    const limit = await this.settingsService.getTryOnLimit();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const used = await this.prisma.tryOnRecord.count({
      where: { userId, itemId, status: 'SUCCESS' },
    });
    if (used >= limit + (user?.quotaBonus ?? 0)) {
      throw new ForbiddenException('Your try-on quota is exhausted, please contact the administrator');
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

      // Category mapping: 上衣 = tops, 裤子 = bottoms
        const garmentType = item.category === '裤子' ? 'bottoms' : 'tops';
        const resultUrl = await this.dashscopeService.tryOn(personImageUrl, garmentImageUrl, garmentType);


      // Download the result image locally so the mini-program avoids cross-origin image references
      let resultImg = resultUrl;
      if (resultUrl.startsWith('http')) {
        try {
          resultImg = await this.downloadToPublic(resultUrl);
        } catch {
          // Fall back to the original URL if the download fails
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
      throw new BadRequestException(e.message || 'Try-on failed, please try again later');
    }
  }

  async getRecord(id: number, userId: number) {
    return this.prisma.tryOnRecord.findFirst({
      where: { id, userId },
      include: { item: true },
    });
  }

  // User's remaining quota (base limit + admin-adjusted bonus)
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

  // Download the result image from DashScope into public/uploads and return the local static path
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
