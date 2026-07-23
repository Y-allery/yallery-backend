import { Controller, Logger, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { PaymentService } from './payment.service';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PAYMENT_SWAGGER } from 'src/shared/swagger';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  @Post('webhook')
  @ApiOperation(PAYMENT_SWAGGER.handleWebhook)
  @ApiResponse(PAYMENT_SWAGGER.handleWebhook.responses.success)
  @ApiResponse(PAYMENT_SWAGGER.handleWebhook.responses.badRequest)
  @ApiResponse(PAYMENT_SWAGGER.handleWebhook.responses.internalError)
  async handlePaymentWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      if (!(await this.isAuthorizedAdaptyRequest(req.headers.authorization))) {
        this.logger.warn(
          `⛔ Rejected payment webhook with invalid/missing Authorization header (ip=${req.ip})`,
        );
        return res.status(HttpStatus.UNAUTHORIZED).json({
          error: 'Invalid webhook authorization',
        });
      }

      const webhookData = req.body;

      if (!webhookData) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Request body is required',
        });
      }
      
      const dataString = webhookData.toString('utf-8');

      const parsedData = JSON.parse(dataString);

      if (parsedData.adapty_check) {
        res.status(HttpStatus.OK).json({
          adapty_check_response: parsedData.adapty_check,
        });
      } else {
        await this.paymentService.processWebhook(webhookData, {
          method: req.method,
          url: (req as any).originalUrl ?? req.url,
          ip: req.ip,
          headers: req.headers as any,
        });

        res.status(HttpStatus.OK).json({
          adapty_check_response: parsedData.adapty_check,
          message: 'Webhook processed successfully',
        });
      }
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Error processing webhook',
        message: error.message,
      });
    }
  }

  /**
   * Adapty has no HMAC signing — its only webhook auth is a static value you
   * configure in the Dashboard (Integrations -> Webhooks -> Authorization
   * header value), sent back verbatim as the Authorization header on every
   * call. Fails OPEN (accepts + logs a warning) when neither token is
   * configured, so shipping this is a no-op until the matching value is also
   * set in the Adapty Dashboard — flip both sides together, not just one.
   */
  private async isAuthorizedAdaptyRequest(
    authHeader: string | undefined,
  ): Promise<boolean> {
    const [prodToken, sandboxToken] = await Promise.all([
      this.providerRuntimeConfigService.getString('ADAPTY_WEBHOOK_AUTH_TOKEN'),
      this.providerRuntimeConfigService.getString(
        'ADAPTY_WEBHOOK_AUTH_TOKEN_SANDBOX',
      ),
    ]);
    const expectedTokens = [prodToken, sandboxToken].filter(
      (token): token is string => Boolean(token),
    );

    if (expectedTokens.length === 0) {
      this.logger.warn(
        '⚠️ ADAPTY_WEBHOOK_AUTH_TOKEN not configured — payment webhook is accepting unauthenticated requests',
      );
      return true;
    }

    if (!authHeader) {
      return false;
    }
    return expectedTokens.some((token) =>
      this.constantTimeEqual(authHeader, token),
    );
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
