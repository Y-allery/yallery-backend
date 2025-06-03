export interface User {
  id: number;
  email: string;
}
export interface AuthenticatedRequest extends Request {
  user: User;
}
