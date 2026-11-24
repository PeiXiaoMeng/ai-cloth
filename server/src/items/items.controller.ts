import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  // Item list for the home page
  @Get()
  findAll() {
    return this.itemsService.findAll();
  }

  // Item detail
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const item = await this.itemsService.findOne(Number(id));
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return item;
  }
}
