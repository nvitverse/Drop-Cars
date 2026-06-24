package `in`.dropcars.app.ui.home

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import `in`.dropcars.app.databinding.ItemVehicleBinding
import `in`.dropcars.app.model.Pricing

class VehicleAdapter(
    private val items: List<Pricing>,
    private val onSelect: (Pricing) -> Unit,
) : RecyclerView.Adapter<VehicleAdapter.VH>() {

    private var selectedPos = 0

    inner class VH(val binding: ItemVehicleBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(ItemVehicleBinding.inflate(LayoutInflater.from(parent.context), parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.binding.apply {
            tvVehicleLabel.text = item.vehicleLabel
            tvVehicleExamples.text = item.vehicleExamples ?: ""
            tvVehicleCapacity.text = "${item.capacity} seats"
            tvBasefare.text = "From ₹${item.minimumFare.toInt()}"
            root.isSelected = position == selectedPos
            root.setOnClickListener {
                val prev = selectedPos
                selectedPos = holder.bindingAdapterPosition
                notifyItemChanged(prev)
                notifyItemChanged(selectedPos)
                onSelect(item)
            }
        }
    }
}
