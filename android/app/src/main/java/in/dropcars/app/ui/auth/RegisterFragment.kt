package `in`.dropcars.app.ui.auth

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
import `in`.dropcars.app.databinding.FragmentRegisterBinding
import `in`.dropcars.app.ui.MainActivity
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.launch

@AndroidEntryPoint
class RegisterFragment : Fragment() {

    private var _binding: FragmentRegisterBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AuthViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentRegisterBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnRegister.setOnClickListener {
            val name = binding.etName.text.toString().trim()
            val phone = binding.etPhone.text.toString().trim()
            val email = binding.etEmail.text.toString().trim().ifBlank { null }
            if (name.isBlank() || phone.length < 10) { toast("Fill all required fields"); return@setOnClickListener }
            viewModel.register(name, phone, email, null)
        }

        lifecycleScope.launch {
            viewModel.registerState.collect { res ->
                when (res) {
                    is Resource.Loading -> binding.btnRegister.isEnabled = false
                    is Resource.Success -> {
                        binding.btnRegister.isEnabled = true
                        startActivity(Intent(requireContext(), MainActivity::class.java))
                        requireActivity().finish()
                    }
                    is Resource.Error -> {
                        binding.btnRegister.isEnabled = true
                        toast(res.message)
                    }
                }
            }
        }
    }

    private fun toast(msg: String) = Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
