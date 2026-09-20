import { betterAuth } from "better-auth";
import { magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { Resend } from "resend";
import { db } from "@/lib/db";
import * as schema from "@/db/schema";

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set in .env");
  }
  return new Resend(process.env.RESEND_API_KEY);
}
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await getResend().emails.send({
          from: "AI CSV Analyzer <login@mail.eugenecode.online>",
          to: email,
          subject: "Sign in to AI CSV Analyzer",
          text: `Click the link to sign in: ${url}`,
        });
      },
    }),
  ],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
});
