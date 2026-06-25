import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function validateEnv() {
  const required = ['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (process.env.NODE_ENV === 'production') {
    const jwtSecret = process.env.JWT_SECRET || '';
    const weakSecrets = ['your-super-secret-jwt-key-change-in-production', 'secret', 'changeme', 'password'];
    if (weakSecrets.includes(jwtSecret.toLowerCase().trim())) {
      throw new Error(
        'JWT_SECRET is too weak for production. Please set a strong, unique secret.',
      );
    }
    if (!process.env.REDIS_PASSWORD) {
      throw new Error(
        'REDIS_PASSWORD is required in production.',
      );
    }
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(helmet());
  app.use(morgan('combined'));

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const corsOrigin = process.env.CORS_ORIGIN || 'https://helpdesk.rsmch.internal';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap();
