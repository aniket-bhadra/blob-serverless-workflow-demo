
export const DUMMY_USER_ID = "user_dummy123";

export async function getUserId() {
  return DUMMY_USER_ID;
}



// in Production
//   import { auth } from "@clerk/nextjs/server";
//   export async function getUserId() { const { userId } = await auth(); return userId; }
