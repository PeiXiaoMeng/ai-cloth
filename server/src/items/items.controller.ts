import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // 首页商品列表
  @Get()
  findAll() {
    return this.itemsService.findAll();
  }

  // 商品详情
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const item = await this.itemsService.findOne(Number(id));
    if (!item) {
      throw new NotFoundException('商品不存在');
    }
    return item;
  }
}
