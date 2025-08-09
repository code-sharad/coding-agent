import { NextResponse } from "next/server";

export async function GET() {
  // Mock repos
  const repos = [
    { id: 1, full_name: "octo-org/frontend" },
    { id: 2, full_name: "octo-org/api" },
    { id: 3, full_name: "ram/coding-agent" },
  ];
  return NextResponse.json({ repos });
}
