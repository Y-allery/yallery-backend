import { Injectable } from '@nestjs/common';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  getRunpodMediaRoute,
  MediaRouteType,
} from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';

@Injectable()
export class RunpodTimeoutPolicyService {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  async getStatusTimeoutMs(
    aiService: string,
    routeType: MediaRouteType,
  ): Promise<number> {
    const route = getRunpodMediaRoute(aiService, routeType);

    if (
      !route?.statusTimeoutConfigKey ||
      route.defaultStatusTimeoutMs === undefined
    ) {
      throw new Error(
        `RunPod status timeout is not configured for ${aiService}`,
      );
    }

    return (
      (await this.providerRuntimeConfigService.getNumber(
        route.statusTimeoutConfigKey,
      )) ?? route.defaultStatusTimeoutMs
    );
  }
}
