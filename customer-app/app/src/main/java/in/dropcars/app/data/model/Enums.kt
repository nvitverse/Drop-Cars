package in.dropcars.app.data.model

import com.google.gson.annotations.SerializedName

enum class OrderType(val value: String) {
    @SerializedName("Oneway")
    ONEWAY("Oneway"),

    @SerializedName("Round Trip")
    ROUND_TRIP("Round Trip"),

    @SerializedName("Hourly Rental")
    HOURLY_RENTAL("Hourly Rental"),

    @SerializedName("Multy City")
    MULTY_CITY("Multy City")
}

enum class CarType(val value: String) {
    @SerializedName("HATCHBACK")
    HATCHBACK("HATCHBACK"),

    @SerializedName("SEDAN_4_PLUS_1")
    SEDAN_4_PLUS_1("SEDAN_4_PLUS_1"),

    @SerializedName("NEW_SEDAN_2022_MODEL")
    NEW_SEDAN_2022_MODEL("NEW_SEDAN_2022_MODEL"),

    @SerializedName("ETIOS_4_PLUS_1")
    ETIOS_4_PLUS_1("ETIOS_4_PLUS_1"),

    @SerializedName("SUV")
    SUV("SUV"),

    @SerializedName("SUV_6_PLUS_1")
    SUV_6_PLUS_1("SUV_6_PLUS_1"),

    @SerializedName("SUV_7_PLUS_1")
    SUV_7_PLUS_1("SUV_7_PLUS_1"),

    @SerializedName("INNOVA")
    INNOVA("INNOVA"),

    @SerializedName("INNOVA_6_PLUS_1")
    INNOVA_6_PLUS_1("INNOVA_6_PLUS_1"),

    @SerializedName("INNOVA_CRYSTA_7_PLUS_1")
    INNOVA_CRYSTA_7_PLUS_1("INNOVA_CRYSTA_7_PLUS_1")
}

enum class TripStatus {
    PENDING, PENDING_ADMIN_DISPATCH, BROADCAST_TO_DRIVERS, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED, AUTO_CANCELLED
}

enum class DriverStatus {
    ONLINE, OFFLINE, DRIVING, BLOCKED, PROCESSING
}

enum class AccountStatus {
    Active, Inactive, Pending
}

enum class AssignmentStatus {
    PENDING, ACCEPTED, IN_PROGRESS, COMPLETED, CANCELLED
}

enum class SendTo {
    ALL, NEAR_CITY
}

enum class CarStatus {
    ONLINE, DRIVING, BLOCKED, PROCESSING
}

enum class UserRole(val value: String) {
    CUSTOMER("customer"),
    VENDOR("vendor"),
    VEHICLE_OWNER("vehicle_owner"),
    DRIVER("driver"),
    ADMIN("admin"),
    NONE("none")
}

enum class BookingRecipientMode {
    BOOK_FOR_ME,
    BOOK_FOR_OTHERS
}
