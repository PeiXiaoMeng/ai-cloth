import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // Get the try-on quota setting
  @Get('try-on-limit')
  async getTryOnLimit() {
    return { tryOnLimit: await this.settingsService.getTryOnLimit() };
  }

  // Update the try-on quota setting (add admin auth before deploying to production)
  @Put('try-on-limit')
  async setTryOnLimit(@Body() body: { value: number }) {
    return { tryOnLimit: await this.settingsService.setTryOnLimit(body.value) };
  }
}
