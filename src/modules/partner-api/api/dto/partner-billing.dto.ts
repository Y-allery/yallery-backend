import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsPositive, Max, Min } from 'class-validator';

/** Nobody tops up a hundred thousand dollars by accident, and a typo that does is ours to stop. */
const MAX_TOPUP_USD = 5000;

export class PartnerTopUpDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(MAX_TOPUP_USD)
  amountUsd: number;
}

export class PartnerAutoRechargeDto {
  @IsBoolean()
  enabled: boolean;

  /** Charge the card once the balance drops below this. */
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_TOPUP_USD)
  thresholdUsd: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @Max(MAX_TOPUP_USD)
  amountUsd: number;
}
