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
    console.log('🎯 ===== PAYMENT CONTROLLER CALLED =====');
    console.log('🎯 Request method:', req.method);
    console.log('🎯 Request URL:', req.url);
    console.log('🎯 Request body type:', typeof req.body);
    console.log('🎯 Request body is Buffer:', Buffer.isBuffer(req.body));
    
    try {
      const webhookData = req.body;
      
      if (!webhookData) {
        console.error('❌ Request body is empty or undefined!');
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Request body is required',
        });
      }
      
      const dataString = webhookData.toString('utf-8');
      
      console.log('📥 Webhook received, length:', webhookData.length);
      console.log('📥 Webhook data preview:', dataString.substring(0, 500));

      const parsedData = JSON.parse(dataString);

      if (parsedData.adapty_check) {
        console.log('✅ Adapty check request, skipping processing');
        res.status(HttpStatus.OK).json({
          adapty_check_response: parsedData.adapty_check,
        });
      } else {
        console.log('🔄 Processing webhook event...');
        await this.paymentService.processWebhook(webhookData);

        res.status(HttpStatus.OK).json({
          adapty_check_response: parsedData.adapty_check,
          message: 'Webhook processed successfully',
        });
      }
    } catch (error) {
      console.error('❌ Error processing webhook:', error);
      console.error('Error stack:', error.stack);

      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Error processing webhook',
        message: error.message,
      });
    }
  }
}
