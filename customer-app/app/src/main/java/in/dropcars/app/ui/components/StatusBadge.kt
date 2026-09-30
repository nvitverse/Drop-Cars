package in.dropcars.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import in.dropcars.app.ui.theme.Amber
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess
import in.dropcars.app.ui.theme.RedDanger

@Composable
fun StatusBadge(
    status: String,
    modifier: Modifier = Modifier
) {
    val (backgroundColor, textColor) = when (status.uppercase()) {
        "PENDING", "PROCESSING" -> Pair(Amber.copy(alpha = 0.2f), Amber)
        "ACCEPTED", "ONLINE", "ACTIVE", "COMPLETED", "VERIFIED" -> Pair(GreenSuccess.copy(alpha = 0.2f), GreenSuccess)
        "CANCELLED", "BLOCKED", "REJECTED", "OFFLINE" -> Pair(RedDanger.copy(alpha = 0.2f), RedDanger)
        "IN_PROGRESS", "DRIVING" -> Pair(MaterialTheme.colorScheme.primary.copy(alpha = 0.2f), MaterialTheme.colorScheme.primary)
        else -> Pair(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant)
    }

    Box(
        modifier = modifier
            .background(backgroundColor, shape = DropCarsTheme.CornerMd)
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(
            text = status,
            style = MaterialTheme.typography.labelLarge,
            color = textColor
        )
    }
}
