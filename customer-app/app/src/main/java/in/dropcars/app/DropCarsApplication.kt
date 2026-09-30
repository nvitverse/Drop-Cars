package in.dropcars.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp
import org.osmdroid.config.Configuration

@HiltAndroidApp
class DropCarsApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize osmdroid user agent configuration
        Configuration.getInstance().userAgentValue = packageName
    }
}
