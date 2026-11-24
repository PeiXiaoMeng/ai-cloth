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
   * Try-on endpoint:
   * - Requires auth (Authorization: Bearer <token>)
   * - multipart/form-data: file = user-uploaded photo
   * - Validates remaining quota server-side, then calls DashScope and returns the result
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
          cb(new BadRequestException('Only image files are allowed'), false);
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
      throw new BadRequestException('Please upload a photo of yourself');
    }
    const protocol = req.protocol;
    const host = req.get('host');
    // Publicly accessible base URL for images: prefer PUBLIC_BASE_URL (tunnel / production domain)
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

  // My remaining try-on quota
  @Get('quota')
  @UseGuards(JwtAuthGuard)
  async quota(@Req() req: Request & { userId: number }) {
    return this.tryonService.leftCount(req.userId);
  }

  // Get a single try-on record
  @Get('record/:id')
  @UseGuards(JwtAuthGuard)
  async record(@Req() req: Request & { userId: number }, @Param('id') id: string) {
    return this.tryonService.getRecord(Number(id), req.userId);
  }

  // My try-on history
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
