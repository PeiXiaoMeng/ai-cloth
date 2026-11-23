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

const CATEGORIES = ['上衣', '裤子'];

// 商品图片上传：存到 public/uploads/items/
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
        cb(new BadRequestException('只能上传图片文件'), false);
      }
    },
  });

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /** 管理员登录：返回 7 天有效期的 token */
  @Post('login')
  async login(@Body() body: { username: string; password: string }) {
    const user = await this.adminService.login(
      String(body.username || ''),
      String(body.password || ''),
    );
    if (!user) {
      throw new BadRequestException('账号或密码错误');
    }
    const token = await this.jwtService.signAsync(
      { sub: 'admin', role: 'admin' },
      { expiresIn: '7d' },
    );
    return { token, expiresIn: 7 * 24 * 3600 };
  }

  // ---------- 商品管理 ----------

  @Get('items')
  @UseGuards(AdminGuard)
  listItems() {
    return this.adminService.listItems();
  }

  /** 添加商品：multipart（title, category, file） */
  @Post('items')
  @UseGuards(AdminGuard)
  @UseInterceptors(itemUploadInterceptor())
  async createItem(
    @Body() body: { title: string; category: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const title = String(body.title || '').trim();
    const category = String(body.category || '');
    if (!title) throw new BadRequestException('请填写商品标题');
    if (!CATEGORIES.includes(category)) throw new BadRequestException('分类必须是 上衣 或 裤子');
    if (!file) throw new BadRequestException('请上传商品图片');

    const max = await this.prisma.clothingItem.aggregate({ _max: { sort: true } });
    const item = await this.prisma.clothingItem.create({
      data: {
        title,
        category,
        image: `/static/uploads/items/${file.filename}`,
        sort: (max._max.sort ?? 0) + 1,
        badge: '试穿',
      },
    });
    return { ...item, isNew: true };
  }

  /** 修改商品：multipart（title, category 可选，file 可选换图） */
  @Put('items/:id')
  @UseGuards(AdminGuard)
  @UseInterceptors(itemUploadInterceptor())
  async updateItem(
    @Param('id') id: string,
    @Body() body: { title?: string; category?: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const exist = await this.prisma.clothingItem.findUnique({ where: { id: Number(id) } });
    if (!exist) throw new BadRequestException('商品不存在');

    const data: { title?: string; category?: string; image?: string } = {};
    if (body.title !== undefined && String(body.title).trim()) {
      data.title = String(body.title).trim();
    }
    if (body.category !== undefined) {
      const category = String(body.category);
      if (!CATEGORIES.includes(category)) {
        throw new BadRequestException('分类必须是 上衣 或 裤子');
      }
      data.category = category;
    }
    if (file) {
      data.image = `/static/uploads/items/${file.filename}`;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('没有需要修改的内容');
    }
    const item = await this.prisma.clothingItem.update({
      where: { id: Number(id) },
      data,
    });
    return { ...item, isNew: this.adminService.isNewByCreatedAt(item.createdAt) };
  }

  /** 删除商品（同时删除其试穿记录） */
  @Delete('items/:id')
  @UseGuards(AdminGuard)
  async deleteItem(@Param('id') id: string) {
    const exist = await this.prisma.clothingItem.findUnique({ where: { id: Number(id) } });
    if (!exist) throw new BadRequestException('商品不存在');
    await this.prisma.tryOnRecord.deleteMany({ where: { itemId: Number(id) } });
    await this.prisma.clothingItem.delete({ where: { id: Number(id) } });
    return { ok: true };
  }

  // ---------- 用户试穿次数管理 ----------

  @Get('users')
  @UseGuards(AdminGuard)
  listUsers() {
    return this.adminService.listUsers();
  }

  /** 调整用户试穿次数：{ delta: number } 正加负减 */
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
