import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';

export type TelegramMediaItem = {
  type: 'photo' | 'video';
  media: string; // https URL to already-hosted media
  caption?: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
};

export type TelegramInlineButton = { text: string; callback_data: string };

/**
 * Thin Telegram Bot API client for the dedicated internal ops bot (separate
 * from the user-facing login/referral bot — its token lives in
 * TELEGRAM_OPS_BOT_TOKEN, encrypted like every other secret in
 * provider_runtime_settings, not a plain .env var). Speaks the raw Bot API
 * over axios (the house HTTP client) — no bot framework dependency.
 *
 * Media-group sends use hosted URLs (Spaces/CDN) so we never need multipart
 * uploads. Telegram caps a media group at 10 items; callers must chunk.
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private static readonly MEDIA_GROUP_MAX = 10;

  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  private async token(): Promise<string | null> {
    return this.providerRuntimeConfigService.getString(
      'TELEGRAM_OPS_BOT_TOKEN',
    );
  }

  private async baseUrl(): Promise<string | null> {
    const token = await this.token();
    return token ? `https://api.telegram.org/bot${token}` : null;
  }

  async isConfigured(): Promise<boolean> {
    try {
      return Boolean(await this.token());
    } catch {
      return false;
    }
  }

  async sendMessage(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
  ): Promise<boolean> {
    if (!chatId) return false;
    return this.post('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });
  }

  /** Sends a message with an inline keyboard (rows of buttons). */
  async sendMessageWithKeyboard(
    chatId: string,
    text: string,
    keyboard: TelegramInlineButton[][],
    parseMode: 'HTML' | 'MarkdownV2' = 'HTML',
  ): Promise<boolean> {
    if (!chatId) return false;
    return this.post('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      reply_markup: { inline_keyboard: keyboard },
    });
  }

  /** Stops the button's loading spinner; optional toast text. */
  async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
  ): Promise<boolean> {
    return this.post('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
    });
  }

  /**
   * Sends media in groups of up to 10. Returns true if every chunk succeeded.
   * A failed chunk is logged and does not abort the remaining chunks.
   */
  async sendMediaGroup(
    chatId: string,
    media: TelegramMediaItem[],
  ): Promise<boolean> {
    if (!chatId || media.length === 0) return false;

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

  /**
   * Points Telegram at our webhook. secretToken is echoed back by Telegram on
   * every call as the `X-Telegram-Bot-Api-Secret-Token` header, which the
   * receiving controller uses to reject spoofed requests.
   */
  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    return this.post('setWebhook', { url, secret_token: secretToken });
  }

  async getMe(): Promise<Record<string, unknown> | null> {
    try {
      const base = await this.baseUrl();
      if (!base) return null;
      const res = await axios.get(`${base}/getMe`);
      return res.data?.result ?? null;
    } catch (error) {
      // Also catches a decrypt failure resolving the token — TelegramService
      // never throws, it degrades to "not configured / unavailable".
      this.logger.error(`getMe failed: ${this.describeError(error)}`);
      return null;
    }
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
    // baseUrl() resolution lives INSIDE the try: a decrypt failure on the
    // encrypted token (e.g. a rotated SETTINGS_ENCRYPTION_KEY) throws just
    // like a network error, and must degrade to `false` the same way, not
    // propagate as an uncaught 500 out of every ops-bot Telegram call.
    try {
      const base = await this.baseUrl();
      if (!base) {
        this.logger.warn(
          `${method} skipped: TELEGRAM_OPS_BOT_TOKEN not configured`,
        );
        return false;
      }
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
