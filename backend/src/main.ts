import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import {
  getCorsOrigins,
  validateStartupEnv,
} from "./common/utils/env-validation.util";
import { JsonLogger } from "./common/logging/json-logger";

async function bootstrap() {
  validateStartupEnv();
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger({ logLevels: JsonLogger.getLogLevels() }),
  });

  app.use(cookieParser());
  app.use(helmet({ hsts: false })); // HSTS handled by nginx
  app.use(morgan("combined"));

  app.getHttpAdapter().getInstance().set("trust proxy", 1);

  app.enableCors({
    origin: getCorsOrigins(),
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
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

  // OpenAPI / Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle("IT Support Ticketing API")
    .setDescription("Full-stack ticketing system for internal IT support")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port, "0.0.0.0");
}
bootstrap();
