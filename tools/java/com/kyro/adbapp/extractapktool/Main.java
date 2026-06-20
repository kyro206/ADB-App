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
            String packageName = args[0];

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
            ApplicationInfo appInfo = pm.getApplicationInfo(packageName, 0);
            
            // Obtener nombre e icono (Soporta App Bundles automáticamente)
            String label = pm.getApplicationLabel(appInfo).toString();
            Drawable icon = pm.getApplicationIcon(appInfo);

            int width = Math.max(icon.getIntrinsicWidth(), 1);
            int height = Math.max(icon.getIntrinsicHeight(), 1);
            // Estandarizar tamaño para que el base64 no sea gigante
            if (width > 192) width = 192;
            if (height > 192) height = 192;

            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            icon.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
            icon.draw(canvas);

            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, outputStream);
            String base64Icon = Base64.encodeToString(outputStream.toByteArray(), Base64.NO_WRAP);

            // Escapar y generar el JSON directamente a la salida estándar
            String safeLabel = label.replace("\"", "\\\"").replace("\n", "");
            System.out.println("{\"label\": \"" + safeLabel + "\", \"icon\": \"data:image/png;base64," + base64Icon + "\"}");
            
            System.exit(0);
        } catch (Exception e) {
            System.out.println("{\"error\": \"" + e.getMessage() + "\"}");
            System.exit(1);
        }
    }
}