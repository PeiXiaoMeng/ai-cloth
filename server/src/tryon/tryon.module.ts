import { Module } from '@nestjs/common';
import { TryonController } from './tryon.controller';
import { TryonService } from './tryon.service';
import { TryonQueue } from './tryon.queue';
import { TryonProcessor } from './tryon.processor';
import { DashscopeService } from './dashscope.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [TryonController],
  providers: [TryonService, TryonQueue, TryonProcessor, DashscopeService],
})
export class TryonModule {}
