import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type TelegramMediaItem = {
  type: 'photo' | 'video';
  media: string; // https URL to already-hosted media
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
};

/**
 * Thin Telegram Bot API client. The codebase had no send capability — the bot
 * token was only used for login HMAC validation — so this speaks the raw Bot
 * API over axios (the house HTTP client), mirroring the twitter-api-io service.
 *
 * Media-group sends use hosted URLs (Spaces/CDN) so we never need multipart
 * uploads. Telegram caps a media group at 10 items; callers must chunk.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private static readonly MEDIA_GROUP_MAX = 10;

  constructor(private readonly configService: ConfigService) {}

  private get token(): string | null {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') || null;
  }

  private baseUrl(): string | null {
    const token = this.token;
    return token ? `https://api.telegram.org/bot${token}` : null;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async sendMessage(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
  ): Promise<boolean> {
    const base = this.baseUrl();
    if (!base || !chatId) {
      this.logger.warn('Telegram not configured (missing token or chat id)');
      return false;
    }
    try {
      await axios.post(`${base}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      });
      return true;
    } catch (error) {
      this.logger.error(
        `sendMessage failed: ${this.describeError(error)}`,
      );
      return false;
    }
  }

  /**
   * Sends media in groups of up to 10. Returns true if every chunk succeeded.
   * A failed chunk is logged and does not abort the remaining chunks.
   */
  async sendMediaGroup(
    chatId: string,
    media: TelegramMediaItem[],
  ): Promise<boolean> {
    const base = this.baseUrl();
    if (!base || !chatId || media.length === 0) {
      if (media.length > 0) {
        this.logger.warn('Telegram not configured (missing token or chat id)');
      }
      return false;
    }

    let allOk = true;
    for (let i = 0; i < media.length; i += TelegramService.MEDIA_GROUP_MAX) {
      const chunk = media.slice(i, i + TelegramService.MEDIA_GROUP_MAX);
      // Telegram rejects a 1-item media group ("between 2 and 10 items"); send
      // a lone item as a single photo/video instead.
      const ok =
        chunk.length === 1
          ? await this.sendSingle(chatId, chunk[0])
          : await this.post('sendMediaGroup', { chat_id: chatId, media: chunk });
      if (!ok) allOk = false;
    }
    return allOk;
  }

  private async sendSingle(
    chatId: string,
    item: TelegramMediaItem,
  ): Promise<boolean> {
    const method = item.type === 'video' ? 'sendVideo' : 'sendPhoto';
    const field = item.type === 'video' ? 'video' : 'photo';
    return this.post(method, {
      chat_id: chatId,
      [field]: item.media,
      caption: item.caption,
    });
  }

  private async post(
    method: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const base = this.baseUrl();
    if (!base) return false;
    try {
      await axios.post(`${base}/${method}`, body);
      return true;
    } catch (error) {
      this.logger.error(`${method} failed: ${this.describeError(error)}`);
      return false;
    }
  }

  private describeError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as
        | { description?: string }
        | undefined;
      return data?.description || error.message;
    }
    return error instanceof Error ? error.message : String(error);
  }
}
