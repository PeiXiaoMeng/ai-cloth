import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';

/**
 * Public search endpoints for the mini-program.
 * NOTE: SearchModule must be registered before ItemsModule — its `@Get(':id')`
 * route would otherwise swallow /items/search as an item id.
 * (See the import order in app.module.ts.)
 */
@Controller('items')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /items/search?q=jean&category=Bottoms&isNew=true&sort=new&limit=20&offset=0 */
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('isNew') isNew?: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.searchService.search({
      q,
      category,
      isNew,
      sort,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /** GET /items/suggest?q=bl -> { suggestions: ["Blue Denim Jeans", ...] } */
  @Get('suggest')
  suggest(@Query('q') q?: string) {
    return this.searchService.suggest(q || '');
  }
}
