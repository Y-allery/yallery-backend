interface GeneratedVideoPost {
  id: number;
  videoUrl: string;
  previewImageUrl?: string | null;
  generationParams?: any;
  publishTo?: any;
}

export class VideoNotificationPresenter {
  static generated(video: GeneratedVideoPost) {
    return {
      uploadedVideoUrl: video.videoUrl,
      id: video.id,
      videoUrl: video.videoUrl,
      previewImageUrl: video.previewImageUrl,
      generationParams: video.generationParams,
      publishTo: video.publishTo,
    };
  }
}
