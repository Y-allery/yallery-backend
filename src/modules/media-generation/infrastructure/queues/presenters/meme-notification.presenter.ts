interface GeneratedMemePost {
  id: number;
  videoUrl: string;
  previewImageUrl?: string | null;
  generationParams?: any;
  publishTo?: any;
}

export class MemeNotificationPresenter {
  static started(jobId: string) {
    return {
      jobId,
      status: 'started',
      message: 'Meme generation started',
    };
  }

  static generated(meme: GeneratedMemePost) {
    return {
      id: meme.id,
      videoUrl: meme.videoUrl,
      previewImageUrl: meme.previewImageUrl,
      generationParams: meme.generationParams,
      publishTo: meme.publishTo,
    };
  }

  static failed(jobId: string, error: string) {
    return {
      jobId,
      error,
    };
  }
}
