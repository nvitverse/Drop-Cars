package in.dropcars.app.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import coil.compose.rememberAsyncImagePainter
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess
import java.io.File
import java.io.FileOutputStream

@Composable
fun CameraCaptureCard(
    title: String,
    onImageCaptured: (File) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var selectedUri by remember { mutableStateOf<Uri?>(null) }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let {
            selectedUri = it
            // Save to temp file
            val tempFile = File.createTempFile("captured_img_", ".jpg", context.cacheDir)
            context.contentResolver.openInputStream(it)?.use { input ->
                FileOutputStream(tempFile).use { output ->
                    input.copyTo(output)
                }
            }
            onImageCaptured(tempFile)
        }
    }

    Card(
        modifier = modifier
            .fillMaxWidth()
            .clickable { launcher.launch("image/*") },
        shape = DropCarsTheme.CornerMd,
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = if (selectedUri != null) "Photo Selected" else "Tap to upload photo (Max 5MB)",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (selectedUri != null) GreenSuccess else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (selectedUri != null) {
                Image(
                    painter = rememberAsyncImagePainter(selectedUri),
                    contentDescription = title,
                    modifier = Modifier
                        .size(60.dp)
                        .clip(DropCarsTheme.CornerMd)
                        .border(2.dp, GreenSuccess, DropCarsTheme.CornerMd),
                    contentScale = ContentScale.Crop
                )
            } else {
                IconButton(onClick = { launcher.launch("image/*") }) {
                    Icon(
                        imageVector = Icons.Default.AddAPhoto,
                        contentDescription = "Upload Photo",
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }
        }
    }
}
