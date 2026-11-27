import { Module } from '@nestjs/common';
import { ElasticsearchProvider } from './elasticsearch.provider';
import { ItemIndexQueue } from './item-index.queue';
import { ItemIndexService } from './item-index.service';
import { OutboxPoller } from './outbox.poller';
import { IndexWorker } from './index.worker';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SearchController],
  providers: [
    ElasticsearchProvider,
    ItemIndexQueue,
    ItemIndexService,
    OutboxPoller,
    IndexWorker,
    SearchService,
  ],
  exports: [ItemIndexService], // AdminModule reuses it for the "Rebuild index" endpoint
})
export class SearchModule {}
