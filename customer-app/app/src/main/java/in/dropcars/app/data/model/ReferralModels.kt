package in.dropcars.app.data.model

data class ReferralStatsResponse(
    val referral_code: String = "RAJAN100",
    val total_referrals: Int = 0,
    val pending_referrals: Int = 0,
    val total_rewards_earned: Double = 0.0,
    val reward_per_referral: Double = 100.0
)

data class FlashOfferResponse(
    val id: String,
    val code: String,
    val title: String,
    val description: String,
    val discount_amount: Double,
    val from_city: String? = null,
    val to_city: String? = null,
    val remaining_claims: Int = 50,
    val expiry_timestamp: Long = 0L
)
