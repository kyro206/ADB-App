package com.kyro.adbapp.extractapktool;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;

public class Main {
    public static void main(String[] args) {
        try {
            if (args.length == 0) return;

            // Inicializar el hilo principal para el entorno shell
            if (Looper.myLooper() == null) Looper.prepare();

            // Usar reflexión para obtener el Contexto de Android desde la consola
            Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
            Method systemMainMethod = activityThreadClass.getMethod("systemMain");
            Object activityThread = systemMainMethod.invoke(null);
            Method getSystemContextMethod = activityThreadClass.getMethod("getSystemContext");
            Context context = (Context) getSystemContextMethod.invoke(activityThread);

            // Consultar el PackageManager nativo
            PackageManager pm = context.getPackageManager();

            System.out.println("[");

            for (int i = 0; i < args.length; i++) {
                String packageName = args[i];
                try {
                    ApplicationInfo appInfo = pm.getApplicationInfo(packageName, 0);
                    
                    // Obtener nombre e icono
                    String label = pm.getApplicationLabel(appInfo).toString();
                    Drawable icon = pm.getApplicationIcon(appInfo);

                    int width = Math.max(icon.getIntrinsicWidth(), 1);
                    int height = Math.max(icon.getIntrinsicHeight(), 1);
                    if (width > 192) width = 192;
                    if (height > 192) height = 192;

                    Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                    Canvas canvas = new Canvas(bitmap);
                    icon.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                    icon.draw(canvas);

                    ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                    bitmap.compress(Bitmap.CompressFormat.WEBP, 100, outputStream);
                    String base64Icon = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP);

                    String safeLabel = label.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "");
                    
                    if (i > 0) System.out.println(",");
                    System.out.print("{\"package\": \"" + packageName + "\", \"label\": \"" + safeLabel + "\", \"icon\": \"data:image/webp;base64," + base64Icon + "\"}");
                } catch (Exception e) {
                    if (i > 0) System.out.println(",");
                    String safeError = e.getMessage() != null ? e.getMessage().replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "") : "Unknown Error";
                    System.out.print("{\"package\": \"" + packageName + "\", \"error\": \"" + safeError + "\"}");
                }
            }

            System.out.println("\n]");
            System.exit(0);
        } catch (Exception e) {
            System.out.println("{\"error\": \"" + e.getMessage() + "\"}");
            System.exit(1);
        }
    }
}