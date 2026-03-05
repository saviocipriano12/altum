"use client";

import { auth } from "@/firebaseConfig";

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

