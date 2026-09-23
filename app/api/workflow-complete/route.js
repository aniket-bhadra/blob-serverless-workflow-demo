import { NextResponse } from "next/server";

export async function POST(request) {
  const data = await request.json();
  console.log("Workflow finished — server notified:", data);
  return NextResponse.json({ received: true });
}
