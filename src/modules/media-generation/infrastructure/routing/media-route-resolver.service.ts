import { Injectable } from '@nestjs/common';
import { MediaGenerationRoute } from 'src/modules/media-generation/domain/contracts/media-generation-route.contract';
import { ProviderRuntimeConfigService } from 'src/modules/provider-settings/provider-runtime-config.service';
import {
  getRunpodMediaRoute,
  MediaRouteCatalogEntry,
  MediaRouteType,
  RUNPOD_MEDIA_ROUTE_CATALOG,
} from 'src/modules/media-generation/infrastructure/routing/media-route.catalog';

@Injectable()
export class MediaRouteResolverService {
  constructor(
    private readonly providerRuntimeConfigService: ProviderRuntimeConfigService,
  ) {}

  resolvePromptImageRoute(
    aiService: string,
  ): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'promptImage');
  }

  resolveImageEditRoute(
    aiService: string,
  ): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'imageEdit');
  }

  resolveAudioRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'audio');
  }

  resolveTextVideoRoute(
    aiService: string,
  ): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'textVideo');
  }

  resolveImageVideoRoute(
    aiService: string,
  ): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'imageVideo');
  }

  resolveMemeRoute(aiService: string): Promise<MediaGenerationRoute | null> {
    return this.resolveRoute(aiService, 'meme');
  }

  async describeRoutes() {
    const routes = await Promise.all(
      RUNPOD_MEDIA_ROUTE_CATALOG.map((entry) =>
        this.resolveRoute(entry.aiService, entry.routeType),
      ),
    );

    return routes.filter(Boolean);
  }

  private async resolveRoute(
    aiService: string,
    routeType: MediaRouteType,
  ): Promise<MediaGenerationRoute | null> {
    const entry = getRunpodMediaRoute(aiService, routeType);

    if (!entry || !(await this.isRouteEnabled(entry))) {
      return null;
    }

    const endpointId = await this.providerRuntimeConfigService.getString(
      entry.endpointConfigKey,
    );

    return {
      capability: entry.capability,
      provider: entry.provider,
      dispatch: entry.dispatch,
      aiService: entry.aiService,
      endpointId,
      queueName: entry.queueName,
    };
  }

  private async isRouteEnabled(
    entry: MediaRouteCatalogEntry,
  ): Promise<boolean> {
    const isEnabled = entry.enabledConfigKey
      ? await this.providerRuntimeConfigService.getBoolean(
          entry.enabledConfigKey,
          true,
        )
      : true;

    if (!isEnabled) {
      return false;
    }

    const [apiKey, endpointId] = await Promise.all([
      this.providerRuntimeConfigService.getString('RUNPOD_API_KEY'),
      this.providerRuntimeConfigService.getString(entry.endpointConfigKey),
    ]);

    return Boolean(apiKey && endpointId);
  }
}
