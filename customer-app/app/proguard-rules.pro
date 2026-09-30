# Proguard Rules for Drop Cars Android App

# Retrofit & Gson
-keepattributes Signature
-keepattributes *Annotation*
-keep class com.squareup.retrofit2.** { *; }
-keep class in.dropcars.app.data.model.** { *; }

# Room
-keep class * extends androidx.room.RoomDatabase
-dontwarn androidx.room.paging.**

# Razorpay SDK
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**

# osmdroid
-keep class org.osmdroid.** { *; }
