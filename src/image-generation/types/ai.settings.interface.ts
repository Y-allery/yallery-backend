export interface AISettings {
  name: string;
  allowedOrientations: string[];
  minImages: number;
  maxImages: number;
  maxPromptLength: number;
  qualityOptions?: string[];
  sizes: string[];
  styles?: string[];
  id: string;
  is_artem?: boolean;
}
