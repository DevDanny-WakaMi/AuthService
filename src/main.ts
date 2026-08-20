import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import helmet from 'helmet';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const rawBodySaver = (req: any, res: any, buf: Buffer) => {
    req.rawBody = buf;
  };

  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'v',
  });

  app.use(helmet());

  app.use(
    json({
      limit: '10mb',
      verify: rawBodySaver,
    }),
  );
  app.use(urlencoded({ limit: '10mb', extended: true, verify: rawBodySaver }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Wakami API')
    .setDescription('The Wakami API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document, {
    jsonDocumentUrl: 'api/json',
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
