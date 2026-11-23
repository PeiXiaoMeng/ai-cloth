import { Controller, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TryonService } from './tryon.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';

@Controller('try-on')
export class TryonController {
  constructor(
    private readonly tryonService: TryonService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 试穿接口：
   * - 需要登录（Authorization: Bearer <token>）
   * - multipart/form-data: file=用户上传的照片
   * - 服务端校验剩余次数后调用阿里百炼，返回试穿结果
   */
  @Post(':itemId')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const fs = require('fs');
          const path = require('path');
          const dir = path.join(process.cwd(), 'public', 'uploads', 'person');
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          const ext = extname(file.originalname) || '.jpg';
          cb(null, `person_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (/^image\//.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('只能上传图片文件'), false);
        }
      },
    }),
  )
  async tryOn(
    @Req() req: Request & { userId: number },
    @Param('itemId') itemId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('请上传一张自己的照片');
    }
    const protocol = req.protocol;
    const host = req.get('host');
    // const baseUrl = `${protocol}://${host}`;
    // 图片公网可访问地址：优先用 PUBLIC_BASE_URL（内网穿透/线上域名）
    const baseUrl = (
        process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    ).replace(/\/$/, '');
    console.log(baseUrl)
    console.log(`${baseUrl}/static/uploads/person/${file.filename}`)
    const record = await this.tryonService.tryOn({
      userId: req.userId,
      itemId: Number(itemId),
      personImageUrl: `${baseUrl}/static/uploads/person/${file.filename}`,
      baseUrl,
    });
    return {
      ...record,
      ...(await this.tryonService.leftCount(req.userId)),
    };
  }

  // 我的剩余试穿次数
  @Get('quota')
  @UseGuards(JwtAuthGuard)
  async quota(@Req() req: Request & { userId: number }) {
    return this.tryonService.leftCount(req.userId);
  }

  // 查询某次试穿记录
  @Get('record/:id')
  @UseGuards(JwtAuthGuard)
  async record(@Req() req: Request & { userId: number }, @Param('id') id: string) {
    return this.tryonService.getRecord(Number(id), req.userId);
  }

  // 我的试穿历史
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async history(@Req() req: Request & { userId: number }) {
    return this.prisma.tryOnRecord.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: { item: { select: { title: true, image: true } } },
      take: 50,
    });
  }
}
