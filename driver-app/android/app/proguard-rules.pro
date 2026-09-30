# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# This app's custom native module (floating new-booking bubble overlay) -
# registered via reflection as a ReactPackage and referenced from
# AndroidManifest as a Service, both of which R8 can't always trace safely.
-keep class com.dropcars.driverapp.bubble.** { *; }
-keep class * implements com.facebook.react.bridge.ReactPackage { *; }
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod *;
}
