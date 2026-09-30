package in.dropcars.app.ui.components

import android.view.ViewGroup
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import in.dropcars.app.ui.theme.Amber
import in.dropcars.app.ui.theme.DropCarsTheme
import in.dropcars.app.ui.theme.GreenSuccess
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker

@Composable
fun OsmMapView(
    modifier: Modifier = Modifier,
    pickupGeoPoint: GeoPoint = GeoPoint(13.0827, 80.2707), // Chennai
    dropGeoPoint: GeoPoint? = GeoPoint(12.9716, 77.5946),  // Bangalore
    driverGeoPoint: GeoPoint? = null,
    bearing: Float = 0f,
    isTrackingActive: Boolean = true,
    isTrackingEnabledByAdmin: Boolean = true,
    zoomLevel: Double = 9.0
) {
    Box(modifier = modifier.fillMaxWidth().height(260.dp)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { context ->
                MapView(context).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    setTileSource(TileSourceFactory.MAPNIK)
                    setMultiTouchControls(true)
                    controller.setZoom(zoomLevel)
                    controller.setCenter(driverGeoPoint ?: pickupGeoPoint)

                    // Pickup Marker
                    val pickupMarker = Marker(this).apply {
                        position = pickupGeoPoint
                        title = "Pickup Location"
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                    }
                    overlays.add(pickupMarker)

                    // Drop Marker
                    if (dropGeoPoint != null) {
                        val dropMarker = Marker(this).apply {
                            position = dropGeoPoint
                            title = "Drop Location"
                            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                        }
                        overlays.add(dropMarker)
                    }
                }
            },
            update = { mapView ->
                val centerPoint = driverGeoPoint ?: pickupGeoPoint
                mapView.controller.setCenter(centerPoint)

                // Update or add driver marker with bearing rotation
                if (driverGeoPoint != null) {
                    val driverMarker = Marker(mapView).apply {
                        position = driverGeoPoint
                        title = "Driver"
                        rotation = bearing
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    }
                    mapView.overlays.add(driverMarker)
                }
            }
        )

        // Status Badge Overlay
        val (badgeText, badgeBg, badgeTextColor) = when {
            !isTrackingEnabledByAdmin -> Triple("⚠️ Milestone Progress Mode", Amber.copy(alpha = 0.9f), Color.Black)
            isTrackingActive -> Triple("🟢 Live Tracking Active", GreenSuccess.copy(alpha = 0.9f), Color.White)
            else -> Triple("⚪ Live Tracking Paused (Background)", Color.DarkGray.copy(alpha = 0.9f), Color.White)
        }

        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(12.dp)
                .background(badgeBg, shape = DropCarsTheme.CornerMd)
                .padding(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Text(
                text = badgeText,
                style = MaterialTheme.typography.labelLarge,
                color = badgeTextColor
            )
        }
    }
}
