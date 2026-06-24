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
import androidx.navigation.fragment.findNavController
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.PhoneAuthCredential
import com.google.firebase.auth.PhoneAuthOptions
import com.google.firebase.auth.PhoneAuthProvider
import dagger.hilt.android.AndroidEntryPoint
import `in`.dropcars.app.R
import `in`.dropcars.app.databinding.FragmentLoginBinding
import `in`.dropcars.app.ui.MainActivity
import `in`.dropcars.app.utils.Resource
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

@AndroidEntryPoint
class LoginFragment : Fragment() {

    private var _binding: FragmentLoginBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AuthViewModel by viewModels()
    private lateinit var auth: FirebaseAuth
    private var verificationId: String? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentLoginBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        auth = FirebaseAuth.getInstance()

        binding.btnSendOtp.setOnClickListener {
            val phone = binding.etPhone.text.toString().trim()
            if (phone.length < 10) { toast("Enter valid phone number"); return@setOnClickListener }
            sendOtp("+91$phone")
        }

        binding.btnVerifyOtp.setOnClickListener {
            val otp = binding.etOtp.text.toString().trim()
            val vid = verificationId ?: return@setOnClickListener
            val credential = PhoneAuthProvider.getCredential(vid, otp)
            signInWithCredential(credential)
        }

        binding.tvRegister.setOnClickListener {
            findNavController().navigate(R.id.action_login_to_register)
        }

        observeLogin()
    }

    private fun sendOtp(phone: String) {
        binding.btnSendOtp.isEnabled = false
        binding.progressOtp.visibility = View.VISIBLE
        val options = PhoneAuthOptions.newBuilder(auth)
            .setPhoneNumber(phone)
            .setTimeout(60L, TimeUnit.SECONDS)
            .setActivity(requireActivity())
            .setCallbacks(object : PhoneAuthProvider.OnVerificationStateChangedCallbacks() {
                override fun onVerificationCompleted(credential: PhoneAuthCredential) {
                    signInWithCredential(credential)
                }
                override fun onVerificationFailed(e: com.google.firebase.FirebaseException) {
                    toast("OTP failed: ${e.message}")
                    binding.btnSendOtp.isEnabled = true
                    binding.progressOtp.visibility = View.GONE
                }
                override fun onCodeSent(vid: String, token: PhoneAuthProvider.ForceResendingToken) {
                    verificationId = vid
                    binding.layoutOtp.visibility = View.VISIBLE
                    binding.progressOtp.visibility = View.GONE
                    toast("OTP sent")
                }
            }).build()
        PhoneAuthProvider.verifyPhoneNumber(options)
    }

    private fun signInWithCredential(credential: PhoneAuthCredential) {
        auth.signInWithCredential(credential).addOnCompleteListener { task ->
            if (task.isSuccessful) {
                val phone = auth.currentUser?.phoneNumber ?: ""
                val uid = auth.currentUser?.uid ?: ""
                viewModel.login(phone.removePrefix("+91"), uid)
            } else {
                toast("OTP verification failed")
            }
        }
    }

    private fun observeLogin() {
        lifecycleScope.launch {
            viewModel.loginState.collect { res ->
                when (res) {
                    is Resource.Loading -> binding.progressOtp.visibility = View.VISIBLE
                    is Resource.Success -> {
                        binding.progressOtp.visibility = View.GONE
                        startActivity(Intent(requireContext(), MainActivity::class.java))
                        requireActivity().finish()
                    }
                    is Resource.Error -> {
                        binding.progressOtp.visibility = View.GONE
                        if (res.message.contains("not found", ignoreCase = true)) {
                            findNavController().navigate(R.id.action_login_to_register)
                        } else toast(res.message)
                    }
                }
            }
        }
    }

    private fun toast(msg: String) = Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
