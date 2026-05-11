interface GeneratedAudioPost {
  id: number;
  videoUrl: string;
  previewImageUrl?: string | null;
  generationParams?: any;
  publishTo?: any;
}

export class AudioNotificationPresenter {
  static generated(audio: GeneratedAudioPost) {
    return {
      uploadedVideoUrl: audio.videoUrl,
      id: audio.id,
      videoUrl: audio.videoUrl,
      previewImageUrl: audio.previewImageUrl,
      generationParams: audio.generationParams,
      publishTo: audio.publishTo,
    };
  }
}
