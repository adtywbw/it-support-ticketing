import {
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  function getHost() {
    return {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as any;
  }

  it('should map 429 ThrottlerException to TOO_MANY_REQUESTS code', () => {
    const exception = new ThrottlerException('Too Many Requests');

    filter.catch(exception, getHost());

    expect(mockResponse.status).toHaveBeenCalledWith(429);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too Many Requests',
      },
    });
  });

  it('should map 400 Bad Request to BAD_REQUEST code', () => {
    const exception = new BadRequestException('Invalid input');

    filter.catch(exception, getHost());

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid input',
      },
    });
  });

  it('should map 401 Unauthorized to UNAUTHORIZED code', () => {
    const exception = new UnauthorizedException('No token');

    filter.catch(exception, getHost());

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'No token',
      },
    });
  });

  it('should preserve custom code from exception response', () => {
    const exception = new HttpException(
      { code: 'CUSTOM_CODE', message: 'Custom error' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, getHost());

    expect(mockResponse.json).toHaveBeenCalledWith({
      error: {
        code: 'CUSTOM_CODE',
        message: 'Custom error',
      },
    });
  });
});