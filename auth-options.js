import GoogleProvider from "next-auth/providers/google";
import { isAllowedGoogleProfile } from "@/lib/auth-policy";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ profile }) {
      return isAllowedGoogleProfile(profile, process.env.APP_ALLOWED_EMAIL);
    },
  },
};
