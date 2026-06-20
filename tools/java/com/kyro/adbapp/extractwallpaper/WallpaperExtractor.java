package com.kyro.adbapp.extractwallpaper;

import android.app.WallpaperManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.pm.ApplicationInfo;
import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.lang.reflect.Field;
import android.util.Base64;

public class WallpaperExtractor {
    public static void main(String[] args) {
        boolean maxRes = args.length > 0 && "--max-res".equals(args[0]);
        try {
            Looper.prepareMainLooper();
            
            // 1. Bypass Hidden API (CRÍTICO para poder hackear mContext sin que Android lo bloquee)
            try {
                Class<?> vmRuntimeClass = Class.forName("dalvik.system.VMRuntime");
                Method getRuntimeMethod = vmRuntimeClass.getDeclaredMethod("getRuntime");
                Object vmRuntime = getRuntimeMethod.invoke(null);
                Method setExemptions = vmRuntimeClass.getDeclaredMethod("setHiddenApiExemptions", String[].class);
                setExemptions.invoke(vmRuntime, new Object[]{new String[]{"L"}});
            } catch (Exception e) {
                // Si falla en versiones antiguas, simplemente continuamos
            }

            // 2. Obtener Contexto del Sistema
            Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
            Method systemMainMethod = activityThreadClass.getMethod("systemMain");
            Object activityThread = systemMainMethod.invoke(null);
            
            Method getSystemContextMethod = activityThreadClass.getMethod("getSystemContext");
            Context sysContext = (Context) getSystemContextMethod.invoke(activityThread);
            
            // 3. Crear un ContextWrapper más robusto que miente en todo lo posible
            ContextWrapper spoofContext = new ContextWrapper(sysContext) {
                @Override
                public String getOpPackageName() { 
                    return "com.android.shell"; 
                }
                @Override
                public String getPackageName() { 
                    return "com.android.shell"; 
                }
                @Override
                public ApplicationInfo getApplicationInfo() {
                    // Mentimos también en la ApplicationInfo (necesario en Android 12+)
                    ApplicationInfo info = new ApplicationInfo(super.getApplicationInfo());
                    info.packageName = "com.android.shell";
                    info.uid = 2000; // UID de shell de ADB
                    return info;
                }
            };
            
            // 4. Obtenemos el WallpaperManager del contexto real
            WallpaperManager wm = (WallpaperManager) sysContext.getSystemService(Context.WALLPAPER_SERVICE);
            
            // 5. Inyectamos nuestro spoofContext a la fuerza usando reflexión (tu idea original)
            Field mContextField = WallpaperManager.class.getDeclaredField("mContext");
            mContextField.setAccessible(true);
            mContextField.set(wm, spoofContext);
            
            // 6. Intentar extraer el archivo original de máxima resolución si se solicita explícitamente
            if (maxRes) {
                try {
                    android.os.ParcelFileDescriptor pfd = wm.getWallpaperFile(WallpaperManager.FLAG_SYSTEM);
                    if (pfd != null) {
                        java.io.FileInputStream fis = new java.io.FileInputStream(pfd.getFileDescriptor());
                        ByteArrayOutputStream bosFile = new ByteArrayOutputStream();
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = fis.read(buffer)) != -1) {
                            bosFile.write(buffer, 0, read);
                        }
                        fis.close();
                        pfd.close();
                        byte[] fileData = bosFile.toByteArray();
                        String base64 = Base64.encodeToString(fileData, Base64.NO_WRAP);
                        System.out.println("WALLPAPER_START");
                        System.out.println(base64);
                        System.out.println("WALLPAPER_END");
                        System.exit(0);
                    }
                } catch (Exception e) {
                    // Ignore and fallback to getDrawable
                }
            }
            
            // 7. Extraer y procesar (Fallback / Default)
            Drawable drawable = wm.getDrawable();
            
            if (drawable == null) {
                System.out.println("ERROR: No se encontró wallpaper.");
                System.exit(1);
            }
            
            int width = drawable.getIntrinsicWidth();
            int height = drawable.getIntrinsicHeight();
            if (width <= 0 || height <= 0) { width = 1080; height = 1920; }
            
            Bitmap bitmap;
            if (drawable instanceof BitmapDrawable) {
                bitmap = ((BitmapDrawable) drawable).getBitmap();
            } else {
                bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
                Canvas canvas = new Canvas(bitmap);
                drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
                drawable.draw(canvas);
            }
            
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, bos);
            byte[] bitmapData = bos.toByteArray();
            String base64 = Base64.encodeToString(bitmapData, Base64.NO_WRAP);
            
            System.out.println("WALLPAPER_START");
            System.out.println(base64);
            System.out.println("WALLPAPER_END");
            
            System.exit(0);
        } catch (Exception e) {
            System.out.println("ERROR: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
