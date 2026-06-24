package `in`.dropcars.app.ui.history

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import `in`.dropcars.app.databinding.ItemBookingBinding
import `in`.dropcars.app.model.Booking

class HistoryAdapter : ListAdapter<Booking, HistoryAdapter.VH>(DIFF) {

    inner class VH(val binding: ItemBookingBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemBookingBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun onBindViewHolder(holder: VH, position: Int) {
        val b = getItem(position)
        holder.binding.apply {
            tvPickupHistory.text = b.pickup.address
            tvDropHistory.text = b.destination.address
            tvFareHistory.text = "₹${b.fare.total.toInt()}"
            tvStatusHistory.text = b.status.replace("-", " ").uppercase()
            tvDateHistory.text = b.createdAt.take(10)
            tvVehicleHistory.text = "${b.vehicleType.replaceFirstChar { it.uppercase() }} • ${b.tripType.replace("-", " ")}"
        }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<Booking>() {
            override fun areItemsTheSame(a: Booking, b: Booking) = a.id == b.id
            override fun areContentsTheSame(a: Booking, b: Booking) = a == b
        }
    }
}
