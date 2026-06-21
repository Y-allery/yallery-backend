import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { UpdateProviderSettingDto } from './dto/update-provider-setting.dto';
import { ProviderRuntimeSettingEntity } from './entities/provider-runtime-setting.entity';
import {
  PROVIDER_SETTING_DEFINITION_BY_KEY,
  PROVIDER_SETTING_DEFINITIONS,
  ProviderSettingDefinition,
} from './provider-settings.catalog';
import {
  decryptProviderSettingValue,
  encryptProviderSettingValue,
} from './provider-settings.crypto';

type ProviderSettingSource = 'db' | 'env' | 'default' | 'none';

interface ResolvedProviderSetting {
  value: string | null;
  source: ProviderSettingSource;
  row: ProviderRuntimeSettingEntity | null;
}

@Injectable()
export class ProviderRuntimeConfigService {
  constructor(
    @InjectRepository(ProviderRuntimeSettingEntity)
    private readonly providerSettingsRepository: Repository<ProviderRuntimeSettingEntity>,
    private readonly configService: ConfigService,
  ) {}

  async listSettings() {
    const rows = await this.providerSettingsRepository.find();
    const rowsByKey = new Map(rows.map((row) => [row.key, row]));

    return {
      groups: this.groupDefinitions(
        await Promise.all(
          PROVIDER_SETTING_DEFINITIONS.map((definition) =>
            this.formatSetting(definition, rowsByKey.get(definition.key) ?? null),
          ),
        ),
      ),
      all: await Promise.all(
        PROVIDER_SETTING_DEFINITIONS.map((definition) =>
          this.formatSetting(definition, rowsByKey.get(definition.key) ?? null),
        ),
      ),
    };
  }

  async updateSetting(
    key: string,
    dto: UpdateProviderSettingDto,
    updatedById?: number | null,
  ) {
    const definition = this.getDefinition(key);
    const normalizedValue = this.normalizeValue(definition, dto.value);

    let row = await this.providerSettingsRepository.findOne({ where: { key } });
    if (!row) {
      row = this.providerSettingsRepository.create();
      row.key = definition.key;
    }

    row.provider = definition.provider;
    row.group = definition.group;
    row.label = definition.label;
    row.type = definition.type;
    row.validationKind = definition.validationKind;
    row.isSecret = definition.isSecret;
    row.source = 'db';
    row.updatedById = updatedById ?? null;

    if (definition.isSecret) {
      row.valueEncrypted = encryptProviderSettingValue(
        normalizedValue,
        this.getEncryptionSecret(),
      );
      row.valuePlain = null;
    } else {
      row.valueEncrypted = null;
      row.valuePlain = normalizedValue;
    }

    const saved = await this.providerSettingsRepository.save(row);
    return this.formatSetting(definition, saved);
  }

  async clearSetting(key: string) {
    const definition = this.getDefinition(key);
    await this.providerSettingsRepository.delete({ key });
    return this.formatSetting(definition, null);
  }

  async validateSetting(key: string) {
    const definition = this.getDefinition(key);
    const resolved = await this.resolveDefinitionValue(definition);

    if (!resolved.value) {
      return {
        key,
        ok: false,
        status: 'missing',
        message: `${key} is not configured`,
      };
    }

    switch (definition.validationKind) {
      case 'openai_api_key':
        return this.validateOpenAIKey(key, resolved.value);
      case 'runpod_serverless_endpoint':
        return this.validateRunpodServerlessEndpoint(key, resolved.value);
      case 'runpod_public_endpoint':
        return {
          key,
          ok: true,
          status: 'configured',
          message: 'Public endpoint identifier is configured',
        };
      case 'none':
      default:
        return {
          key,
          ok: true,
          status: 'configured',
          message: 'Setting is configured',
        };
    }
  }

  async getString(key: string): Promise<string | null> {
    const definition = this.getDefinition(key);
    const resolved = await this.resolveDefinitionValue(definition);
    return resolved.value;
  }

