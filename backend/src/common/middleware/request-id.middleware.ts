import {
  Injectable,
  NestMiddleware,
  Logger,
} from "@nestjs/common";
import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

/** Augments Express Request with a correlation ID for request tracing. */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}

/**
 * Injects a unique correlation ID into every incoming request.
 *
 * - Reads from X-Request-ID header (propagates from upstream proxy/nginx).
 * - Falls back to a generated UUIDv4 if header is missing.
 * - Sets X-Request-ID on the response so clients can trace.
 * - Stores the ID on `req.correlationId` for downstream middleware/controllers.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  private readonly logger = new Logger("RequestId");

  use(req: Request, res: Response, next: NextFunction) {
    const id =
      (req.headers["x-request-id"] as string | undefined) ?? uuidv4();

    req.correlationId = id;
    res.setHeader("x-request-id", id);

    // Log every request with its correlation ID for structured tracing.
    this.logger.log(
      `${req.method} ${req.originalUrl} — correlationId=${id}`,
    );

    next();
  }
}
