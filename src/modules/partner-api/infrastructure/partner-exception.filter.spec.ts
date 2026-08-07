import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { PartnerExceptionFilter } from './partner-exception.filter';

describe('PartnerExceptionFilter', () => {
  let json: jest.Mock;
  let status: jest.Mock;
  let host: never;
  let filter: PartnerExceptionFilter;

  beforeEach(() => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as never;
    filter = new PartnerExceptionFilter();
  });

  // The first malformed request a partner sends hits the global ValidationPipe, so this
  // shape is the one they meet before any documented one.
  it('rewrites a ValidationPipe rejection into the documented envelope', () => {
    filter.catch(
      new BadRequestException({
        message: ['prompt must be a string', 'model should not be empty'],
        error: 'Bad Request',
        statusCode: 400,
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        type: 'invalid_request_error',
        message: 'prompt must be a string; model should not be empty',
      },
    });
  });

  it('passes through an envelope we built ourselves, fields intact', () => {
    const body = {
      error: { type: 'invalid_request_error', param: 'size', message: 'nope' },
    };
    filter.catch(new BadRequestException(body), host);

    expect(json).toHaveBeenCalledWith(body);
  });

  it('maps 401 to an authentication error', () => {
    filter.catch(new UnauthorizedException('nope'), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json.mock.calls[0][0].error.type).toBe('authentication_error');
  });

  it('maps 429 to a rate limit error', () => {
    filter.catch(
      new HttpException('slow down', HttpStatus.TOO_MANY_REQUESTS),
      host,
    );

    expect(json.mock.calls[0][0].error.type).toBe('rate_limit_error');
  });

  it('answers a non-HTTP crash generically, leaking nothing', () => {
    filter.catch(
      new Error('ECONNREFUSED 10.0.0.4:6379 while calling pruna'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.error.type).toBe('generation_error');
    expect(JSON.stringify(body)).not.toContain('pruna');
    expect(JSON.stringify(body)).not.toContain('10.0.0.4');
  });
});
