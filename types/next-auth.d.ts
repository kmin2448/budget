import { DefaultSession } from 'next-auth';
import type { UserRole } from '@/types';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string;
    user: DefaultSession['user'] & {
      id?: string;
      role?: UserRole;
      permissions?: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    role?: string;
    permissions?: string[];
    error?: string;
  }
}
