import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // 获取试穿次数配置
  @Get('try-on-limit')
  async getTryOnLimit() {
    return { tryOnLimit: await this.settingsService.getTryOnLimit() };
  }

  // 修改试穿次数配置（生产环境建议加管理员鉴权）
  @Put('try-on-limit')
  async setTryOnLimit(@Body() body: { value: number }) {
    return { tryOnLimit: await this.settingsService.setTryOnLimit(body.value) };
  }
}
