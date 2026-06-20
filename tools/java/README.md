# Java daemons for ADB App

This folder contains the original Java source code for the daemons that run on the Android device through `app_process`.

## How do you compile these files into a .jar?
If you make changes to the `.java` files, you need to compile them into a format that the Android virtual machine (Dalvik/ART) can understand (`classes.dex`), and then package them into a `.jar`.

To compile them, you need the Android SDK, specifically `android.jar` and `d8` or `dx`.

Manual compilation example for `info_apps.jar`:
```powershell
$ANDROID_JAR = "%USERPROFILE%\AppData\Local\Android\Sdk\platforms\android-34\android.jar"
$D8_PATH = "%USERPROFILE%\AppData\Local\Android\Sdk\build-tools\34.0.0\d8.bat"

# 1. Compile from .java to .class
javac -cp $ANDROID_JAR src\com\kyro\adbapp\extractapktool\Main.java

# 2. Convert .class to classes.dex
& $D8_PATH src\com\kyro\adbapp\extractapktool\Main.class

# 3. Package into the final .jar
jar cvf info_apps.jar classes.dex

# Clean up
Remove-Item classes.dex
```
*(Note: Adjust the paths according to where you have the Android SDK installed).* 
