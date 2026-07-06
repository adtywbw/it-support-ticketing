import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const response = context.switchToHttp().getResponse();
    const contentType = response?.getHeader?.('content-type') as string | undefined;

    // Content-type may be set by the route handler (e.g., CSV export).
    // Also check writableEnded: if the response was already sent via @Res(),
    // NestJS enters manual response mode and the interceptor's map() result
    // would be silently discarded anyway.
    if (
      response?.writableEnded ||
      (contentType &&
        (contentType.includes('text/csv') ||
          contentType.includes('application/octet-stream') ||
          contentType.includes('application/gzip')))
    ) {
      return next.handle() as unknown as Observable<ApiResponse<T>>;
    }

    return next.handle().pipe(
      map((data) => {
        if (data === null || data === undefined) {
          return { data: null as unknown as T };
        }
        if (typeof data === 'object' && 'data' in data) {
          return data as unknown as ApiResponse<T>;
        }
        if (typeof data === 'string') {
          return { data } as ApiResponse<T>;
        }
        return { data } as ApiResponse<T>;
      }),
    );
  }
}
