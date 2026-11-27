import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtService } from '@nestjs/jwt';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { ItemIndexService } from '../search/item-index.service';

// Category values are Chinese on purpose: they are data values shared with the mini-program filters
const CATEGORIES = ['上衣', '裤子'];

// Item image upload: stored under public/uploads/items/
const itemUploadInterceptor = () =>
  FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require('path');
        const dir = path.join(process.cwd(), 'public', 'uploads', 'items');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => {
        const ext = extname(file.originalname) || '.jpg';
        cb(null, `item_${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`);
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
  });

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly itemIndex: ItemIndexService,
  ) {}

  /** Admin login: returns a token valid for 7 days */
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const user = await this.adminService.login(
      String(body.username || ''),
      String(body.password || ''),
    );
    if (!user) {
      throw new BadRequestException('Invalid username or password');
    }
    const token = await this.jwtService.signAsync(
      { sub: 'admin', role: 'admin' },
      { expiresIn: '7d' },
    );
    return { token, expiresIn: 7 * 24 * 3600 };
  }

  // ---------- Item management ----------

  @Get('items')
  @UseGuards(AdminGuard)
  listItems() {
    return this.adminService.listItems();
  }

  /** Create an item: multipart (title, category, file) */
  @Post('items')
  @UseGuards(AdminGuard)
  @UseInterceptors(itemUploadInterceptor())
  async createItem(
    @Body() body: { title: string; category: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const title = String(body.title || '').trim();
    const category = String(body.category || '');
    if (!title) throw new BadRequestException('Item title is required');
    if (!CATEGORIES.includes(category)) throw new BadRequestException('Category must be 上衣 (tops) or 裤子 (bottoms)');
    if (!file) throw new BadRequestException('Item image is required');

    const max = await this.prisma.clothingItem.aggregate({ _max: { sort: true } });
    // Business row + outbox event in ONE transaction: "DB committed but event lost" is impossible
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clothingItem.create({
        data: {
          title,
          category,
          image: `/static/uploads/items/${file.filename}`,
          sort: (max._max.sort ?? 0) + 1,
          badge: '试穿', // badge label rendered by the mini-program
        },
      });
      await tx.itemIndexOutbox.create({ data: { itemId: created.id, op: 'UPSERT' } });
      return created;
    });
    return { ...item, isNew: true };
  }

  /** Update an item: multipart (title, category optional, file optional to replace the image) */
  @Put('items/:id')
  @UseGuards(AdminGuard)
  @UseInterceptors(itemUploadInterceptor())
  async updateItem(
    @Param('id') id: string,
    @Body() body: { title?: string; category?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const exist = await this.prisma.clothingItem.findUnique({ where: { id: Number(id) } });
    if (!exist) throw new BadRequestException('Item not found');

    const data: { title?: string; category?: string; image?: string } = {};
    if (body.title !== undefined && String(body.title).trim()) {
      data.title = String(body.title).trim();
    }
    if (body.category !== undefined) {
      const category = String(body.category);
      if (!CATEGORIES.includes(category)) {
        throw new BadRequestException('Category must be 上衣 (tops) or 裤子 (bottoms)');
      }
      data.category = category;
    }
    if (file) {
      data.image = `/static/uploads/items/${file.filename}`;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Nothing to update');
    }
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.clothingItem.update({
        where: { id: Number(id) },
        data,
      });
      await tx.itemIndexOutbox.create({ data: { itemId: updated.id, op: 'UPSERT' } });
      return updated;
    });
    return { ...item, isNew: this.adminService.isNewByCreatedAt(item.createdAt) };
  }

  /** Delete an item (also removes its try-on records) */
  @Delete('items/:id')
  @UseGuards(AdminGuard)
  async deleteItem(@Param('id') id: string) {
    const exist = await this.prisma.clothingItem.findUnique({ where: { id: Number(id) } });
    if (!exist) throw new BadRequestException('Item not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.tryOnRecord.deleteMany({ where: { itemId: Number(id) } });
      await tx.clothingItem.delete({ where: { id: Number(id) } });
      // DELETE event: the worker removes the doc from Elasticsearch
      await tx.itemIndexOutbox.create({ data: { itemId: Number(id), op: 'DELETE' } });
    });
    return { ok: true };
  }

  /** Rebuild the Elasticsearch index from the database (fallback for sync drift) */
  @Post('items/reindex')
  @UseGuards(AdminGuard)
  reindexItems() {
    return this.itemIndex.rebuild();
  }

  // ---------- User quota management ----------

  @Get('users')
  @UseGuards(AdminGuard)
  listUsers() {
    return this.adminService.listUsers();
  }

  /** Adjust a user's try-on quota: { delta: number }, positive to add / negative to subtract */
  @Post('users/:id/quota')
  @UseGuards(AdminGuard)
  async adjustQuota(@Param('id') id: string, @Body() body: { delta: number }) {
    try {
      return await this.adminService.adjustQuota(Number(id), Number(body.delta));
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
