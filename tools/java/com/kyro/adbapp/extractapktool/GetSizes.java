package com.kyro.adbapp.extractapktool;

import android.content.Context;
import android.os.Looper;
import java.lang.reflect.Method;

public class GetSizes {
    public static void main(String[] args) {
        try {
            if (args.length == 0) return;

            if (Looper.myLooper() == null) Looper.prepare();

            Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
            Method systemMainMethod = activityThreadClass.getMethod("systemMain");
            Object activityThread = systemMainMethod.invoke(null);
            Method getSystemContextMethod = activityThreadClass.getMethod("getSystemContext");
            Context context = (Context) getSystemContextMethod.invoke(activityThread);

            System.out.println("[");

            for (int i = 0; i < args.length; i++) {
                String packageName = args[i];
                long dataSize = -1;
                long cacheSize = -1;

                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    try {
                        android.app.usage.StorageStatsManager storageStatsManager = (android.app.usage.StorageStatsManager) context.getSystemService(Context.STORAGE_STATS_SERVICE);
                        android.app.usage.StorageStats stats = storageStatsManager.queryStatsForPackage(
                                android.os.storage.StorageManager.UUID_DEFAULT, 
                                packageName, 
                                android.os.Process.myUserHandle()
                        );
                        dataSize = stats.getDataBytes();
                        cacheSize = stats.getCacheBytes();
                    } catch (Exception ignored) { }
                }

                if (i > 0) System.out.println(",");
                System.out.print("{\"package\": \"" + packageName + "\", \"dataSize\": " + dataSize + ", \"cacheSize\": " + cacheSize + "}");
            }

            System.out.println("\n]");
            System.exit(0);
        } catch (Exception e) {
            System.out.println("[{\"error\": \"" + e.getMessage() + "\"}]");
            System.exit(1);
        }
    }
}