  async getNumber(key: string, fallback?: number): Promise<number | undefined> {
    const value = await this.getString(key);

    if (value === null || value === '') {
      return fallback;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async getBoolean(key: string, fallback = true): Promise<boolean> {
    const value = await this.getString(key);

    if (value === null || value === '') {
      return fallback;
    }

    return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
  }

  private async validateOpenAIKey(key: string, apiKey: string) {
    try {
      const response = await axios.get('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 10000,
      });

      return {
        key,
        ok: true,
        status: 'valid',
        message: 'OpenAI API key is valid',
        details: {
          modelCount: Array.isArray(response.data?.data)
            ? response.data.data.length
            : undefined,
        },
      };
    } catch (error: any) {
      return this.formatValidationError(key, error, 'OpenAI validation failed');
    }
  }

  private async validateRunpodServerlessEndpoint(
    key: string,
    endpointId: string,
  ) {
    const apiKey = await this.getString('RUNPOD_API_KEY');

    if (!apiKey) {
      return {
        key,
        ok: false,
        status: 'missing_api_key',
        message: 'RUNPOD_API_KEY is not configured',
      };
    }

    try {
      const response = await axios.get(
        `https://rest.runpod.io/v1/endpoints/${encodeURIComponent(endpointId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          timeout: 10000,
        },
      );

      return {
        key,
        ok: true,
        status: 'valid',
        message: 'RunPod serverless endpoint is valid',
        details: {
          id: response.data?.id,
          name: response.data?.name,
          workersMax: response.data?.workersMax,
          idleTimeout: response.data?.idleTimeout,
        },
      };
    } catch (error: any) {
      return this.formatValidationError(
        key,
        error,
        'RunPod endpoint validation failed',
      );
    }
  }

  private formatValidationError(key: string, error: any, fallback: string) {
    return {
      key,
      ok: false,
      status: 'invalid',
      message:
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        fallback,
      details: {
        httpStatus: error?.response?.status,
      },
    };
  }

  private async formatSetting(
    definition: ProviderSettingDefinition,
    row: ProviderRuntimeSettingEntity | null,
  ) {
    const resolved = await this.resolveDefinitionValue(definition, row);
    const isConfigured = Boolean(resolved.value);

    return {
      key: definition.key,
      provider: definition.provider,
      group: definition.group,
      label: definition.label,
      description: definition.description ?? null,
      type: definition.type,
      isSecret: definition.isSecret,
      validationKind: definition.validationKind,
      isConfigured,
      source: resolved.source,
      value: definition.isSecret ? undefined : this.formatPlainValue(definition, resolved.value),
      maskedValue:
        definition.isSecret && isConfigured ? this.maskSecret(resolved.value) : null,
      updatedAt: resolved.row?.updatedAt ?? null,
    };
  }

  private groupDefinitions(settings: any[]) {
    return settings.reduce((groups, setting) => {
      if (!groups[setting.group]) {
        groups[setting.group] = [];
      }
      groups[setting.group].push(setting);
      return groups;
    }, {});
  }

  private async resolveDefinitionValue(
    definition: ProviderSettingDefinition,
    knownRow?: ProviderRuntimeSettingEntity | null,
  ): Promise<ResolvedProviderSetting> {
    const row =
      knownRow === undefined
        ? await this.providerSettingsRepository.findOne({
            where: { key: definition.key },
          })
        : knownRow;

    if (row) {
      const value = definition.isSecret
        ? this.decryptSecretValue(row)
        : row.valuePlain;

      if (value !== null && value !== undefined && value !== '') {
        return {
          value,
          source: 'db',
          row,
        };
      }
    }

    const envValue = this.configService.get<string>(definition.key);
    if (envValue !== undefined && envValue !== null && envValue !== '') {
      return {
        value: String(envValue),
        source: 'env',
        row: null,
      };
    }

    if (definition.defaultValue !== undefined) {
      return {
        value: definition.defaultValue,
        source: 'default',
        row: null,
      };
    }

    return {
      value: null,
      source: 'none',
      row: null,
    };
  }

  private decryptSecretValue(row: ProviderRuntimeSettingEntity): string | null {
    if (!row.valueEncrypted) {
      return null;
    }

    try {
      return decryptProviderSettingValue(
        row.valueEncrypted,
        this.getEncryptionSecret(),
      );
    } catch (error) {
      throw new InternalServerErrorException(
        `Failed to decrypt provider setting ${row.key}`,
      );
    }
  }

  private getDefinition(key: string): ProviderSettingDefinition {
    const definition = PROVIDER_SETTING_DEFINITION_BY_KEY.get(key);

    if (!definition) {
      throw new NotFoundException(`Provider setting ${key} is not supported`);
    }

    return definition;
  }

  private normalizeValue(
    definition: ProviderSettingDefinition,
    value: string | number | boolean | null | undefined,
  ): string {
    if (value === null || value === undefined || value === '') {
      throw new BadRequestException(`${definition.key} value is required`);
    }

    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new BadRequestException(`${definition.key} value is invalid`);
    }

    if (definition.type === 'boolean') {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }

      const normalized = String(value).trim().toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return 'true';
      }
      if (['false', '0', 'no', 'off'].includes(normalized)) {
        return 'false';
      }
      throw new BadRequestException(`${definition.key} must be a boolean`);
    }

    if (definition.type === 'number') {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue < 0) {
        throw new BadRequestException(`${definition.key} must be a positive number`);
      }
      return String(numericValue);
    }

    return String(value).trim();
  }

  private formatPlainValue(
    definition: ProviderSettingDefinition,
    value: string | null,
  ) {
    if (value === null) {
      return null;
    }

    if (definition.type === 'boolean') {
      return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
    }

    if (definition.type === 'number') {
      return Number(value);
    }

    return value;
  }

  private maskSecret(value: string | null): string | null {
    if (!value) {
      return null;
    }

    if (value.length <= 8) {
      return '********';
    }

    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private getEncryptionSecret(): string {
    const secret = this.configService.get<string>('SETTINGS_ENCRYPTION_KEY');

    if (!secret) {
      throw new BadRequestException('SETTINGS_ENCRYPTION_KEY is not configured');
    }

    return secret;
  }
}
