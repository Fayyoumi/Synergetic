import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Makes `email` a confirmed admin (creating the account if needed) and returns
 * a one-time sign-in token hash for /auth/callback. Service-role client only.
 * Used by `npm run admin:make` and the e2e tests.
 */
export async function ensureAdmin(db: SupabaseClient, email: string): Promise<{ userId: string; tokenHash: string }> {
  let userId: string | null = null;
  const created = await db.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) userId = created.data.user.id;
  else {
    // Already exists: find it and make sure it's confirmed (an unconfirmed user gets "signup" tokens).
    for (let page = 1; !userId && page < 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      userId = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id ?? null;
      if (data.users.length < 200) break;
    }
    if (!userId) throw created.error ?? new Error("user not found");
    await db.auth.admin.updateUserById(userId, { email_confirm: true });
  }
  const { error } = await db.from("profiles").update({ is_admin: true }).eq("id", userId);
  if (error) throw error;
  const link = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw link.error;
  return { userId, tokenHash: link.data.properties.hashed_token };
}
