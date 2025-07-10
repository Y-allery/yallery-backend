import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ImageGenerationService } from './image-generation.service';
import { GenerateImageDto } from './dto/generate.image.dto';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.auth.guard';
import { AuthenticatedRequest } from 'src/auth/types/auth.user.interface';
import { RefundCreditDto } from 'src/post/dto/refund.credit.dto';
@ApiTags('Image Generation')
@Controller('image-generation') //sd
export class ImageGenerationController {
  constructor(
    private readonly imageGenerationService: ImageGenerationService,
  ) {}

  @Post('generate-image')
  async generateOctoAI(
    @Body() createPostDto: GenerateImageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.imageGenerationService.generateImages(
      createPostDto,
      req.user.id,
    );

    return {
      message: 'Image generation task has been added to the queue.',
    };
  }

  @Delete(':id')
  async deletePost(
    @Param('id', ParseIntPipe) postId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.imageGenerationService.deletePost(
      postId,
      req.user.id,
    );
    return result;
  }

  @Get('ai-settings')
  getAllAISettings() {
    return this.imageGenerationService.getAllAISettings();
  }

  @Post('save/:id')
  async markPostAsSaved(
    @Param('id', ParseIntPipe) postId: number,
    @Req() req: AuthenticatedRequest,
  ) {
    const result = await this.imageGenerationService.markPostAsSaved(
      postId,
      req.user.id,
    );
    return result;
  }

  @Post('refund-credits')
  @ApiOperation({ summary: 'Refund credits for generated posts' })
  @ApiBody({ type: RefundCreditDto })
  @ApiResponse({ status: 200, description: 'Credits refunded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async refundCredits(
    @Body() dto: RefundCreditDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.user.id;

    return await this.imageGenerationService.calculateRefundCredits(
      userId,
      dto.posts,
      dto.ai_service,
    );
  }

  @Get('calCon')
  async getCalories(@Req() req: any) {
    const { uid, key, dt } = req.query as any;
    try {
      // Define the constants for the URL and headers
      const serverUrl =
        'https://www.myfitnesspal.com/reports/printable-diary/' + uid;
      const agent = 'PostmanRuntime/7.37.3';
      const headers = {
        Accept: '*/*',
        'User-Agent': agent,
        'Accept-Encoding': 'gzip, deflate, br',
        Host: 'www.myfitnesspal.com',
        Connection: 'keep-alive',
      };

      console.log('Sending GET request to MyFitnessPal with URL:', serverUrl);

      // Fetch cookies
      const res = await fetch(serverUrl, {
        method: 'GET',
        headers: headers,
      });

      if (res.status !== 200) {
        throw new Error(`Failed to fetch. Status: ${res.status}`);
      }

      // Get 'set-cookie' header using the correct method
      const cookies = await this.parseCookies(res.headers.get('set-cookie'));

      console.log('Cookies received:', cookies);

      // Fetch diary data
      const diary = await this.getDiary(uid, key, dt, cookies);

      let totCal = 0;
      let totFat = 0;
      let totProt = 0;
      let totCarb = 0;
      let totFib = 0;

      diary[0].food_entries.forEach((item) => {
        totCal += item.nutritional_contents.energy.value;
        totFat += item.nutritional_contents.fat;
        totProt += item.nutritional_contents.protein;
        totCarb += item.nutritional_contents.carbohydrates;
        totFib += item.nutritional_contents.fiber;
      });

      return {
        cal: totCal,
        fat: Math.round(totFat),
        prot: Math.round(totProt),
        car: Math.round(totCarb),
        fib: Math.round(totFib),
      };
    } catch (error) {
      console.error('Error occurred:', error);
      throw new Error('Failed to retrieve data');
    }
  }

  private async getDiary(
    uid: string,
    key: string,
    dt: string,
    cookies: string,
  ) {
    const serverUrl =
      'https://www.myfitnesspal.com/api/services/authenticate_diary_key';
    const body = {
      key,
      show_food_diary: 1,
      show_exercise_diary: 0,
      show_food_notes: 0,
      show_exercise_notes: 0,
      username: uid,
      from: dt,
      to: dt,
    };

    // Log request body for debugging
    console.log('Request Body for authenticate_diary_key:', body);

    const options: RequestInit = {
      // Use RequestInit instead of RequestOptions
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        referrer: `https://www.myfitnesspal.com/reports/printable-diary/${uid}`,
        Connection: 'keep-alive',
        'Content-Type': 'application/json',
        Host: 'www.myfitnesspal.com',
        Cookie: cookies,
      },
      body: JSON.stringify(body),
      credentials: 'include', // No need to cast 'include'
    };

    console.log('Sending POST request to MyFitnessPal:', serverUrl);

    const res = await fetch(serverUrl, options);

    if (res.status !== 200) {
      const errorText = await res.text();
      console.error('Failed to fetch diary:', errorText);
      throw new Error(
        `Failed to fetch diary. Status: ${res.status} - ${errorText}`,
      );
    }

    return await res.json();
  }
  private async parseCookies(cookieArr: string | null) {
    if (!cookieArr) return '';
    const cookies = cookieArr.split(';').map((cookie) => cookie.trim());
    return cookies.join('; ');
  }
}
