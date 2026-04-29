export interface GeneratedImagePostInput {
  prompt: string;
  ai_service: string;
  orientation?: 'horizontal' | 'vertical' | null;
  style_id?: number | null;
  color_id?: number | null;
}
