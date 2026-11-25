import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  // Enables lifecycle hooks on SIGTERM so the BullMQ worker drains gracefully (K8s friendly)
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
  console.log(`server is running on http://localhost:${process.env.PORT ?? 3000}`);
}
bootstrap();
