import { AppDataSource } from 'src/core/database/data-source';
import { ProviderRuntimeSettingEntity } from 'src/modules/provider-settings/entities/provider-runtime-setting.entity';
import { PROVIDER_SETTING_DEFINITIONS } from 'src/modules/provider-settings/provider-settings.catalog';
import { encryptProviderSettingValue } from 'src/modules/provider-settings/provider-settings.crypto';

async function main() {
  await AppDataSource.initialize();

  const repository = AppDataSource.getRepository(ProviderRuntimeSettingEntity);
  const encryptionSecret = process.env.SETTINGS_ENCRYPTION_KEY;
  const seededKeys: string[] = [];
  const skippedKeys: string[] = [];

  for (const definition of PROVIDER_SETTING_DEFINITIONS) {
    const value = process.env[definition.key];

    if (!value) {
      skippedKeys.push(definition.key);
      continue;
    }

    if (definition.isSecret && !encryptionSecret) {
      throw new Error(
        `SETTINGS_ENCRYPTION_KEY is required to seed ${definition.key}`,
      );
    }

    let row = await repository.findOne({ where: { key: definition.key } });
    if (!row) {
      row = repository.create();
      row.key = definition.key;
    }

    row.provider = definition.provider;
    row.group = definition.group;
    row.label = definition.label;
    row.type = definition.type;
    row.validationKind = definition.validationKind;
    row.isSecret = definition.isSecret;
    row.source = 'db';
    row.updatedById = null;

    if (definition.isSecret) {
      row.valueEncrypted = encryptProviderSettingValue(value, encryptionSecret!);
      row.valuePlain = null;
    } else {
      row.valueEncrypted = null;
      row.valuePlain = value;
    }

    await repository.save(row);
    seededKeys.push(definition.key);
  }

  console.log(
    JSON.stringify(
      {
        seededCount: seededKeys.length,
        skippedCount: skippedKeys.length,
        seededKeys,
      },
      null,
      2,
    ),
  );

  await AppDataSource.destroy();
}

main().catch(async (error) => {
  console.error(error?.message || error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
