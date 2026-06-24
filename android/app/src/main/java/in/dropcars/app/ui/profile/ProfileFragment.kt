package `in`.dropcars.app.ui.profile

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import `in`.dropcars.app.databinding.FragmentProfileBinding
import `in`.dropcars.app.ui.auth.AuthActivity
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.launch

@AndroidEntryPoint
class ProfileFragment : Fragment() {

    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ProfileViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnSave.setOnClickListener {
            val name = binding.etName.text.toString().trim()
            val email = binding.etEmail.text.toString().trim().ifBlank { null }
            if (name.isBlank()) { toast("Name is required"); return@setOnClickListener }
            viewModel.updateProfile(name, email)
        }

        binding.btnLogout.setOnClickListener {
            viewModel.logout()
            startActivity(Intent(requireContext(), AuthActivity::class.java))
            requireActivity().finish()
        }

        lifecycleScope.launch {
            viewModel.user.collect { res ->
                if (res is Resource.Success) {
                    binding.etName.setText(res.data.name)
                    binding.etEmail.setText(res.data.email ?: "")
                    binding.tvPhone.text = res.data.phone
                    binding.tvTotalRides.text = "Total rides: ${res.data.totalRides}"
                }
            }
        }

        lifecycleScope.launch {
            viewModel.updateState.collect { res ->
                when (res) {
                    is Resource.Loading -> binding.btnSave.isEnabled = false
                    is Resource.Success -> { binding.btnSave.isEnabled = true; toast("Profile updated") }
                    is Resource.Error -> { binding.btnSave.isEnabled = true; toast(res.message) }
                }
            }
        }
    }

    private fun toast(msg: String) = Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
