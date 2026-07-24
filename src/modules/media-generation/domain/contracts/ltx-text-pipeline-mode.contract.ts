export const LTX_TEXT_PIPELINE_MODE_SETTING_KEY =
  'LTX_TEXT_PIPELINE_MODE' as const;

export const LTX_TEXT_PIPELINE_MODES = ['native', 'cascade'] as const;

export type LtxTextPipelineMode = (typeof LTX_TEXT_PIPELINE_MODES)[number];

export const DEFAULT_LTX_TEXT_PIPELINE_MODE: LtxTextPipelineMode = 'native';

export const LTX_TEXT_PIPELINE_CASCADE_NOT_AVAILABLE_ERROR =
  'LTX_TEXT_PIPELINE_CASCADE_NOT_AVAILABLE';

export const LTX_TEXT_PIPELINE_INVALID_MODE_ERROR =
  'LTX_TEXT_PIPELINE_INVALID_MODE';

export function isLtxTextPipelineMode(
  value: unknown,
): value is LtxTextPipelineMode {
  return (
    typeof value === 'string' &&
    (LTX_TEXT_PIPELINE_MODES as readonly string[]).includes(value)
  );
}

export function parseLtxTextPipelineMode(value: unknown): LtxTextPipelineMode {
  if (!isLtxTextPipelineMode(value)) {
    throw new Error(LTX_TEXT_PIPELINE_INVALID_MODE_ERROR);
  }
  return value;
}
