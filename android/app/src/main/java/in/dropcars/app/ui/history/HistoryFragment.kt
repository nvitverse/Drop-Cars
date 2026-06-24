package `in`.dropcars.app.ui.history

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import `in`.dropcars.app.databinding.FragmentHistoryBinding
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HistoryFragment : Fragment() {

    private var _binding: FragmentHistoryBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HistoryViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHistoryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val adapter = HistoryAdapter()
        binding.rvHistory.adapter = adapter

        lifecycleScope.launch {
            viewModel.bookings.collect { res ->
                when (res) {
                    is Resource.Loading -> binding.progressHistory.visibility = View.VISIBLE
                    is Resource.Success -> {
                        binding.progressHistory.visibility = View.GONE
                        adapter.submitList(res.data.bookings)
                        binding.tvEmpty.visibility = if (res.data.bookings.isEmpty()) View.VISIBLE else View.GONE
                    }
                    is Resource.Error -> {
                        binding.progressHistory.visibility = View.GONE
                        binding.tvEmpty.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
