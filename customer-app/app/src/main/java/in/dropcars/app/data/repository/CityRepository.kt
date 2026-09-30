package in.dropcars.app.data.repository

import in.dropcars.app.data.api.DropCarsApi
import in.dropcars.app.data.model.CityResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CityRepository @Inject constructor(
    private val api: DropCarsApi
) {
    private var cachedCities: List<CityResponse> = emptyList()

    suspend fun getCities(): Result<List<CityResponse>> {
        if (cachedCities.isNotEmpty()) {
            return Result.success(cachedCities)
        }

        return runCatching {
            val cities = api.getCities()
            cachedCities = cities
            cities
        }
    }
}
