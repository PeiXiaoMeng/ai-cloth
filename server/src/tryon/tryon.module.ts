import { Module } from '@nestjs/common';
import { TryonController } from './tryon.controller';
import { TryonService } from './tryon.service';
import { DashscopeService } from './dashscope.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [TryonController],
  providers: [TryonService, DashscopeService],
})
export class TryonModule {}
