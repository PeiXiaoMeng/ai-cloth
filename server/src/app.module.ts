import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ItemsModule } from './items/items.module';
import { TryonModule } from './tryon/tryon.module';
import { SettingsModule } from './settings/settings.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // Static assets: item images / uploads / try-on results
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public'),
      serveRoot: '/static',
    }),
    PrismaModule,
    AuthModule,
    ItemsModule,
    SettingsModule,
    TryonModule,
    AdminModule,
  ],
})
export class AppModule {}
