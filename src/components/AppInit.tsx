"use client";

import { useEffect } from "react";
import { startOfflineQueueProcessor } from "@/lib/offlineQueue";

export default function AppInit() {
  useEffect(() => {
    startOfflineQueueProcessor();
  }, []);

  return null;
}
