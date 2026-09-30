package in.dropcars.app.ui.screens

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import in.dropcars.app.data.local.AuthTokenManager
import in.dropcars.app.data.model.UserRole
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(
    tokenManager: AuthTokenManager,
    onRoleSelected: (UserRole) -> Unit
) {
    LaunchedEffect(Unit) {
        delay(1200) // Splash animation delay
        val token = tokenManager.getToken()
        val role = tokenManager.getRole()

        if (!token.isNullOrEmpty() && role != UserRole.NONE) {
            onRoleSelected(role)
        } else {
            onRoleSelected(UserRole.NONE)
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Drop Cars",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.primary
            )
            CircularProgressIndicator(modifier = Modifier.align(Alignment.BottomCenter))
        }
    }
}
