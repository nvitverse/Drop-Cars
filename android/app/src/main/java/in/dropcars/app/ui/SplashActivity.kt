package `in`.dropcars.app.ui

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import `in`.dropcars.app.ui.auth.AuthActivity
import `in`.dropcars.app.utils.PrefsManager
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class SplashActivity : AppCompatActivity() {

    @Inject lateinit var prefs: PrefsManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val dest = if (prefs.isLoggedIn()) MainActivity::class.java else AuthActivity::class.java
        startActivity(Intent(this, dest))
        finish()
    }
}
