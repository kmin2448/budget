import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { JWT } from 'next-auth/jwt';
import type { UserRole } from '@/types';

/** 액세스 토큰 갱신 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: String(token.refreshToken ?? ''),
      }),
    });
    const refreshed = await res.json() as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error?: string;
    };
    if (!res.ok || refreshed.error) throw new Error(refreshed.error ?? 'refresh failed');
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (err) {
    console.error('refreshAccessToken error:', err);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Drive.file: 앱이 생성한 파일만 접근 (최소 권한)
          scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== 'google') return false;
      if (!user.email) return false;
      try {
        const supabase = createServerSupabaseClient();
        const { error } = await supabase.from('users').upsert(
          { email: user.email, name: user.name ?? null },
          { onConflict: 'email', ignoreDuplicates: true },
        );
        if (error) { console.error('Supabase upsert error:', error); return false; }
        return true;
      } catch (err) {
        console.error('signIn callback error:', err);
        return false;
      }
    },

    async jwt({ token, user, account }) {
      // 최초 로그인: 토큰·만료시각·리프레시 토큰 저장
      if (account && user?.email) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : Date.now() + 3600 * 1000;
        try {
          const supabase = createServerSupabaseClient();
          const { data } = await supabase
            .from('users').select('id, role').eq('email', user.email).single();
          if (data) {
            token.sub = data.id;
            token.role = data.role;
            // 세부 권한 로드 (admin인 경우)
            if (data.role === 'admin') {
              const { data: perms } = await supabase
                .from('user_permissions')
                .select('permission')
                .eq('user_id', data.id);
              token.permissions = (perms ?? []).map((p) => p.permission);
            } else {
              token.permissions = [];
            }
          }
        } catch (err) {
          console.error('jwt callback error:', err);
        }
        return token;
      }
      // 토큰 유효하면 그대로 반환
      if (Date.now() < (token.accessTokenExpires as number ?? 0)) return token;
      // 만료 시 갱신
      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = token.role as UserRole | undefined;
        session.user.permissions = (token.permissions as string[] | undefined) ?? [];
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
});
