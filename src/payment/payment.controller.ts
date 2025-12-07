import { Controller, Post, Req, Res, HttpStatus } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PAYMENT_SWAGGER } from 'src/common/swagger';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('webhook')
  @ApiOperation(PAYMENT_SWAGGER.handleWebhook)
  @ApiResponse(PAYMENT_SWAGGER.handleWebhook.responses.success)
  @ApiResponse(PAYMENT_SWAGGER.handleWebhook.responses.badRequest)
  @ApiResponse(PAYMENT_SWAGGER.handleWebhook.responses.internalError)
  async handlePaymentWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const webhookData = req.body;
      const dataString = webhookData.toString('utf-8');

      const parsedData = JSON.parse(dataString);

      if (parsedData.adapty_check) {
        res.status(HttpStatus.OK).json({
          adapty_check_response: parsedData.adapty_check,
        });
      } else {
        await this.paymentService.processWebhook(webhookData);

        res.status(HttpStatus.OK).json({
          adapty_check_response: parsedData.adapty_check,
          message: 'Webhook processed successfully',
        });
      }
    } catch (error) {
      console.error('Error processing webhook:', error);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Error processing webhook',
      });
    }
  }
}
